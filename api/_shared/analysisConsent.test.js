import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  analysisConsentPurposes,
  computeCanonicalImageHash,
  computeCanonicalImageManifest,
  isAllowedAnalysisConsentPurpose,
  isAnalysisConsentSecretConfigured,
  issueAnalysisConsentToken,
  verifyAnalysisConsentToken,
} from './analysisConsent.js'

const TEST_SECRET = 'a'.repeat(40)
const SHORT_SECRET = 'too-short-secret'
const USER_ID = 'user-123'
const ENVIRONMENTS = ['development', 'test', 'preview', 'production', undefined]

const frontBytes = Buffer.from([1, 2, 3, 4, 5])
const sideBytes = Buffer.from([6, 7, 8])
const backBytes = Buffer.from([9, 9, 9])

const bodyEntries = [
  { bytes: frontBytes, label: 'front' },
  { bytes: sideBytes, label: 'side' },
  { bytes: backBytes, label: 'back' },
]

function issueValidToken(overrides = {}) {
  const imageHash = overrides.imageHash || computeCanonicalImageHash(bodyEntries)
  return issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    purpose: analysisConsentPurposes.bodyAnalysis,
    userId: USER_ID,
    ...overrides,
    imageHash,
  })
}

/** Mirrors api/_shared/analysisConsent.js's internal encode+sign so tests
 * can hand-build a token with an arbitrary payload (expired, future-dated,
 * tampered) without exporting internals from the module under test. */
function encodeToken(payload, secret = TEST_SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function verify(overrides = {}) {
  const issued = overrides.issued || issueValidToken()
  return verifyAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageEntries: bodyEntries,
    purpose: analysisConsentPurposes.bodyAnalysis,
    token: issued.token,
    userId: USER_ID,
    ...overrides,
  })
}

describe('isAllowedAnalysisConsentPurpose', () => {
  it('allows only the current allowlist', () => {
    expect(isAllowedAnalysisConsentPurpose(analysisConsentPurposes.bodyAnalysis)).toBe(true)
    expect(isAllowedAnalysisConsentPurpose(analysisConsentPurposes.nutritionPhotoAnalysis)).toBe(true)
  })

  it('rejects legacy meal-analysis, a future eye-recognition purpose and other unknown purposes', () => {
    expect(isAllowedAnalysisConsentPurpose('meal-analysis')).toBe(false)
    expect(isAllowedAnalysisConsentPurpose('eye-recognition')).toBe(false)
    expect(isAllowedAnalysisConsentPurpose('anything-else')).toBe(false)
    expect(isAllowedAnalysisConsentPurpose('')).toBe(false)
    expect(isAllowedAnalysisConsentPurpose(undefined)).toBe(false)
  })
})

describe('isAnalysisConsentSecretConfigured', () => {
  it('requires a secret that meets the minimum length', () => {
    expect(isAnalysisConsentSecretConfigured({ ANALYSIS_CONSENT_SECRET: TEST_SECRET })).toBe(true)
    expect(isAnalysisConsentSecretConfigured({ ANALYSIS_CONSENT_SECRET: SHORT_SECRET })).toBe(false)
    expect(isAnalysisConsentSecretConfigured({})).toBe(false)
  })

  it('is not affected by NODE_ENV - there is no environment-based bypass', () => {
    for (const NODE_ENV of ENVIRONMENTS) {
      expect(isAnalysisConsentSecretConfigured({ ANALYSIS_CONSENT_SECRET: TEST_SECRET, NODE_ENV })).toBe(true)
      expect(isAnalysisConsentSecretConfigured({ ANALYSIS_CONSENT_SECRET: SHORT_SECRET, NODE_ENV })).toBe(false)
    }
  })
})

describe('computeCanonicalImageManifest / computeCanonicalImageHash', () => {
  it('is deterministic for the same bytes and labels', () => {
    expect(computeCanonicalImageHash(bodyEntries)).toBe(computeCanonicalImageHash(bodyEntries))
  })

  it('changes when any one image changes', () => {
    const changed = [{ bytes: Buffer.from([1, 2, 3, 4, 6]), label: 'front' }, bodyEntries[1], bodyEntries[2]]
    expect(computeCanonicalImageHash(changed)).not.toBe(computeCanonicalImageHash(bodyEntries))
  })

  it('changes when the order of the body images changes', () => {
    const reordered = [bodyEntries[1], bodyEntries[0], bodyEntries[2]]
    expect(computeCanonicalImageHash(reordered)).not.toBe(computeCanonicalImageHash(bodyEntries))
  })

  it('cannot be structurally collided by a different front/side/back split of the same total bytes', () => {
    // Same nine bytes (1..9), split differently across the three labelled
    // slots. Raw concatenation would hash identically for both splits; the
    // labelled, length-prefixed manifest must not.
    const splitA = [
      { bytes: Buffer.from([1, 2]), label: 'front' },
      { bytes: Buffer.from([3, 4, 5, 6]), label: 'side' },
      { bytes: Buffer.from([7, 8, 9]), label: 'back' },
    ]
    const splitB = [
      { bytes: Buffer.from([1, 2, 3, 4]), label: 'front' },
      { bytes: Buffer.from([5, 6]), label: 'side' },
      { bytes: Buffer.from([7, 8, 9]), label: 'back' },
    ]
    expect(computeCanonicalImageHash(splitA)).not.toBe(computeCanonicalImageHash(splitB))
  })

  it('requires a label on every entry', () => {
    expect(() => computeCanonicalImageManifest([{ bytes: frontBytes, label: '' }])).toThrow()
  })
})

describe('issueAnalysisConsentToken', () => {
  it('fails closed when the secret is missing or too short, in every environment', () => {
    for (const NODE_ENV of ENVIRONMENTS) {
      expect(issueValidToken({ env: { ANALYSIS_CONSENT_SECRET: '', NODE_ENV } }).ok).toBe(false)
      expect(issueValidToken({ env: { ANALYSIS_CONSENT_SECRET: SHORT_SECRET, NODE_ENV } }).ok).toBe(false)
    }
  })

  it('rejects unknown or disallowed purposes, including a future eye-recognition purpose', () => {
    expect(issueValidToken({ purpose: 'eye-recognition' }).ok).toBe(false)
    expect(issueValidToken({ purpose: 'meal-analysis' }).ok).toBe(false)
  })

  it('rejects a missing user id', () => {
    expect(issueValidToken({ userId: '' }).ok).toBe(false)
  })

  it('rejects a malformed image hash', () => {
    expect(issueValidToken({ imageHash: 'not-a-hash' }).ok).toBe(false)
  })

  it('issues a token that expires at most two minutes from now', () => {
    const before = Date.now()
    const issued = issueValidToken()
    expect(issued.ok).toBe(true)
    expect(typeof issued.token).toBe('string')
    expect(issued.expiresAt - before).toBeGreaterThan(0)
    expect(issued.expiresAt - before).toBeLessThanOrEqual(2 * 60 * 1000 + 1000)
  })
})

describe('verifyAnalysisConsentToken', () => {
  it('accepts a valid token for the correct user, purpose and images', () => {
    expect(verify().ok).toBe(true)
  })

  it('rejects a missing token', () => {
    expect(verify({ token: '' }).ok).toBe(false)
    expect(verify({ token: undefined }).ok).toBe(false)
  })

  it('rejects an invalid signature', () => {
    const issued = issueValidToken()
    const [payload] = issued.token.split('.')
    const tampered = `${payload}.${Buffer.from('not-a-real-signature').toString('base64url')}`
    expect(verify({ token: tampered }).ok).toBe(false)
  })

  it('rejects a tampered payload even though the signature format is valid', () => {
    const issued = issueValidToken()
    const [encodedPayload] = issued.token.split('.')
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    // Re-sign a payload with a different subject - simulates an attacker
    // who can forge a signature only if they also know the server secret;
    // this proves verification checks the *signed* subject, not any
    // client-supplied one.
    const tamperedToken = encodeToken({ ...decoded, sub: 'someone-else' })
    expect(verify({ token: tamperedToken }).ok).toBe(false)
  })

  it('rejects the wrong user', () => {
    expect(verify({ userId: 'a-different-user' }).ok).toBe(false)
  })

  it('rejects the wrong image', () => {
    const otherEntries = [{ bytes: Buffer.from([0]), label: 'front' }, bodyEntries[1], bodyEntries[2]]
    expect(verify({ imageEntries: otherEntries }).ok).toBe(false)
  })

  it('rejects a different front/side/back order of the same images', () => {
    const reordered = [bodyEntries[1], bodyEntries[0], bodyEntries[2]]
    expect(verify({ imageEntries: reordered }).ok).toBe(false)
  })

  it('rejects the wrong purpose', () => {
    expect(verify({ purpose: analysisConsentPurposes.nutritionPhotoAnalysis }).ok).toBe(false)
  })

  it('rejects unknown purposes such as eye-recognition', () => {
    expect(verify({ purpose: 'eye-recognition' }).ok).toBe(false)
  })

  it('rejects an expired token', () => {
    const now = Date.now()
    const token = encodeToken({
      exp: now - 1000,
      iat: now - 2000,
      imageHash: computeCanonicalImageHash(bodyEntries),
      jti: 'test-jti-expired',
      purpose: analysisConsentPurposes.bodyAnalysis,
      sub: USER_ID,
      v: 1,
    })
    const result = verify({ token })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('rejects a token whose issuedAt is unreasonably far in the future', () => {
    const iat = Date.now() + 10 * 60 * 1000
    const token = encodeToken({
      exp: iat + 60 * 1000,
      iat,
      imageHash: computeCanonicalImageHash(bodyEntries),
      jti: 'test-jti-future',
      purpose: analysisConsentPurposes.bodyAnalysis,
      sub: USER_ID,
      v: 1,
    })
    const result = verify({ token })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('issued_in_future')
  })

  it('rejects a missing or too-short secret, in every environment (no NODE_ENV bypass)', () => {
    for (const NODE_ENV of ENVIRONMENTS) {
      expect(verify({ env: { ANALYSIS_CONSENT_SECRET: '', NODE_ENV } }).ok).toBe(false)
      expect(verify({ env: { ANALYSIS_CONSENT_SECRET: SHORT_SECRET, NODE_ENV } }).ok).toBe(false)
    }
  })

  it('stays fully active when NODE_ENV is "test" - security must never be disabled in the test environment', () => {
    const issued = issueValidToken()
    expect(verify({ env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET, NODE_ENV: 'test' }, issued }).ok).toBe(true)
    expect(verify({ env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET, NODE_ENV: 'test' }, issued, userId: 'wrong-user' }).ok).toBe(false)
  })

  it('a valid token allows the exact analysis request it was issued for', () => {
    const issued = issueValidToken()
    const result = verifyAnalysisConsentToken({
      env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
      imageEntries: bodyEntries,
      purpose: analysisConsentPurposes.bodyAnalysis,
      token: issued.token,
      userId: USER_ID,
    })
    expect(result.ok).toBe(true)
    expect(result.payload.sub).toBe(USER_ID)
    expect(result.payload.purpose).toBe(analysisConsentPurposes.bodyAnalysis)
  })

  it('documents, rather than prevents, that the same token can verify more than once within its lifetime - jti is carried but not checked against any store, because no persistent store exists in this sprint', () => {
    const issued = issueValidToken()
    const first = verify({ issued })
    const second = verify({ issued })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
  })
})
