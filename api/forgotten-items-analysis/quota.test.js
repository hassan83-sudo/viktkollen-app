import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'
import { resetAiRequestDeduperForTests } from '../_shared/aiRequestDeduper.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { installAiEyeBillingTestRuntime, setAiEyeBillingRuntimeForTests } from '../_shared/billing/aiEyeLiveBilling.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { createInMemoryPlanAssignmentStore } from '../../src/services/billing/planAssignment.js'
import { createQuotaEngine } from '../../src/services/billing/quotaEngine.js'
import { createInMemoryUsageRepository } from '../../src/services/billing/usageRepository.js'

const TEST_SECRET = 'a'.repeat(40)
const FREE_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const SERVER_PLAN_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const REPLAY_USER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
const FAILURE_USER = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const requestedItems = [{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }]

function multipartBody(fields = {}) {
  const boundary = 'eye-boundary'
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="items"\r\n\r\n${JSON.stringify(requestedItems)}\r\n`, 'latin1'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n`, 'latin1'),
    pngBytes,
    Buffer.from('\r\n', 'latin1'),
  ]
  const fieldParts = Object.entries(fields).map(([fieldName, value]) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"\r\n\r\n${value}\r\n`,
    'latin1',
  ))
  return Buffer.concat([...parts, ...fieldParts, Buffer.from(`--${boundary}--\r\n`, 'latin1')])
}

function consentToken(userId) {
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: pngBytes, label: 'image' }]),
    purpose: analysisConsentPurposes.forgottenItemsAnalysis,
    userId,
  })
  expect(issued.ok).toBe(true)
  return issued.token
}

function createRequest({ attemptId = '', fields = {}, userId }) {
  const request = Readable.from([multipartBody(fields)])
  request.method = 'POST'
  request.headers = {
    authorization: 'Bearer valid-token',
    'content-type': 'multipart/form-data; boundary=eye-boundary',
    'x-viktkollen-consent-token': consentToken(userId),
    ...(attemptId ? { 'x-viktkollen-request-id': attemptId } : {}),
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

async function callRoute(options) {
  const response = createResponse()
  await handler(createRequest(options), response)
  return response
}

function stubAiSuccess() {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      items: [{ status: 'identified' }, { status: 'not_confirmed' }],
    }),
  }), { status: 200 }))
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

const spoofFields = {
  ai_eye_requests: '1500',
  plan_id: 'plan.prelim.sek.month.99',
  price: '99',
  quota: '1500',
  remaining: '1500',
  usage: '0',
}

describe('ai.eye.analysis server quota', () => {
  const originalEnv = { ...process.env }
  let currentUser = FREE_USER
  let runtime

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ANALYSIS_CONSENT_SECRET: TEST_SECRET,
      FORGOTTEN_ITEMS_RATE_LIMIT_MAX: '80',
      OPENAI_API_KEY: 'test-key',
    }
    delete process.env.NUTRITION_PHOTO_MODEL
    delete process.env.OPENAI_MODEL
    delete process.env.OPENAI_MAX_OUTPUT_TOKENS
    delete process.env.NUTRITION_PHOTO_MAX_OUTPUT_TOKENS
    currentUser = FREE_USER
    runtime = installAiEyeBillingTestRuntime()
    resetAiRequestDeduperForTests()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: currentUser } }))
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('real OpenAI calls are forbidden in BILL-6B3C1')
    }))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetAiRequestDeduperForTests()
    setAiRateLimitAdapterForTests()
    setAiEyeBillingRuntimeForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  async function snapshot(userId) {
    return runtime.quota.inspectQuota({
      clientClaim: { plan_id: 'plan.prelim.sek.month.99', remaining: 9999 },
      feature: 'ai.eye.analysis',
      unit: 'requests',
      userId,
    })
  }

  it('allows free requests 1-25 and denies the next before the provider', async () => {
    const fetchImpl = stubAiSuccess()
    const reserveSpy = vi.spyOn(runtime.quota, 'reserveQuota')
    currentUser = FREE_USER

    for (let index = 1; index <= 25; index += 1) {
      const response = await callRoute({
        attemptId: `free-eye-${String(index).padStart(2, '0')}`,
        fields: spoofFields,
        userId: FREE_USER,
      })
      expect(response.statusCode).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.source).toBe('remote')
      expect(response.body.result.items).toEqual([
        { id: 'phone', status: 'identified' },
        { id: 'keys', status: 'not_confirmed' },
      ])
    }

    const denied = await callRoute({
      attemptId: 'free-eye-26',
      fields: spoofFields,
      userId: FREE_USER,
    })

    expect(denied.statusCode).toBe(429)
    expect(denied.body.ok).toBe(false)
    expect(denied.body.error.code).toBe('RATE_LIMITED')
    expect(denied.body.error.retryable).toBe(true)
    expect(denied.body.result).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(25)
    expect(reserveSpy).toHaveBeenCalledTimes(25)
    const quota = await snapshot(FREE_USER)
    expect(quota.remaining).toBe(0)
    expect(quota.used).toBe(25)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(25)
    expect(events.every((event) => event.feature === 'ai.eye.analysis' && event.event_type === 'ai.eye.analysis' && event.quantity === 1)).toBe(true)
    const billingBlob = JSON.stringify(events)
    expect(billingBlob).not.toMatch(/data:image|base64|test-key|valid-token|Mobil|Nycklar|har jag glömt/i)
    expect(billingBlob).not.toContain(pngBytes.toString('base64'))
    const providerBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(providerBody.model).toBe('gpt-4.1-mini')
    expect(providerBody.max_output_tokens).toBe(500)
    expect(providerBody.store).toBe(false)
    expect(providerBody.input[0].content[1].detail).toBe('low')
  })

  it('uses the server plan when the client claims the free quota is already exhausted', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const assignments = createInMemoryPlanAssignmentStore()
    await assignments.set({
      plan_id: 'plan.prelim.sek.month.04',
      plan_version: 1,
      source: 'server',
      user_id: SERVER_PLAN_USER,
    })
    const quota = createQuotaEngine({ assignments, usageRepository })
    runtime = installAiEyeBillingTestRuntime({ quota, usageRepository })
    const fetchImpl = stubAiSuccess()
    currentUser = SERVER_PLAN_USER
    const clientClaimsFreeExhausted = {
      plan_id: 'plan.free',
      price: '0',
      remaining: '0',
      usage: '25',
    }

    for (let index = 1; index <= 26; index += 1) {
      const response = await callRoute({
        attemptId: `server-eye-${String(index).padStart(2, '0')}`,
        fields: clientClaimsFreeExhausted,
        userId: SERVER_PLAN_USER,
      })
      expect(response.statusCode).toBe(200)
      expect(response.body.source).toBe('remote')
    }

    expect(fetchImpl).toHaveBeenCalledTimes(26)
    const after = await runtime.quota.inspectQuota({
      clientClaim: { plan_id: 'plan.free', remaining: 0 },
      feature: 'ai.eye.analysis',
      unit: 'requests',
      userId: SERVER_PLAN_USER,
    })
    expect(after.used).toBe(26)
    expect(after.remaining).toBe(14)
  })

  it('does not double-consume quota or dispatch the provider on replay', async () => {
    const fetchImpl = stubAiSuccess()
    const reserveSpy = vi.spyOn(runtime.quota, 'reserveQuota')
    currentUser = REPLAY_USER
    const first = await callRoute({
      attemptId: 'replay-eye-0001',
      userId: REPLAY_USER,
    })
    const second = await callRoute({
      attemptId: 'replay-eye-0001',
      fields: spoofFields,
      userId: REPLAY_USER,
    })

    expect(first.statusCode).toBe(200)
    expect(first.body.ok).toBe(true)
    expect(first.body.source).toBe('remote')
    expect(second.statusCode).toBe(409)
    expect(second.body.error.code).toBe('STALE_REQUEST')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(reserveSpy).toHaveBeenCalledTimes(1)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].feature).toBe('ai.eye.analysis')
    const quota = await snapshot(REPLAY_USER)
    expect(quota.used).toBe(1)
    expect(quota.remaining).toBe(24)
  })

  it('keeps one quota unit after a provider failure and does not dispatch the replay', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('upstream down')
    })
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FAILURE_USER

    const failed = await callRoute({
      attemptId: 'eye-failure-01',
      userId: FAILURE_USER,
    })
    const replay = await callRoute({
      attemptId: 'eye-failure-01',
      userId: FAILURE_USER,
    })

    expect(failed.statusCode).toBe(502)
    expect(failed.body.ok).toBe(false)
    expect(failed.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(failed.body.result).toBeUndefined()
    expect(replay.statusCode).toBe(409)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].feature).toBe('ai.eye.analysis')
    expect(JSON.stringify(events)).not.toMatch(/data:image|upstream down|Mobil|test-key|valid-token/)
    const quota = await snapshot(FAILURE_USER)
    expect(quota.used).toBe(1)
    expect(quota.remaining).toBe(24)
  })

  it('does not consume quota when the provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FREE_USER

    const response = await callRoute({ userId: FREE_USER })

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(fetchImpl).not.toHaveBeenCalled()
    const quota = await snapshot(FREE_USER)
    expect(quota.used).toBe(0)
    expect(quota.remaining).toBe(25)
    expect(await runtime.usageRepository.list()).toHaveLength(0)
  })

  it('fails closed before the provider when billing runtime is unavailable', async () => {
    setAiEyeBillingRuntimeForTests({ ok: false, code: 'DURABLE_STORE_UNAVAILABLE' })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FREE_USER

    const response = await callRoute({ userId: FREE_USER })

    expect(response.statusCode).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
