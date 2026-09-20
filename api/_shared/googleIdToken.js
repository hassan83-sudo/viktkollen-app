import { createSign } from 'node:crypto'

/**
 * Server-only Google-supported ID-token minting for calling a PRIVATE Cloud
 * Run service (roles/run.invoker) from a Vercel function, without any Google
 * client library dependency.
 *
 * Method: the documented service-account "self-signed JWT with
 * target_audience" flow. A JWT signed with the service-account private key
 * (RS256) is exchanged at https://oauth2.googleapis.com/token for an OpenID
 * Connect ID token whose audience is the Cloud Run service URL.
 *
 * The credential is read ONLY from a server-side environment variable
 * (AI_EAR_GCP_SERVICE_ACCOUNT_JSON, plain JSON or base64 JSON). It is never
 * logged, never returned and never prefixed VITE_. Errors thrown here carry a
 * short generic code only - never the key, the JWT, the token or Google's
 * response body.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CLOCK_SKEW_SECONDS = 60
const MIN_REMAINING_SECONDS = 120
const cache = new Map()

function fail(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

export function parseServiceAccount(raw) {
  const text = String(raw || '').trim()
  if (!text) throw fail('google_credentials_missing')

  let json = text
  if (!text.startsWith('{')) {
    try {
      json = Buffer.from(text, 'base64').toString('utf8')
    } catch {
      throw fail('google_credentials_invalid')
    }
  }

  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    throw fail('google_credentials_invalid')
  }

  if (typeof parsed?.client_email !== 'string' || typeof parsed?.private_key !== 'string'
    || !parsed.client_email.includes('@') || !parsed.private_key.includes('PRIVATE KEY')) {
    throw fail('google_credentials_invalid')
  }

  return { clientEmail: parsed.client_email, privateKey: parsed.private_key }
}

export function buildSignedAssertion({ audience, clientEmail, now = Date.now(), privateKey }) {
  const issuedAt = Math.floor(now / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(JSON.stringify({
    aud: TOKEN_ENDPOINT,
    exp: issuedAt + 3600,
    iat: issuedAt,
    iss: clientEmail,
    sub: clientEmail,
    target_audience: audience,
  }))
  const signingInput = `${header}.${claims}`

  let signature
  try {
    signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey)
  } catch {
    throw fail('google_credentials_invalid')
  }

  return `${signingInput}.${base64Url(signature)}`
}

function readTokenExpiry(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return Number(payload.exp) || 0
  } catch {
    return 0
  }
}

/**
 * @returns {Promise<string>} an ID token for `audience`
 * @throws Error with `.code` in: google_credentials_missing, google_credentials_invalid,
 *   google_token_unavailable, google_token_invalid
 */
export async function getGoogleIdToken({
  audience,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  timeoutMs = 8000,
} = {}) {
  if (!audience) throw fail('google_audience_missing')

  const cached = cache.get(audience)
  if (cached && cached.exp - Math.floor(now / 1000) > MIN_REMAINING_SECONDS) return cached.token

  const { clientEmail, privateKey } = parseServiceAccount(env.AI_EAR_GCP_SERVICE_ACCOUNT_JSON)
  const assertion = buildSignedAssertion({ audience, clientEmail, now, privateKey })

  let response
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      body: new URLSearchParams({
        assertion,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw fail('google_token_unavailable')
  }

  if (!response.ok) throw fail('google_token_unavailable')

  let payload
  try {
    payload = await response.json()
  } catch {
    throw fail('google_token_invalid')
  }
  const idToken = payload?.id_token
  if (typeof idToken !== 'string' || idToken.split('.').length !== 3) throw fail('google_token_invalid')

  const exp = readTokenExpiry(idToken) || (Math.floor(now / 1000) + 3600 - CLOCK_SKEW_SECONDS)
  cache.set(audience, { exp, token: idToken })
  return idToken
}

export function clearGoogleIdTokenCacheForTests() {
  cache.clear()
}
