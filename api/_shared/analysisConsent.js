import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Server-issued, HMAC-SHA256 signed, short-lived analysis consent tokens.
 *
 * IMPORTANT, honest scope of what this proves: a valid token proves that an
 * authenticated client, after the app's own visible UI approval step (the
 * "Godkann och analysera"-style control), asked THIS server for permission
 * to send a specific image (identified by its canonical hash) to a named
 * analysis purpose, and that the server issued that permission a short time
 * ago. It is a self-consistency and authorization check, not cryptographic
 * proof that a human clicked anything - the UI-approval claim in the
 * issuance request is a client-supplied flag. It cannot be more than that
 * without attesting the client software itself. What it DOES guarantee:
 * the token cannot be forged (HMAC), cannot be reused for a different
 * image, user, or purpose, and expires quickly (max 2 minutes).
 *
 * No Supabase table, migration, RLS policy, cron job, or persistent
 * consent log is introduced in this module. See the replay-risk note on
 * verifyAnalysisConsentToken below.
 */

const TOKEN_VERSION = 1
// Hard cap - issueAnalysisConsentToken never issues a token that outlives
// this, and verifyAnalysisConsentToken independently rejects anything
// claiming a longer lifetime even if somehow signed correctly.
const MAX_TOKEN_TTL_MS = 2 * 60 * 1000
// Small forward clock-skew allowance for issuedAt only.
const MAX_ISSUED_AT_FUTURE_SKEW_MS = 30 * 1000
// HMAC-SHA256 key strength floor. Enforced in every environment - there is
// no NODE_ENV bypass for this check.
const MIN_SECRET_LENGTH = 32

const HEX64_PATTERN = /^[a-f0-9]{64}$/i

/**
 * Central, strict allowlist of analysis purposes this consent system will
 * ever issue or verify a token for. A future feature (e.g. an "Ogat"
 * camera/recognition purpose) must be added here explicitly before it can
 * work at all - until then, verifyAnalysisConsentToken and
 * issueAnalysisConsentToken both refuse any unlisted purpose automatically.
 *
 * Legacy meal-analysis is deliberately NOT listed: today's legacy photo
 * flow (api/meal-analysis, src/services/mealAnalysisService.js) has no
 * visible, explicit UI consent step, so it must stay unable to obtain or
 * use a token at all rather than being wired to a hidden auto-approval.
 */
export const analysisConsentPurposes = Object.freeze({
  bodyAnalysis: 'body-analysis',
  nutritionPhotoAnalysis: 'nutrition-photo-analysis',
})

const allowedPurposes = new Set(Object.values(analysisConsentPurposes))

export function isAllowedAnalysisConsentPurpose(purpose) {
  return typeof purpose === 'string' && allowedPurposes.has(purpose)
}

// --- canonical image hashing -------------------------------------------

/**
 * Builds an unambiguous canonical manifest string for one or more images:
 * a fixed-order, labelled, length-prefixed list of per-image hashes. This
 * is deliberately NOT a raw byte concatenation - concatenating
 * front+side+back bytes directly would let structurally different image
 * splits hash identically (e.g. moving trailing bytes from one image to
 * the next can reproduce the same concatenated byte stream). Labelling
 * each entry with its own length and hash makes that kind of collision
 * structurally impossible: the manifest can only be read back one way.
 *
 * @param {Array<{label: string, bytes: Buffer|Uint8Array}>} entries in the
 *   exact required order (e.g. front, side, back for body analysis)
 * @returns {string}
 */
export function computeCanonicalImageManifest(entries) {
  const list = Array.isArray(entries) ? entries : [entries]

  const parts = list.map((entry) => {
    const label = String(entry?.label || '')
    if (!label) {
      throw new TypeError('computeCanonicalImageManifest: every entry needs a label')
    }
    const raw = entry?.bytes
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || [])
    const hash = createHash('sha256').update(buffer).digest('hex')
    return `${label}:${buffer.length}:${hash}`
  })

  return `v1|${parts.join('|')}`
}

/**
 * @param {Array<{label: string, bytes: Buffer|Uint8Array}>} entries
 * @returns {string} lowercase hex sha256 of the canonical manifest
 */
export function computeCanonicalImageHash(entries) {
  return createHash('sha256').update(computeCanonicalImageManifest(entries), 'utf8').digest('hex')
}

// --- secret handling ------------------------------------------------------

function getConsentSecret(env = process.env) {
  const secret = String(env.ANALYSIS_CONSENT_SECRET || '')
  return secret.length >= MIN_SECRET_LENGTH ? secret : ''
}

/**
 * Whether a usable (present and long enough) ANALYSIS_CONSENT_SECRET is
 * configured. This check applies uniformly in every environment
 * (development, test, preview, production) - there is no NODE_ENV bypass.
 * A missing or too-short secret makes both token issuance and token
 * verification fail closed with a generic error; there is no fallback to
 * unsigned metadata.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isAnalysisConsentSecretConfigured(env = process.env) {
  return Boolean(getConsentSecret(env))
}

// --- base64url helpers ------------------------------------------------

function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8')
  return buffer.toString('base64url')
}

function base64UrlDecodeToBuffer(value) {
  return Buffer.from(String(value || ''), 'base64url')
}

// --- issuance ------------------------------------------------------------

/**
 * Issues a short-lived, signed analysis consent token.
 *
 * Callers (the token-issuance route only) are responsible for having
 * already verified: a valid Supabase-authenticated user, an allowed
 * purpose, and an explicit client-supplied claim that the visible UI
 * consent step was completed. This function itself does not re-check the
 * "UI approved" claim - it only signs what it is given.
 *
 * @param {{env?: NodeJS.ProcessEnv, imageHash: string, purpose: string, userId: string}} options
 * @returns {{ok: true, expiresAt: number, token: string} | {ok: false, reason: string}}
 */
export function issueAnalysisConsentToken({ env = process.env, imageHash, purpose, userId } = {}) {
  const secret = getConsentSecret(env)
  if (!secret) {
    return { ok: false, reason: 'secret_not_configured' }
  }
  if (!isAllowedAnalysisConsentPurpose(purpose)) {
    return { ok: false, reason: 'purpose_not_allowed' }
  }
  if (!userId || typeof userId !== 'string') {
    return { ok: false, reason: 'missing_user' }
  }
  if (!HEX64_PATTERN.test(String(imageHash || ''))) {
    return { ok: false, reason: 'invalid_image_hash' }
  }

  const now = Date.now()
  const payload = {
    exp: now + MAX_TOKEN_TTL_MS,
    iat: now,
    imageHash: String(imageHash).toLowerCase(),
    // Included for forward compatibility and documentation of intent only.
    // See the module-level replay note: without a persistent store this
    // does NOT give real single-use protection.
    jti: randomBytes(16).toString('hex'),
    purpose,
    sub: userId,
    v: TOKEN_VERSION,
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = createHmac('sha256', secret).update(encodedPayload).digest()

  return {
    expiresAt: payload.exp,
    ok: true,
    token: `${encodedPayload}.${base64UrlEncode(signature)}`,
  }
}

// --- verification ----------------------------------------------------------

/**
 * Verifies a consent token before an analysis route is allowed to proceed
 * to mock-fallback or a real AI provider call.
 *
 * Active in every environment (development, test, preview, production) -
 * there is no NODE_ENV bypass. Tests must inject a real, valid-length test
 * secret via `env` rather than relying on the check being skipped.
 *
 * REPLAY, STATED TRANSPARENTLY: no Supabase table or other persistent
 * store is introduced in this sprint, so `jti` is carried in the token for
 * future use but is NOT checked against any store here - this function
 * gives no real single-use/replay protection. In practice this means the
 * same token could technically be reused for up to its remaining lifetime
 * (at most two minutes), but only by the same authenticated user, for the
 * same purpose, against the exact same image payload (the canonical hash
 * must match bit-for-bit) - it cannot be replayed for a different image,
 * a different purpose, or a different user.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   imageEntries: Array<{label: string, bytes: Buffer|Uint8Array}>,
 *   purpose: string,
 *   token: string,
 *   userId: string,
 * }} options
 * @returns {{ok: true, payload: object} | {ok: false, reason: string}}
 */
export function verifyAnalysisConsentToken({ env = process.env, imageEntries, purpose, token, userId } = {}) {
  const secret = getConsentSecret(env)
  if (!secret) {
    return { ok: false, reason: 'secret_not_configured' }
  }

  if (!isAllowedAnalysisConsentPurpose(purpose)) {
    return { ok: false, reason: 'purpose_not_allowed' }
  }

  const raw = String(token || '')
  const dotIndex = raw.indexOf('.')
  if (dotIndex <= 0 || dotIndex === raw.length - 1) {
    return { ok: false, reason: 'malformed' }
  }

  const encodedPayload = raw.slice(0, dotIndex)
  const encodedSignature = raw.slice(dotIndex + 1)

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest()

  let providedSignature
  try {
    providedSignature = base64UrlDecodeToBuffer(encodedSignature)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  let payload
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(encodedPayload).toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'malformed' }
  }
  if (payload.v !== TOKEN_VERSION) {
    return { ok: false, reason: 'invalid_version' }
  }
  if (!isAllowedAnalysisConsentPurpose(payload.purpose)) {
    return { ok: false, reason: 'purpose_not_allowed' }
  }
  if (payload.purpose !== purpose) {
    return { ok: false, reason: 'purpose_mismatch' }
  }
  if (!userId || typeof payload.sub !== 'string' || payload.sub !== userId) {
    return { ok: false, reason: 'user_mismatch' }
  }
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: 'malformed' }
  }

  const now = Date.now()

  if (payload.iat > now + MAX_ISSUED_AT_FUTURE_SKEW_MS) {
    return { ok: false, reason: 'issued_in_future' }
  }
  if (payload.exp - payload.iat > MAX_TOKEN_TTL_MS + 1000) {
    return { ok: false, reason: 'ttl_too_long' }
  }
  if (now > payload.exp) {
    return { ok: false, reason: 'expired' }
  }

  if (typeof payload.imageHash !== 'string' || !HEX64_PATTERN.test(payload.imageHash)) {
    return { ok: false, reason: 'malformed' }
  }

  let expectedImageHash
  try {
    expectedImageHash = computeCanonicalImageHash(imageEntries)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (payload.imageHash.toLowerCase() !== expectedImageHash) {
    return { ok: false, reason: 'image_mismatch' }
  }

  return { ok: true, payload }
}
