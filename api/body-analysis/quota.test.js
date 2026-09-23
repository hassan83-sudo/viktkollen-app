import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { installBodyScanBillingTestRuntime, setBodyScanBillingRuntimeForTests } from '../_shared/billing/bodyScanLiveBilling.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { createInMemoryPlanAssignmentStore } from '../../src/services/billing/planAssignment.js'
import { createQuotaEngine } from '../../src/services/billing/quotaEngine.js'
import { createInMemoryUsageRepository } from '../../src/services/billing/usageRepository.js'

const TEST_SECRET = 'test-analysis-consent-secret-32-plus'
const FREE_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SERVER_PLAN_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REPLAY_USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const FAILURE_USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const SENTINEL = 'QUOTA_SENTINEL_SUMMARY'

function consentToken(userId) {
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([
      { bytes: pngBytes, label: 'front' },
      { bytes: pngBytes, label: 'side' },
      { bytes: pngBytes, label: 'back' },
    ]),
    purpose: analysisConsentPurposes.bodyAnalysis,
    userId,
  })
  expect(issued.ok).toBe(true)
  return issued.token
}

function multipartBody(fields = {}) {
  const boundary = 'body-boundary'
  const parts = ['frontImage', 'sideImage', 'backImage'].map((fieldName) => Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fieldName}.png"\r\nContent-Type: image/png\r\n\r\n`, 'latin1'),
    pngBytes,
    Buffer.from('\r\n', 'latin1'),
  ]))
  const fieldParts = Object.entries(fields).map(([fieldName, value]) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"\r\n\r\n${value}\r\n`,
    'latin1',
  ))
  return Buffer.concat([
    ...parts,
    ...fieldParts,
    Buffer.from(`--${boundary}--\r\n`, 'latin1'),
  ])
}

function createRequest({ attemptId = '', fields = {}, userId }) {
  const request = Readable.from([multipartBody(fields)])
  request.method = 'POST'
  request.headers = {
    authorization: 'Bearer valid-token',
    'content-type': 'multipart/form-data; boundary=body-boundary',
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
  const fetchImpl = vi.fn(async () => ({
    json: async () => ({
      output_text: JSON.stringify({
        confidence: 'low',
        summary: SENTINEL,
      }),
    }),
    ok: true,
  }))
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

const spoofFields = {
  body_scan_requests: '150',
  history: '',
  localHistoryCleared: 'true',
  plan_id: 'plan.prelim.sek.month.99',
  quota: '150',
  remaining: '150',
  usage: '0',
}

describe('body.scan server quota', () => {
  const originalEnv = { ...process.env }
  let currentUser = FREE_USER
  let runtime

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ANALYSIS_CONSENT_SECRET: TEST_SECRET,
      BODY_ANALYSIS_RATE_LIMIT_MAX: '30',
      OPENAI_API_KEY: 'test-key',
    }
    delete process.env.BODY_ANALYSIS_ALLOW_MOCK
    currentUser = FREE_USER
    runtime = installBodyScanBillingTestRuntime()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: currentUser } }))
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('real OpenAI calls are forbidden in BILL-6B3B1')
    }))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAiRateLimitAdapterForTests()
    setBodyScanBillingRuntimeForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  async function snapshot(userId) {
    return runtime.quota.inspectQuota({
      clientClaim: { plan_id: 'plan.prelim.sek.month.99', remaining: 999 },
      feature: 'body.scan',
      unit: 'requests',
      userId,
    })
  }

  it('allows free requests 1-3 and denies the next before the provider', async () => {
    const fetchImpl = stubAiSuccess()
    const reserveSpy = vi.spyOn(runtime.quota, 'reserveQuota')
    currentUser = FREE_USER

    for (let index = 1; index <= 3; index += 1) {
      const response = await callRoute({
        attemptId: `free-body-scan-${index}`,
        fields: spoofFields,
        userId: FREE_USER,
      })
      expect(response.statusCode).toBe(200)
      expect(response.body.source).toBe('ai')
      expect(response.body.summary).toBe(SENTINEL)
      expect(response.body.sourceReason).toBe('ai_success')
      expect(response.body.ok).toBeUndefined()
      expect(JSON.stringify(response.body)).not.toMatch(/data:image|test-key/)
    }

    const denied = await callRoute({
      attemptId: 'free-body-scan-4',
      fields: spoofFields,
      userId: FREE_USER,
    })

    expect(denied.statusCode).toBe(429)
    expect(denied.body.ok).toBe(false)
    expect(denied.body.error.code).toBe('RATE_LIMITED')
    expect(denied.body.error.retryable).toBe(true)
    expect(denied.body.summary).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(reserveSpy).toHaveBeenCalledTimes(3)
    const quota = await snapshot(FREE_USER)
    expect(quota.remaining).toBe(0)
    expect(quota.used).toBe(3)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(3)
    expect(events.every((event) => event.feature === 'body.scan' && event.event_type === 'body.scan' && event.quantity === 1)).toBe(true)
    expect(JSON.stringify(events)).not.toMatch(/data:image|base64|QUOTA_SENTINEL_SUMMARY|input_text|test-key/)
    expect(JSON.stringify(events)).not.toContain(pngBytes.toString('base64'))
    const providerBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(providerBody.store).toBe(false)
  })

  it('uses the server plan when the client claims a smaller remaining balance', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const assignments = createInMemoryPlanAssignmentStore()
    await assignments.set({
      plan_id: 'plan.prelim.sek.month.04',
      plan_version: 1,
      source: 'server',
      user_id: SERVER_PLAN_USER,
    })
    const quota = createQuotaEngine({ assignments, usageRepository })
    runtime = installBodyScanBillingTestRuntime({ quota, usageRepository })
    const fetchImpl = stubAiSuccess()
    currentUser = SERVER_PLAN_USER
    const clientClaimsFreeExhausted = {
      plan_id: 'plan.free',
      remaining: '0',
      usage: '3',
    }

    for (let index = 1; index <= 4; index += 1) {
      const response = await callRoute({
        attemptId: `server-plan-${index}`,
        fields: clientClaimsFreeExhausted,
        userId: SERVER_PLAN_USER,
      })
      expect(response.statusCode).toBe(200)
      expect(response.body.source).toBe('ai')
    }

    const denied = await callRoute({
      attemptId: 'server-plan-5',
      fields: { ...clientClaimsFreeExhausted, remaining: '999' },
      userId: SERVER_PLAN_USER,
    })
    expect(denied.statusCode).toBe(429)
    expect(denied.body.error.code).toBe('RATE_LIMITED')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    const after = await runtime.quota.inspectQuota({
      feature: 'body.scan',
      unit: 'requests',
      userId: SERVER_PLAN_USER,
    })
    expect(after.used).toBe(4)
    expect(after.remaining).toBe(0)
  })

  it('does not double-consume quota or dispatch the provider on replay', async () => {
    const fetchImpl = stubAiSuccess()
    const reserveSpy = vi.spyOn(runtime.quota, 'reserveQuota')
    currentUser = REPLAY_USER
    const first = await callRoute({
      attemptId: 'replay-body-scan-01',
      userId: REPLAY_USER,
    })
    const second = await callRoute({
      attemptId: 'replay-body-scan-01',
      fields: { history: '', localHistoryCleared: 'true' },
      userId: REPLAY_USER,
    })

    expect(first.statusCode).toBe(200)
    expect(first.body.source).toBe('ai')
    expect(second.statusCode).toBe(409)
    expect(second.body.error.code).toBe('STALE_REQUEST')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(reserveSpy).toHaveBeenCalledTimes(1)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].feature).toBe('body.scan')
    const quota = await snapshot(REPLAY_USER)
    expect(quota.used).toBe(1)
    expect(quota.remaining).toBe(2)
  })

  it('keeps quota after a provider failure and does not dispatch the replay', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('upstream down')
    })
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FAILURE_USER

    const failed = await callRoute({
      attemptId: 'body-failure-01',
      userId: FAILURE_USER,
    })
    const replay = await callRoute({
      attemptId: 'body-failure-01',
      userId: FAILURE_USER,
    })

    expect(failed.statusCode).toBe(200)
    expect(failed.body.source).toBe('mock')
    expect(replay.statusCode).toBe(409)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].feature).toBe('body.scan')
    expect(JSON.stringify(events)).not.toMatch(/data:image|upstream down|input_text/)
    const quota = await snapshot(FAILURE_USER)
    expect(quota.used).toBe(1)
    expect(quota.remaining).toBe(2)
  })

  it('blocks the production mock after dispatch and still consumes one request', async () => {
    process.env.NODE_ENV = 'production'
    const fetchImpl = vi.fn(async () => {
      throw new Error('upstream down')
    })
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FAILURE_USER

    const failed = await callRoute({
      attemptId: 'body-prod-failure-01',
      userId: FAILURE_USER,
    })

    expect(failed.statusCode).toBe(503)
    expect(failed.body.ok).toBe(false)
    expect(failed.body.error.safeMessage).toContain('Inget demoresultat')
    expect(failed.body.summary).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const quota = await snapshot(FAILURE_USER)
    expect(quota.used).toBe(1)
  })

  it('does not consume quota when the provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FREE_USER

    const response = await callRoute({ userId: FREE_USER })

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('mock')
    expect(response.body.sourceReason).toBe('missing_api_key')
    expect(fetchImpl).not.toHaveBeenCalled()
    const quota = await snapshot(FREE_USER)
    expect(quota.used).toBe(0)
    expect(quota.remaining).toBe(3)
    expect(await runtime.usageRepository.list()).toHaveLength(0)
  })

  it('fails closed before the provider when billing runtime is unavailable', async () => {
    setBodyScanBillingRuntimeForTests({ ok: false, code: 'DURABLE_STORE_UNAVAILABLE' })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    currentUser = FREE_USER

    const response = await callRoute({ userId: FREE_USER })

    expect(response.statusCode).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
