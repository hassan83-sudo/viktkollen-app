import { supabase } from './supabaseClient.js'

const encryptedBackupFormat = 'viktkollen-backup-aes-gcm-v1'
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

export async function getBackupEncryptionKey() {
  if (!supabase) throw new Error('Supabase är inte konfigurerat.')

  const { data, error } = await supabase.rpc('viktkollen_get_or_create_backup_key')
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('Backupnyckeln kunde inte hämtas.')

  return crypto.subtle.importKey(
    'raw',
    fromBase64(data),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncryptedBackupPayload(payload) {
  return Boolean(
    payload
    && payload.format === encryptedBackupFormat
    && typeof payload.ciphertext === 'string'
    && typeof payload.iv === 'string',
  )
}

export async function encryptBackupPayload(payload) {
  const key = await getBackupEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  )

  return {
    ciphertext: toBase64(ciphertext),
    format: encryptedBackupFormat,
    iv: toBase64(iv),
  }
}

export async function decryptBackupPayload(payload, encryptionKey = null) {
  if (!isEncryptedBackupPayload(payload)) return payload

  const key = encryptionKey || await getBackupEncryptionKey()
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext),
  )

  return JSON.parse(decoder.decode(plaintext))
}

export { encryptedBackupFormat }
