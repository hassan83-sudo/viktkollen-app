export const encryptedSocialMessageFormat = 'viktkollen-social-message-aes-cbc-hmac-v1'

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
  const parts = values.map((value) => value instanceof Uint8Array ? value : new Uint8Array(value))
  const joined = new Uint8Array(parts.reduce((size, value) => size + value.byteLength, 0))
  let offset = 0
  parts.forEach((value) => {
    joined.set(value, offset)
    offset += value.byteLength
  })
  return joined
}

async function importKeys(rawKey) {
  const [encryptionKey, authenticationKey] = await Promise.all([
    crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', rawKey, { hash: 'SHA-256', name: 'HMAC' }, false, ['sign', 'verify']),
  ])
  return { authenticationKey, encryptionKey }
}

export async function getConversationEncryptionKeys(client, conversationId) {
  const { data, error } = await client.rpc('social_get_conversation_key', {
    p_conversation_id: conversationId,
  })
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('Chattnyckeln kunde inte hämtas.')
  return importKeys(fromBase64(data))
}

export function isEncryptedSocialMessage(body) {
  if (typeof body !== 'string' || !body) return false
  try {
    const payload = JSON.parse(body)
    return Boolean(
      payload?.format === encryptedSocialMessageFormat
      && typeof payload.ciphertext === 'string'
      && typeof payload.iv === 'string'
      && typeof payload.mac === 'string',
    )
  } catch {
    return false
  }
}

function authenticatedBytes(conversationId, messageId, iv, ciphertext) {
  return concatBytes(encoder.encode(`${conversationId}:${messageId}`), iv, ciphertext)
}

export async function encryptSocialMessage(text, { client, conversationId, keys = null, messageId }) {
  const resolvedKeys = keys || await getConversationEncryptionKeys(client, conversationId)
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { iv, name: 'AES-CBC' },
    resolvedKeys.encryptionKey,
    encoder.encode(text),
  ))
  const mac = await crypto.subtle.sign(
    'HMAC',
    resolvedKeys.authenticationKey,
    authenticatedBytes(conversationId, messageId, iv, ciphertext),
  )
  return JSON.stringify({
    ciphertext: toBase64(ciphertext),
    format: encryptedSocialMessageFormat,
    iv: toBase64(iv),
    mac: toBase64(mac),
  })
}

export async function decryptSocialMessage(body, { client, conversationId, keys = null, messageId }) {
  if (!isEncryptedSocialMessage(body)) throw new Error('Meddelandet är inte krypterat.')
  const payload = JSON.parse(body)
  const resolvedKeys = keys || await getConversationEncryptionKeys(client, conversationId)
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)
  const valid = await crypto.subtle.verify(
    'HMAC',
    resolvedKeys.authenticationKey,
    fromBase64(payload.mac),
    authenticatedBytes(conversationId, messageId, iv, ciphertext),
  )
  if (!valid) throw new Error('Meddelandets integritetskontroll misslyckades.')
  const plaintext = await crypto.subtle.decrypt(
    { iv, name: 'AES-CBC' },
    resolvedKeys.encryptionKey,
    ciphertext,
  )
  return decoder.decode(plaintext)
}
