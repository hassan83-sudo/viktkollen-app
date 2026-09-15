import { supabase } from '../supabaseClient.js'

export const encryptedSyncItemFormat = 'viktkollen-sync-aes-cbc-hmac-v1'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(value) {
  let binary = ''
  new Uint8Array(value).forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function concatBytes(...values) {
  const bytes = values.map((value) => value instanceof Uint8Array ? value : new Uint8Array(value))
  const result = new Uint8Array(bytes.reduce((size, value) => size + value.byteLength, 0))
  let offset = 0
  bytes.forEach((value) => {
    result.set(value, offset)
    offset += value.byteLength
  })
  return result
}

async function importKeys(rawKey) {
  const [encryptionKey, authenticationKey] = await Promise.all([
    crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', rawKey, { hash: 'SHA-256', name: 'HMAC' }, false, ['sign', 'verify']),
  ])
  return { authenticationKey, encryptionKey }
}

export async function getSyncItemEncryptionKeys(client = supabase) {
  if (!client) throw new Error('Supabase är inte konfigurerat.')

  const { data, error } = await client.rpc('viktkollen_get_or_create_backup_key')
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('Synknyckeln kunde inte hämtas.')

  return importKeys(fromBase64(data))
}

export function isEncryptedSyncItemPayload(payload) {
  return Boolean(
    payload
    && payload.format === encryptedSyncItemFormat
    && typeof payload.ciphertext === 'string'
    && typeof payload.iv === 'string'
    && typeof payload.mac === 'string',
  )
}

function authenticatedBytes(storageKey, iv, ciphertext) {
  return concatBytes(encoder.encode(storageKey), iv, ciphertext)
}

export async function encryptSyncItemPayload(payload, storageKey, keys = null, client = supabase) {
  if (payload === null) return null

  const resolvedKeys = keys || await getSyncItemEncryptionKeys(client)
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { iv, name: 'AES-CBC' },
    resolvedKeys.encryptionKey,
    encoder.encode(JSON.stringify(payload)),
  ))
  const mac = await crypto.subtle.sign(
    'HMAC',
    resolvedKeys.authenticationKey,
    authenticatedBytes(storageKey, iv, ciphertext),
  )

  return {
    ciphertext: toBase64(ciphertext),
    format: encryptedSyncItemFormat,
    iv: toBase64(iv),
    mac: toBase64(mac),
  }
}

export async function decryptSyncItemPayload(payload, storageKey, keys = null, client = supabase) {
  if (!isEncryptedSyncItemPayload(payload)) return payload

  const resolvedKeys = keys || await getSyncItemEncryptionKeys(client)
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)
  const valid = await crypto.subtle.verify(
    'HMAC',
    resolvedKeys.authenticationKey,
    fromBase64(payload.mac),
    authenticatedBytes(storageKey, iv, ciphertext),
  )
  if (!valid) throw new Error('Synkpostens integritetskontroll misslyckades.')

  const plaintext = await crypto.subtle.decrypt(
    { iv, name: 'AES-CBC' },
    resolvedKeys.encryptionKey,
    ciphertext,
  )
  return JSON.parse(decoder.decode(plaintext))
}
