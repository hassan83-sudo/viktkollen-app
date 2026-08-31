/**
 * Client-side half of the two-step, server-issued consent-token flow
 * verified by api/_shared/analysisConsent.js and issued by
 * api/analysis-consent/index.js.
 *
 * IMPORTANT - what this proves and what it does not:
 * Every exported function here requires an explicit `consentApproved ===
 * true` argument supplied by the caller, and refuses to make any network
 * request at all when that argument is missing or falsy. This module must
 * only ever be called from inside the real UI approval event handler for
 * an analysis flow (e.g. the "Godkänn och analysera" button in
 * BodyAnalysisPrivacy.jsx / BodyAnalysisCard.jsx's handleApproveAnalysis,
 * or the remote-consent gate inside NutritionScannerV2.jsx's
 * analyzeImage()). It never infers, assumes or fabricates that approval
 * itself.
 *
 * A resulting token is proof that an authenticated client asked the
 * server for permission for one exact image and purpose after that
 * visible UI step ran - it is NOT, and must never be described as,
 * cryptographic proof that a human clicked. The server cannot see the
 * click; see api/_shared/analysisConsent.js for the same caveat
 * server-side.
 *
 * The purpose values and canonical-hash algorithm below must stay in sync
 * with api/_shared/analysisConsent.js's analysisConsentPurposes /
 * computeCanonicalImageManifest / computeCanonicalImageHash. Legacy
 * meal-photo analysis has no visible, explicit consent step in the
 * current UI (see PhotoAnalysis.jsx) and therefore intentionally has NO
 * purpose value here - nothing in this module can ever request a token
 * for it, and src/services/mealAnalysisService.js must never import from
 * this module. The same is true for any future "Ögat" / eye-recognition
 * flow: it is not, and must never be, added to analysisConsentPurposes.
 */
export const analysisConsentPurposes = Object.freeze({
  bodyAnalysis: 'body-analysis',
  nutritionPhotoAnalysis: 'nutrition-photo-analysis',
})

const allowedPurposes = new Set(Object.values(analysisConsentPurposes))
const CONSENT_TOKEN_ENDPOINT = '/api/analysis-consent'

/**
 * Dedicated header used to transport the consent token to the analysis
 * routes. The token must never be sent as a FormData field, a JSON body
 * field, a URL or a query parameter.
 */
export const analysisConsentTokenHeaderName = 'x-viktkollen-consent-token'

const HEX_ALPHABET = '0123456789abcdef'

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ''

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]
    hex += HEX_ALPHABET[(byte >> 4) & 0x0f] + HEX_ALPHABET[byte & 0x0f]
  }

  return hex
}

async function toArrayBuffer(source) {
  if (!source) return new ArrayBuffer(0)
  if (source instanceof ArrayBuffer) return source
  if (ArrayBuffer.isView(source)) {
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return source.arrayBuffer()
  }
  if (typeof source === 'string') {
    const commaIndex = source.indexOf(',')
    const base64 = source.startsWith('data:') && commaIndex >= 0 ? source.slice(commaIndex + 1) : source
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return bytes.buffer
  }

  throw new TypeError('Okänd bildkälla för samtyckeshash.')
}

function assertSubtleCryptoAvailable() {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Säker hashning stöds inte i den här webbläsaren.')
  }
}

/**
 * Normalizes one-or-many image sources into labelled { label, buffer }
 * entries in the caller-supplied order. Multi-image callers (body scan)
 * pass `[{ label, source }, ...]` with explicit fixed-order view labels;
 * a single image (or an unlabelled array) defaults every entry to the
 * label "image", matching the single-image server routes.
 *
 * @param {Array<{label: string, source: *}>|Array<*>|File|Blob|ArrayBuffer|Uint8Array|string} images
 */
async function toImageEntries(images) {
  const list = Array.isArray(images) ? images : [images]
  const isLabelled = list.length > 0 && list.every((item) => item && typeof item === 'object' && 'label' in item && 'source' in item)

  if (isLabelled) {
    const entries = []
    for (const item of list) {
      entries.push({ buffer: await toArrayBuffer(item.source), label: String(item.label) })
    }
    return entries
  }

  const entries = []
  for (const image of list) {
    if (!image) continue
    entries.push({ buffer: await toArrayBuffer(image), label: 'image' })
  }
  return entries
}

/**
 * Computes the same fixed-order, length-prefixed, labelled manifest
 * string as the server's computeCanonicalImageManifest, so client-issued
 * hashes match server-verified hashes exactly. A labelled manifest
 * (rather than raw byte concatenation) prevents two different
 * front/side/back splits from being able to collide into the same byte
 * stream.
 */
async function computeCanonicalImageManifest(entries) {
  assertSubtleCryptoAvailable()
  const parts = []

  for (const entry of entries) {
    if (!entry.label) throw new TypeError('computeCanonicalImageManifest: every entry needs a label')
    const digest = await crypto.subtle.digest('SHA-256', entry.buffer)
    parts.push(`${entry.label}:${entry.buffer.byteLength}:${bufferToHex(digest)}`)
  }

  return `v1|${parts.join('|')}`
}

async function computeCanonicalImageHashFromEntries(entries) {
  assertSubtleCryptoAvailable()
  const manifest = await computeCanonicalImageManifest(entries)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(manifest))
  return bufferToHex(digest)
}

/**
 * Public helper mirroring the server's computeCanonicalImageHash, for
 * callers that need to pre-compute a hash for any reason. Normal usage
 * goes through requestAnalysisConsentToken directly, which computes the
 * hash internally.
 */
export async function computeClientCanonicalImageHash(images) {
  return computeCanonicalImageHashFromEntries(await toImageEntries(images))
}

/**
 * Requests a short-lived, server-issued, HMAC-signed consent token for one
 * exact image (or fixed-order set of images) and purpose.
 *
 * This refuses to perform ANY network request unless `consentApproved ===
 * true` is passed explicitly by the caller, and unless `purpose` is one
 * of the allowlisted analysisConsentPurposes - both checks happen before
 * anything is hashed or fetched. Callers must only ever pass
 * `consentApproved: true` from inside the real UI approval event handler.
 *
 * @param {object} params
 * @param {string} params.authorizationHeader - current Supabase bearer header
 * @param {boolean} params.consentApproved - must be exactly `true`
 * @param {Array<{label: string, source: *}>|File|Blob|ArrayBuffer|Uint8Array|string} params.images
 * @param {string} params.purpose - one of analysisConsentPurposes
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{expiresAt: number, imageHash: string, token: string}>}
 */
export async function requestAnalysisConsentToken({ authorizationHeader, consentApproved, images, purpose, signal } = {}) {
  if (consentApproved !== true) {
    throw new Error('consent_not_approved')
  }
  if (!allowedPurposes.has(purpose)) {
    throw new Error('purpose_not_allowed')
  }
  if (!authorizationHeader) {
    throw new Error('auth_required')
  }

  const entries = await toImageEntries(images)
  if (entries.length === 0) {
    throw new Error('image_required')
  }
  const imageHash = await computeCanonicalImageHashFromEntries(entries)

  let response
  try {
    response = await fetch(CONSENT_TOKEN_ENDPOINT, {
      body: JSON.stringify({ imageHash, purpose, uiConsentApproved: true }),
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    })
  } catch {
    throw new Error('consent_token_network_error')
  }

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!response.ok || !json?.ok || typeof json.token !== 'string' || !json.token) {
    throw new Error('consent_token_denied')
  }

  return { expiresAt: json.expiresAt, imageHash, token: json.token }
}

/**
 * Attaches a previously issued consent token to a plain headers object as
 * a dedicated header - never as a FormData field, JSON body field, URL or
 * query parameter. The token is only ever held in a local variable for
 * the duration of the current analysis call; nothing in this module
 * writes it (or the image hash) to storage, console, or any log.
 *
 * @param {object} headers
 * @param {string} token
 */
export function withAnalysisConsentTokenHeader(headers, token) {
  return {
    ...headers,
    [analysisConsentTokenHeaderName]: token,
  }
}
