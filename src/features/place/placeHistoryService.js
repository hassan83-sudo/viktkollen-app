import { supabase } from '../../services/supabaseClient.js'

export const placeHistoryRetentionChoices = Object.freeze([
  { minutes: 0, label: 'Direkt' },
  { minutes: 60, label: '1 timme' },
  { minutes: 120, label: '2 timmar' },
  { minutes: 360, label: '6 timmar' },
  { minutes: 1440, label: '24 timmar' },
  { minutes: 10080, label: '7 dagar' },
  { minutes: 43200, label: '30 dagar' },
])

const allowedRetentionMinutes = new Set(placeHistoryRetentionChoices.map((choice) => choice.minutes))
const cryptoDbName = 'viktkollen-place-crypto-v1'
const cryptoStoreName = 'keys'

function bytesToBase64(bytes) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function openCryptoDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Säker nyckellagring stöds inte på den här enheten.'))
      return
    }

    const request = indexedDB.open(cryptoDbName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(cryptoStoreName)) db.createObjectStore(cryptoStoreName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Kunde inte öppna säker nyckellagring.'))
  })
}

async function getStoredKey(keyId) {
  const db = await openCryptoDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(cryptoStoreName, 'readonly')
    const request = tx.objectStore(cryptoStoreName).get(keyId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('Kunde inte läsa krypteringsnyckeln.'))
    tx.oncomplete = () => db.close()
  })
}

async function storeKey(keyId, key) {
  const db = await openCryptoDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(cryptoStoreName, 'readwrite')
    tx.objectStore(cryptoStoreName).put(key, keyId)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Kunde inte spara krypteringsnyckeln.')) }
  })
}

async function getOrCreateBaseKey(userId) {
  if (!globalThis.crypto?.subtle) throw new Error('Kryptering stöds inte på den här enheten.')

  const keyId = `place-history:${userId}`
  const stored = await getStoredKey(keyId)
  if (stored) return stored

  const secret = crypto.getRandomValues(new Uint8Array(32))
  const key = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveKey'])
  await storeKey(keyId, key)
  return key
}

async function deriveRowKey(baseKey, salt) {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function getSignedInUserId() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session?.user?.id || null
}

export async function loadPlaceHistoryRetention() {
  if (!supabase) return { minutes: 0, error: new Error('Supabase är inte tillgängligt.') }
  const userId = await getSignedInUserId()
  if (!userId) return { minutes: 0, error: new Error('Du behöver vara inloggad.') }

  const { data, error } = await supabase
    .from('place_location_history_settings')
    .select('retention_minutes')
    .eq('user_id', userId)
    .maybeSingle()

  return { minutes: data?.retention_minutes ?? 0, error: error || null }
}

export async function setPlaceHistoryRetention(minutes) {
  if (!supabase) return { error: new Error('Supabase är inte tillgängligt.') }
  const normalized = Number(minutes)
  if (!allowedRetentionMinutes.has(normalized)) return { error: new Error('Ogiltig lagringstid.') }

  const { error } = await supabase.rpc('viktkollen_set_place_history_retention', {
    target_minutes: normalized,
  })
  return { error: error || null }
}

export async function recordEncryptedPlaceHistoryPoint({
  userId,
  familyId,
  latitude,
  longitude,
  accuracyMeters = null,
  recordedAt,
}) {
  if (!supabase || !userId || !familyId) return { stored: false }

  const { minutes, error: settingsError } = await loadPlaceHistoryRetention()
  if (settingsError || minutes === 0) return { stored: false, error: settingsError || null }

  const baseKey = await getOrCreateBaseKey(userId)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const rowKey = await deriveRowKey(baseKey, salt)
  const payload = new TextEncoder().encode(JSON.stringify({
    latitude,
    longitude,
    accuracyMeters,
    recordedAt,
  }))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rowKey, payload)
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString()

  const { error } = await supabase.from('place_location_history').insert({
    family_id: familyId,
    user_id: userId,
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv_b64: bytesToBase64(iv),
    salt_b64: bytesToBase64(salt),
    share_with_family: false,
    expires_at: expiresAt,
  })

  return { stored: !error, error: error || null }
}

export async function loadOwnPlaceHistory() {
  if (!supabase) return { data: [], error: new Error('Supabase är inte tillgängligt.') }
  const userId = await getSignedInUserId()
  if (!userId) return { data: [], error: new Error('Du behöver vara inloggad.') }

  const { data, error } = await supabase
    .from('place_location_history')
    .select('id,ciphertext,iv_b64,salt_b64,created_at,expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { data: [], error }
  if (!data?.length) return { data: [], error: null }

  const baseKey = await getOrCreateBaseKey(userId)
  const decoded = await Promise.all(data.map(async (row) => {
    try {
      const salt = base64ToBytes(row.salt_b64)
      const iv = base64ToBytes(row.iv_b64)
      const rowKey = await deriveRowKey(baseKey, salt)
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        rowKey,
        base64ToBytes(row.ciphertext),
      )
      const payload = JSON.parse(new TextDecoder().decode(plain))
      return { ...row, ...payload, locked: false }
    } catch {
      return { id: row.id, created_at: row.created_at, expires_at: row.expires_at, locked: true }
    }
  }))

  return { data: decoded, error: null }
}
