import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { createImageFingerprint, resetAiRequestDeduperForTests } from '../_shared/aiRequestDeduper.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'
import {
  createFoodScanOperationId,
  installFoodScanBillingTestRuntime,
  setFoodScanBillingRuntimeForTests,
} from '../_shared/billing/foodScanLiveBilling.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { ENFORCEMENT_DECISION, FEATURE_MODE, PROVIDER_MODE } from '../../src/services/billing/catalog.js'
import { createQuotaEngine } from '../../src/services/billing/quotaEngine.js'
import { createInMemoryUsageRepository } from '../../src/services/billing/usageRepository.js'
import { createPostgresUsageRepository } from '../../src/services/billing/usageRepositoryPostgres.js'

const TEST_SECRET = 'test-analysis-consent-secret-32-plus'
const USER_ID = 'a1111111-1111-4111-8111-111111111111'
const ATTEMPT = 'photo-attempt-5b2wire01'
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function consentHeaders(image = pngBytes) {
  process.env.ANALYSIS_CONSENT_SECRET = TEST_SECRET
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: image, label: 'image' }]),
    purpose: analysisConsentPurposes.nutritionPhotoAnalysis,
    userId: USER_ID,
  })
  return {
    'x-viktkollen-consent-token': issued.token,
    'x-viktkollen-request-id': ATTEMPT,
  }
}

function multipartBody({ image = pngBytes } = {}) {
  const boundary = 'test-boundary'
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="mealType"\r\n\r\nLunch\r\n`, 'latin1'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="meal.png"\r\nContent-Type: image/png\r\n\r\n`, 'latin1'),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
  ])
}

function createRequest({ body, headers = {}, token = 'valid-token' } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = 'POST'
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': 'multipart/form-data; boundary=test-boundary',
    ...headers,
  }
  request.socket = { remoteAddress: '127.0.0.1' }
  return request
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn((body) => {
      response.body = body
      return response
    }),
    setHeader: vi.fn((name, value) => {
      response.headers[name] = value
    }),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }
  return response
}

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

function successFetch() {
  return vi.fn(async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      detectedItems: [{ calories: 260, carbohydrates: 32, confidence: 'medium', fat: 10, name: 'Pizza', protein: 12 }],
      estimatedNutrition: {
        calories: { confidence: 'medium', max: 340, midpoint: 260, min: 210 },
        carbsG: { confidence: 'medium', max: 40, midpoint: 32, min: 24 },
        fatG: { confidence: 'medium', max: 16, midpoint: 10, min: 7 },
        proteinG: { confidence: 'medium', max: 18, midpoint: 12, min: 8 },
      },
      portionEstimate: { confidence: 'medium', description: 'Slice', gramsMax: 180, gramsMin: 110 },
      safeSummary: 'Uppskattad portion.',
    }),
    usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
  }), { status: 200 }))
}

function createFakeUsageClient(store = new Map()) {
  return {
    schema(name) {
      expect(name).toBe('billing')
      return {
        from() {
          return {
            insert(row) {
              return {
                select() {
                  return {
                    async maybeSingle() {
                      if (store.has(row.event_id)) {
                        return { data: null, error: { code: '23505' } }
                      }
                      store.set(row.event_id, { ...row })
                      return { data: row, error: null }
                    },
                  }
                },
              }
            },
            select() {
              return {
                eq(_column, id) {
                  return {
                    async maybeSingle() {
                      return { data: store.get(id) || null, error: null }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe('BILL-5B2 food.scan live canary wiring', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', ANALYSIS_CONSENT_SECRET: TEST_SECRET }
    resetAiRequestDeduperForTests()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token' ? { user: { id: USER_ID } } : { error: { message: 'invalid' } }
    ))
    installFoodScanBillingTestRuntime()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
    setFoodScanBillingRuntimeForTests(null)
  })

  it('unauthenticated requests do not call the provider', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), token: '', headers: consentHeaders() }))
    expect(response.statusCode).toBe(401)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('invalid consent does not call the provider', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: { 'x-viktkollen-consent-token': 'nope.nope', 'x-viktkollen-request-id': ATTEMPT },
    }))
    expect(response.statusCode).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('feature disabled does not call the provider', async () => {
    installFoodScanBillingTestRuntime({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.DISABLED,
        reason_code: 'MANUAL_ADMIN',
        version: 1,
      },
    })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('provider disabled does not call the provider', async () => {
    installFoodScanBillingTestRuntime({
      providerControls: [{
        configured: true,
        provider_id: 'openai',
        mode: PROVIDER_MODE.UNAVAILABLE,
        reason_code: 'PROVIDER_OUTAGE',
        version: 1,
      }],
    })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('entitlement denied does not call the provider', async () => {
    installFoodScanBillingTestRuntime({
      evaluate: async () => ({ allowed: false, decision: ENFORCEMENT_DECISION.DENY_ENTITLEMENT, warnings: [] }),
    })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('quota denied does not call the provider', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const quota = createQuotaEngine({ usageRepository })
    quota.inspectQuota = async () => ({ remaining: 0, status: 'DENIED_QUOTA_EXCEEDED' })
    installFoodScanBillingTestRuntime({ quota, usageRepository })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(429)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('cost-safety denied does not call the provider', async () => {
    installFoodScanBillingTestRuntime({
      selectedThresholds: [{
        amount_minor: 100,
        currency: 'SEK',
        feature_id: null,
        mode: 'HARD_STOP',
        period: 'DAILY',
        scope: 'GLOBAL',
        threshold_id: 'hard-global',
      }],
      summariesByKey: {
        'GLOBAL::DAILY': {
          amount_minor: 100,
          classification: 'ESTIMATED',
          currency: 'SEK',
          feature_id: null,
          period: 'DAILY',
          scope: 'GLOBAL',
        },
      },
    })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('durable store unavailable fails closed before provider', async () => {
    setFoodScanBillingRuntimeForTests({ ok: false, code: 'DURABLE_STORE_UNAVAILABLE' })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(503)
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('first valid dispatch calls provider once after durable CAS', async () => {
    const runtime = installFoodScanBillingTestRuntime()
    const fetchImpl = vi.fn(async () => {
      expect((await runtime.usageRepository.list())).toHaveLength(1)
      return successFetch()()
    })
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.analysis).toBeTruthy()
    expect(response.body.source).toBe('remote')
    expect(response.body.requestId).toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const gatewayId = fetchImpl.mock.calls[0][1].headers['X-Viktkollen-Request-Id']
    const operationId = createFoodScanOperationId({ clientAttemptId: ATTEMPT, userId: USER_ID })
    expect(gatewayId).toBe(operationId)
    expect(gatewayId).not.toBe(createImageFingerprint({ contentType: 'image/png', data: pngBytes, size: pngBytes.length }))
  })

  it('same operation retry after dispatch does not send a second provider fetch', async () => {
    const fetchImpl = successFetch()
    vi.stubGlobal('fetch', fetchImpl)
    const first = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    const second = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(409)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('two concurrent same-operation requests yield one provider fetch', async () => {
    const fetchImpl = successFetch()
    vi.stubGlobal('fetch', fetchImpl)
    const [left, right] = await Promise.all([
      callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() })),
      callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() })),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect([left.statusCode, right.statusCode].every((status) => status === 200 || status === 409)).toBe(true)
  })

  it('provider deterministic invalid JSON is not ok:true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output_text: 'not-json' }), { status: 200 })))
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBeGreaterThanOrEqual(502)
    expect(response.body.ok).not.toBe(true)
  })

  it('ambiguous provider 5xx stays unmeasured and does not invent invoice cost', async () => {
    const runtime = installFoodScanBillingTestRuntime()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })))
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(502)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].cost_basis).toBe('UNAVAILABLE')
    expect(events[0].metadata.usage_basis).toBe('UNAVAILABLE')
    expect(events[0].metadata.usage_basis).not.toBe('MEASURED')
  })

  it('false-dispatch window: CAS then no provider send on retry', async () => {
    const runtime = installFoodScanBillingTestRuntime()
    const operationId = createFoodScanOperationId({ clientAttemptId: ATTEMPT, userId: USER_ID })
    await runtime.quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: operationId,
      unit: 'requests',
      user: USER_ID,
    })
    const claimed = await runtime.operationStore.claimDispatch(operationId, { userId: USER_ID })
    expect(claimed.claimed).toBe(true)
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(fetchImpl).toHaveBeenCalledTimes(0)
    expect(response.statusCode).toBe(409)
    const inspect = await runtime.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId: USER_ID })
    expect(inspect.used).toBe(1)
  })

  it('gateway usage insert is a duplicate of the CAS event_id', async () => {
    const store = new Map()
    const usageRepository = createPostgresUsageRepository({ client: createFakeUsageClient(store) })
    const quota = createQuotaEngine({ usageRepository: createInMemoryUsageRepository() })
    installFoodScanBillingTestRuntime({ quota, usageRepository })
    const fetchImpl = successFetch()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), headers: consentHeaders() }))
    expect(response.statusCode).toBe(200)
    expect(store.size).toBe(1)
    const row = [...store.values()][0]
    expect(row.event_id).toBe(createFoodScanOperationId({ clientAttemptId: ATTEMPT, userId: USER_ID }))
    expect(row.cost_basis).toBe('UNAVAILABLE')
    expect(JSON.stringify(row)).not.toMatch(/base64|Lunch|consent|Bearer |test-key/)
  })

  it('spoofed client feature/user/plan/dispatch fields are ignored', async () => {
    const fetchImpl = successFetch()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: {
        ...consentHeaders(),
        'x-billing-feature': 'ai.text.request',
        'x-billing-user': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    }))
    expect(response.statusCode).toBe(200)
    const operationId = createFoodScanOperationId({ clientAttemptId: ATTEMPT, userId: USER_ID })
    expect(fetchImpl.mock.calls[0][1].headers['X-Viktkollen-Request-Id']).toBe(operationId)
  })
})
