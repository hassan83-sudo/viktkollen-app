import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './interpret/index.js'
import { getHummingQuotaConfig, setAiEarHummingQuotaForTests } from '../_shared/aiEarHumming.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { createQuotaEngine } from '../../src/services/billing/quotaEngine.js'

const TEST_SECRET = 'test-analysis-consent-secret-32-plus'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const ACCESS_KEY = 'test-acr-access-key'
const ACCESS_SECRET = 'test-acr-access-secret-SUPERSECRETVALUE'

function wavBytes(extra = 64) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + extra, 4)
  header.write('WAVE', 8, 'ascii')
  return Buffer.concat([header, Buffer.alloc(extra, 1)])
}

function consentHeader(audio) {
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: audio, label: 'image' }]),
    purpose: analysisConsentPurposes.aiEarHumming,
    userId: USER_ID,
  })
  expect(issued.ok).toBe(true)
  return { 'x-viktkollen-consent-token': issued.token }
}

function createRequest({ body = wavBytes(), contentType = 'audio/wav', headers = {}, method = 'POST', token = 'valid-token', withConsent = true } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.url = '/api/ai-ear/interpret?__vk_route=humming'
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
    ...(withConsent && body ? consentHeader(body) : {}),
    ...headers,
  }
  return request
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn(function json(body) { this.body = body; return this }),
    setHeader: vi.fn(function setHeader(name, value) { this.headers[name] = value }),
    status: vi.fn(function status(code) { this.statusCode = code; return this }),
  }
}

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

function hummingPayload(entries) {
  return { metadata: { humming: entries }, status: { code: 0, msg: 'Success' } }
}

function stubFetch(payload) {
  const fetchMock = vi.fn(async () => ({ json: async () => payload, ok: true, status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('POST /api/ai-ear/humming', () => {
  const originalEnv = { ...process.env }
  let quota

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = {
      ...originalEnv,
      ACRCLOUD_ACCESS_KEY: ACCESS_KEY,
      ACRCLOUD_ACCESS_SECRET: ACCESS_SECRET,
      ACRCLOUD_HOST: 'identify.example.test',
      ANALYSIS_CONSENT_SECRET: TEST_SECRET,
    }
    quota = createQuotaEngine()
    setAiEarHummingQuotaForTests(quota)
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: USER_ID } } : { error: { message: 'invalid' } }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setAiEarHummingQuotaForTests(undefined)
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
  })

  it('requires auth before a provider call or a quota reservation', async () => {
    const fetchMock = stubFetch(hummingPayload([]))
    const response = await callRoute(createRequest({ token: '' }))
    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.used).toBe(0)
    expect(snapshot.reserved).toBe(0)
  })

  it('rejects a non-WAV payload without calling ACRCloud', async () => {
    const fetchMock = stubFetch(hummingPayload([]))
    const response = await callRoute(createRequest({ body: Buffer.from('this is definitely not a wav file, just text.....') }))
    expect(response.statusCode).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized payload before the provider call', async () => {
    process.env.AI_EAR_HUMMING_MAX_BYTES = '80'
    const fetchMock = stubFetch(hummingPayload([]))
    const response = await callRoute(createRequest({ body: wavBytes(200) }))
    expect(response.statusCode).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns not configured and does not reserve quota when ACRCloud env is missing', async () => {
    delete process.env.ACRCLOUD_HOST
    delete process.env.ACRCLOUD_ACCESS_KEY
    delete process.env.ACRCLOUD_ACCESS_SECRET
    const fetchMock = stubFetch(hummingPayload([]))
    const response = await callRoute(createRequest())
    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(fetchMock).not.toHaveBeenCalled()
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.remaining).toBe(1)
  })

  it('rate limits before quota reservation and the provider call', async () => {
    setAiRateLimitAdapterForTests({
      consume: () => ({ limited: true, retryAfterSeconds: 9 }),
      type: 'test',
    })
    const fetchMock = stubFetch(hummingPayload([]))
    const response = await callRoute(createRequest())
    expect(response.statusCode).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.remaining).toBe(1)
  })

  it('reserves, returns title, artist and at most two alternatives, and commits the quota', async () => {
    const fetchMock = stubFetch(hummingPayload([
      { artists: [{ name: 'Artist A' }], title: 'Song A' },
      { artists: [{ name: 'Artist B' }], title: 'Song B' },
      { artists: [{ name: 'Artist C' }], title: 'Song C' },
      { artists: [{ name: 'Artist D' }], title: 'Song D' },
    ]))
    const response = await callRoute(createRequest())
    expect(response.statusCode).toBe(200)
    expect(response.body.result).toEqual({
      alternatives: [
        { artist: 'Artist B', title: 'Song B' },
        { artist: 'Artist C', title: 'Song C' },
      ],
      artist: 'Artist A',
      matched: true,
      title: 'Song A',
    })
    expect(JSON.stringify(response.body)).not.toContain(ACCESS_SECRET)
    expect(JSON.stringify(response.body)).not.toContain('signature')
    const form = fetchMock.mock.calls[0][1].body
    expect(form.get('access_key')).toBe(ACCESS_KEY)
    expect(String(form.get('signature'))).not.toContain(ACCESS_SECRET)
    for (const [, value] of form.entries()) expect(String(value)).not.toContain(ACCESS_SECRET)
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.used).toBe(1)
    expect(snapshot.remaining).toBe(0)
  })

  it('treats no match as a normal result and still commits the quota', async () => {
    stubFetch({ metadata: { humming: [] }, status: { code: 1001, msg: 'No result' } })
    const response = await callRoute(createRequest())
    expect(response.statusCode).toBe(200)
    expect(response.body.result).toEqual({ matched: false })
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.used).toBe(1)
  })

  it('returns quota exhausted without a second provider call', async () => {
    const fetchMock = stubFetch(hummingPayload([{ artists: [{ name: 'Artist A' }], title: 'Song A' }]))
    expect((await callRoute(createRequest())).statusCode).toBe(200)
    const denied = await callRoute(createRequest())
    expect(denied.statusCode).toBe(402)
    expect(denied.body.error.reason).toBe('quota_exceeded')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rolls the reservation back when the provider fails, so the quota can be used again', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: { code: 2004 } }), ok: true, status: 200 })
      .mockResolvedValueOnce({ json: async () => hummingPayload([{ artists: [{ name: 'Artist A' }], title: 'Song A' }]), ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const failed = await callRoute(createRequest())
    expect(failed.statusCode).toBe(502)
    const retried = await callRoute(createRequest())
    expect(retried.statusCode).toBe(200)
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.used).toBe(1)
    expect(snapshot.remaining).toBe(0)
  })

  it('rolls the reservation back on timeout', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn(async () => { throw timeout }))
    const response = await callRoute(createRequest())
    expect(response.statusCode).toBe(504)
    const snapshot = await quota.inspectQuota({ feature: 'ai.ear.humming', unit: 'requests', userId: USER_ID })
    expect(snapshot.remaining).toBe(1)
    expect(snapshot.reserved).toBe(0)
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain(ACCESS_SECRET)
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain(ACCESS_KEY)
  })

  it('fails closed before ACRCloud when the humming quota project is not configured', async () => {
    setAiEarHummingQuotaForTests(undefined)
    delete process.env.HUMMING_QUOTA_SUPABASE_URL
    delete process.env.HUMMING_QUOTA_SUPABASE_SERVICE_ROLE_KEY
    process.env.SUPABASE_URL = 'https://viktkollen.example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-service-role-must-not-be-used'
    const fetchMock = stubFetch(hummingPayload([]))
    const response = await callRoute(createRequest())
    expect(response.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads humming quota config only from the humming env names', () => {
    const source = readFileSync(new URL('../_shared/aiEarHumming.js', import.meta.url), 'utf8')
    const auth = readFileSync(new URL('../_shared/verifySupabaseUser.js', import.meta.url), 'utf8')
    expect(getHummingQuotaConfig({
      HUMMING_QUOTA_SUPABASE_SERVICE_ROLE_KEY: 'humming-role',
      HUMMING_QUOTA_SUPABASE_URL: 'https://staging.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'shared-role',
      SUPABASE_URL: 'https://viktkollen.example.supabase.co',
      VITE_SUPABASE_URL: 'https://vite.example.supabase.co',
    })).toEqual({
      serviceRoleKey: 'humming-role',
      url: 'https://staging.example.supabase.co',
    })
    expect(getHummingQuotaConfig({})).toEqual({ serviceRoleKey: '', url: '' })
    expect(source).not.toMatch(/createSupabaseAdminClient/)
    expect(auth).toContain('env.SUPABASE_URL || env.VITE_SUPABASE_URL')
    expect(auth).not.toContain('HUMMING_QUOTA')
  })

  it('keeps the launch humming quotas in the database migration and does not rewrite the other four', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/20261002120000_billing_humming_quota.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/do not apply to production/i)
    expect(sql).toContain("'ai.ear.humming'")
    expect(sql).toContain('billing.reserve_quota')
    expect(sql).toContain('usage_events_event_type_known')
    expect(sql).toContain("('plan.free', 'ai.ear.humming', true, 'NUMBER', 1, 'requests', 'PRELIMINARY')")
    expect(sql).toContain("('plan.prelim.sek.month.04', 'ai.ear.humming', true, 'NUMBER', 3, 'requests', 'PRELIMINARY')")
    expect(sql).toContain("('plan.prelim.sek.month.99', 'ai.ear.humming', true, 'NUMBER', 100, 'requests', 'PRELIMINARY')")
    expect(sql).not.toMatch(/food\.scan',\s*true,\s*'NUMBER',\s*5/)
  })
})
