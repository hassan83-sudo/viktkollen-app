import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSignedAssertion, clearGoogleIdTokenCacheForTests, getGoogleIdToken, parseServiceAccount } from './googleIdToken.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
})
const account = { client_email: 'hop@project.iam.gserviceaccount.com', private_key: privateKey }
const audience = 'https://perch-inference.example.run.app'

function idTokenWith(exp) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256' })}.${part({ aud: audience, exp })}.sig`
}

describe('Google ID-token minting for private Cloud Run', () => {
  beforeEach(() => clearGoogleIdTokenCacheForTests())

  it('signs an RS256 assertion with target_audience that verifies against the public key', () => {
    const jwt = buildSignedAssertion({ audience, clientEmail: account.client_email, now: 1_700_000_000_000, privateKey })
    const [header, claims, signature] = jwt.split('.')
    const decoded = JSON.parse(Buffer.from(claims, 'base64url').toString())

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decoded).toMatchObject({ aud: 'https://oauth2.googleapis.com/token', iss: account.client_email, sub: account.client_email, target_audience: audience })
    expect(decoded.exp - decoded.iat).toBe(3600)
    const verifier = createVerify('RSA-SHA256').update(`${header}.${claims}`)
    expect(verifier.verify(createPublicKey(publicKey), Buffer.from(signature, 'base64url'))).toBe(true)
  })

  it('accepts plain or base64 JSON credentials and rejects malformed ones with generic codes', () => {
    expect(parseServiceAccount(JSON.stringify(account)).clientEmail).toBe(account.client_email)
    expect(parseServiceAccount(Buffer.from(JSON.stringify(account)).toString('base64')).clientEmail).toBe(account.client_email)
    expect(() => parseServiceAccount('')).toThrow('google_credentials_missing')
    expect(() => parseServiceAccount('{"client_email":"x"}')).toThrow('google_credentials_invalid')
    expect(() => parseServiceAccount('not json at all')).toThrow('google_credentials_invalid')
  })

  it('exchanges the assertion for an ID token, caches it, and refreshes near expiry', async () => {
    const now = Date.now()
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ id_token: idTokenWith(Math.floor(now / 1000) + 3600) }), ok: true }))
    const env = { AI_EAR_GCP_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }

    const first = await getGoogleIdToken({ audience, env, fetchImpl, now })
    const second = await getGoogleIdToken({ audience, env, fetchImpl, now: now + 60_000 })
    expect(second).toBe(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await getGoogleIdToken({ audience, env, fetchImpl, now: now + 3600_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('never puts the key or Google error bodies into thrown errors', async () => {
    const env = { AI_EAR_GCP_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }
    const failing = vi.fn(async () => ({ json: async () => ({ error: 'invalid_grant', error_description: 'private detail' }), ok: false }))
    const error = await getGoogleIdToken({ audience, env, fetchImpl: failing }).catch((caught) => caught)

    expect(error.code).toBe('google_token_unavailable')
    expect(`${error.message} ${error.stack}`).not.toMatch(/invalid_grant|private detail|PRIVATE KEY/)
  })
})
