/**
 * Central, reusable, deny-by-default guard for outgoing sync/backup/export
 * payloads.
 *
 * This module is intentionally the ONLY place in the codebase that decides
 * whether image/media-shaped data is allowed to leave the device through a
 * non-analysis channel (cloud sync, cloud backup, data export). It never
 * looks at feature names or per-field denylists - it inspects the *shape*
 * of the data itself, so a brand new field (including a future "Ogat"
 * camera feature) is blocked automatically the moment it contains anything
 * that looks like an image, without any code change here.
 *
 * Detection is content-based first (File/Blob instances, data:image URIs,
 * blob: object URLs, raw binary buffers) and key-name-based second (a
 * defense-in-depth net for known image/photo/frame/preview style field
 * names, in case an image is ever represented as something other than the
 * shapes above, e.g. a plain string that is not yet base64/data-URI).
 *
 * Everything that is not recognised as media passes through unchanged -
 * this function must never delete or rewrite ordinary user data such as
 * weights, notes, check-ins or settings.
 */

const REDACTED_MARKER = null

// Field names that are explicitly known to be harmless metadata even
// though they may sit right next to an image field on the same record
// (e.g. a progress photo record has {id, date, view, image}). Matching one
// of these exact names means "never block this key based on its name" -
// content-based detection still applies to its value.
const SAFE_METADATA_KEYS = new Set([
  'id',
  'localId',
  'clientId',
  'recordId',
  'photoId',
  'imageId',
  'entryId',
  'date',
  'createdAt',
  'updatedAt',
  'takenAt',
  'capturedAt',
  'timestamp',
  'photoDate',
  'view',
  'viewType',
  'type',
  'kind',
  'source',
  'sourceReason',
  'filename',
  'fileName',
  'name',
  'label',
  'note',
  'notes',
  'weight',
  'unit',
])

// Key names that look like they hold (or could someday hold) image, video
// or raw camera data. This list exists purely as a second safety net -
// content-based detection below is what actually protects against
// *unknown* future keys, because it does not depend on a name at all.
const SUSPICIOUS_KEY_PATTERN =
  /photo|image|picture|avatar|snapshot|frame|preview|thumbnail|selfie|scan(?!ner)|video|media|capture|screenshot|blob|dataurl|dataUri/i

const DATA_IMAGE_URI_PATTERN = /^data:image\//i
const DATA_URI_ANY_PATTERN = /^data:[^;,]*;base64,/i
const BLOB_URL_PATTERN = /^blob:/i
// A long, pure-base64 string with no other context is treated as
// suspicious raw media if it also sits under a suspicious key name (see
// isSuspiciousKey below) - this is a secondary, key-assisted heuristic and
// never used to block unrelated short strings such as tokens or ids.
const RAW_BASE64_PATTERN = /^[a-zA-Z0-9+/]{200,}={0,2}$/

function looksLikeFileOrBlob(value) {
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  // Duck-typing fallback for cross-realm File/Blob-like objects (e.g. from
  // a different iframe/worker realm where instanceof fails).
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.arrayBuffer === 'function' &&
      typeof value.size === 'number' &&
      typeof value.type === 'string',
  )
}

function looksLikeRawBinary(value) {
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return true
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) return true
  return false
}

function isImageLikeString(value) {
  if (typeof value !== 'string') return false
  if (DATA_IMAGE_URI_PATTERN.test(value)) return true
  if (BLOB_URL_PATTERN.test(value)) return true
  return false
}

function isSuspiciousKey(key) {
  const normalized = String(key)
  if (SAFE_METADATA_KEYS.has(normalized)) return false
  return SUSPICIOUS_KEY_PATTERN.test(normalized)
}

/**
 * Recursively walks a value and strips anything that looks like image,
 * video or raw binary/camera data. Deny-by-default: unrecognised media
 * shapes are removed even if this function has never seen that field name
 * before. Non-media data (strings, numbers, booleans, dates, ordinary
 * nested objects/arrays) passes through unchanged.
 *
 * @param {*} value
 * @param {{depth?: number, parentKeySuspicious?: boolean}} [state]
 * @returns {*}
 */
export function sanitizeMediaPayload(value, state = {}) {
  const depth = state.depth || 0

  if (depth > 20) {
    // Safety valve against pathological/circular-ish structures. Real app
    // data never nests this deep, so this only ever triggers on malformed
    // input, which we treat conservatively.
    return REDACTED_MARKER
  }

  if (value == null) return value

  if (looksLikeFileOrBlob(value) || looksLikeRawBinary(value)) {
    return REDACTED_MARKER
  }

  if (typeof value === 'string') {
    if (isImageLikeString(value)) return REDACTED_MARKER
    if (DATA_URI_ANY_PATTERN.test(value)) return REDACTED_MARKER
    if (state.parentKeySuspicious && RAW_BASE64_PATTERN.test(value)) return REDACTED_MARKER
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeMediaPayload(item, { depth: depth + 1, parentKeySuspicious: state.parentKeySuspicious }),
    )
  }

  if (typeof value === 'object') {
    const output = {}

    for (const [key, entryValue] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue

      if (isSuspiciousKey(key)) {
        // Known-or-unknown image-shaped key name: only allow it through if
        // its value is itself a nested plain object we can keep sanitising
        // (e.g. a "photos" container object), otherwise deny outright.
        if (entryValue && typeof entryValue === 'object' && !looksLikeFileOrBlob(entryValue) && !looksLikeRawBinary(entryValue)) {
          output[key] = sanitizeMediaPayload(entryValue, { depth: depth + 1, parentKeySuspicious: true })
        } else {
          output[key] = REDACTED_MARKER
        }
        continue
      }

      output[key] = sanitizeMediaPayload(entryValue, { depth: depth + 1, parentKeySuspicious: false })
    }

    return output
  }

  return value
}

/**
 * Convenience helper for call sites that sanitize a whole map of
 * {storageKey: value} entries (backup/export payload builders).
 *
 * @param {Record<string, *>} valuesByKey
 * @returns {Record<string, *>}
 */
export function sanitizeMediaPayloadMap(valuesByKey) {
  if (!valuesByKey || typeof valuesByKey !== 'object') return valuesByKey

  return Object.fromEntries(
    Object.entries(valuesByKey).map(([key, value]) => [key, sanitizeMediaPayload(value)]),
  )
}
