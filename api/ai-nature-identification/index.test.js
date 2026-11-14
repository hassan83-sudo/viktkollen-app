import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'
import { setAiNatureBillingRuntimeForTests } from '../_shared/billing/aiNatureLiveBilling.js'

const originalSecret = process.env.ANALYSIS_CONSENT_SECRET
const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}
describe('AI Natur: avstängd funktion', () => {
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.ANALYSIS_CONSENT_SECRET
    else process.env.ANALYSIS_CONSENT_SECRET = originalSecret
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
    setAiNatureBillingRuntimeForTests(null)
    vi.restoreAllMocks()
  })

  it('nekar en giltigt inloggad användare med giltigt bildsamtycke innan AI-dispatch', async () => {
    process.env.ANALYSIS_CONSENT_SECRET = 'test-secret-longer-than-thirty-two-characters'
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'nature-test-user' } }))
    setAiRateLimitAdapterForTests({
      type: 'test',
      consume: ({ now, windowMs }) => ({ limited: false, remaining: 8, resetAt: now + windowMs }),
    })
    const imageHash = computeCanonicalImageHash([{ label: 'image', bytes: image }])
    const issued = issueAnalysisConsentToken({
      imageHash, purpose: 'ai-nature-identification', userId: 'nature-test-user',
    })
    expect(issued.ok).toBe(true)
    const executeProvider = vi.fn()
    setAiNatureBillingRuntimeForTests({
      ok: true,
      featureControl: { feature_id: 'ai.nature.identification', mode: 'DISABLED' },
      providerControls: [{ provider_id: 'openai', mode: 'ENABLED' }],
      executeProvider,
    })
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
        'x-viktkollen-consent-token': issued.token,
      },
      body: {
        mimeType: 'image/jpeg',
        imageBase64: image.toString('base64'),
      },
    }
    const res = response()
    await handler(req, res)
    expect(res.statusCode).toBe(503)
    expect(res.body?.error?.code).toBe('FEATURE_LOCKED')
    expect(executeProvider).not.toHaveBeenCalled()
  })
})
