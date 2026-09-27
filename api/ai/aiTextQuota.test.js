import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import aiHandler from './index.js'
import coachHandler from '../adaptive-coach/index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { resetAiRequestDeduperForTests } from '../_shared/aiRequestDeduper.js'
import { installAiTextBillingTestRuntime, setAiTextBillingRuntimeForTests } from '../_shared/billing/aiTextLiveBilling.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { FEATURE_MODE } from '../../src/services/billing/catalog.js'
import { DISPATCH_CAS_RESULT } from '../../src/services/billing/durableOperationStore.js'
import { LAUNCH_QUOTA_BY_PLAN } from '../../src/services/billing/commercialPlanMatrix.js'
import { resetMeteredLifecycleInflightForTests } from '../../src/services/billing/meteredOperationLifecycle.js'
import { createInMemoryPlanAssignmentStore } from '../../src/services/billing/planAssignment.js'
import { createQuotaEngine } from '../../src/services/billing/quotaEngine.js'
import { createInMemoryUsageRepository } from '../../src/services/billing/usageRepository.js'

// BILL-AI-TEXT-QUOTA-1: ai.text.request quota on /api/ai (all five OpenAI
// actions) and /api/adaptive-coach, through the existing durable metered
// lifecycle and quota engine. OpenAI is a fetch spy: every denial must leave
// it uncalled. Quotas come from the plan matrix and are not changed here.

const FREE_USER = 'f1f1f1f1-1111-4111-8111-111111111111'
const PREMIUM_USER = 'e2e2e2e2-2222-4222-8222-222222222222'
const BAD_PLAN_USER = 'd3d3d3d3-3333-4333-8333-333333333333'
const PREMIUM_PLAN = 'plan.prelim.sek.month.04'
const FREE_LIMIT = LAUNCH_QUOTA_BY_PLAN['plan.free'].ai_text_requests
const PREMIUM_LIMIT = LAUNCH_QUOTA_BY_PLAN[PREMIUM_PLAN].ai_text_requests
const ACTIONS = ['chat', 'daily-coach', 'weekly-report', 'proactive-coach', 'study-buddy']

// Client claims that must never count: forged plan, premium flag, quota.
const FORGED = {
  isAdmin: true,
  plan_id: 'plan.prelim.sek.month.99',
  premium: true,
  quota: { remaining: 9999, unlimited: true },
  remaining: 9999,
  unlimited: true,
  used: 0,
}

const coachBody = { consent: true, confidence: 0.8, coverage: 0.8 }
const coachAnswer = {
  confidence: 0.72,
  dataUsed: ['weight trend'],
  recommendations: [{
    category: 'nutrition', confidence: 0.7, description: 'Lägg till protein.', id: 'protein', priority: 80,
    reason: 'Proteinmålet behöver stöd.', requiresConfirmation: true, safetyCategory: 'standard',
    sourceFacts: ['nutrition summary'], suggestedActionType: 'habit', title: 'Stärk proteinbasen',
  }],
  safetyNote: 'Inte medicinsk rådgivning.',
  summary: 'Ett lugnt nästa steg finns.',
}

function stubOpenAi({ status = 200 } = {}) {
  const spy = vi.fn(async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      ...coachAnswer,
      dailyRisk: 'r', dailyStrength: 's', hint: 'Tänk på metoden.', nextBestAction: 'n',
      nextSteps: ['a', 'b', 'c'], reply: 'Hej från OpenAI', summary: 'Sammanfattning',
    }),
  }), { status }))
  vi.stubGlobal('fetch', spy)
  return spy
}

function request({ attemptId = '', body = {}, contentType = 'application/json' } = {}) {
  const text = JSON.stringify(body)
  const req = Readable.from([text])
  req.body = text
  req.headers = {
    authorization: 'Bearer valid-token',
    'content-type': contentType,
    'x-viktkollen-client-id': 'test-client',
    ...(attemptId ? { 'x-viktkollen-request-id': attemptId } : {}),
  }
  req.method = 'POST'
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

function response() {
  const res = { body: null, headers: {}, statusCode: 200 }
  res.json = vi.fn((body) => { res.body = body; return res })
  res.setHeader = vi.fn((name, value) => { res.headers[name] = value })
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  return res
}

async function callAi(action, extra = {}) {
  const res = response()
  await aiHandler(request({ body: { action, message: 'Vad ska jag äta i kväll?', subject: 'matte', ...extra.body }, attemptId: extra.attemptId }), res)
  return res
}

async function callCoach(extra = {}) {
  const res = response()
  await coachHandler(request({ body: { ...coachBody, ...extra.body }, attemptId: extra.attemptId }), res)
  return res
}

const openAiSuccess = (res) => res.statusCode === 200 && (res.body.source === 'openai' || res.body.providerType === 'openai')

describe('ai.text.request quota (BILL-AI-TEXT-QUOTA-1)', () => {
  const originalEnv = { ...process.env }
  let runtime
  let currentUser

  async function install({ planByUser = {} } = {}) {
    const usageRepository = createInMemoryUsageRepository()
    const assignments = createInMemoryPlanAssignmentStore()
    for (const [userId, planId] of Object.entries(planByUser)) {
      await assignments.set({ plan_id: planId, plan_version: 1, source: 'server', user_id: userId })
    }
    runtime = installAiTextBillingTestRuntime({ quota: createQuotaEngine({ assignments, usageRepository }), usageRepository })
  }

  const used = async (userId) => (await runtime.quota.inspectQuota({ clientClaim: FORGED, feature: 'ai.text.request', unit: 'requests', userId })).used

  beforeEach(async () => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', OPENAI_COACH_RATE_LIMIT_MAX: '500', OPENAI_LEGACY_AI_RATE_LIMIT_MAX: '500' }
    currentUser = FREE_USER
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
    resetMeteredLifecycleInflightForTests()
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: currentUser } }))
    await install({ planByUser: { [BAD_PLAN_USER]: 'plan.does.not.exist', [PREMIUM_USER]: PREMIUM_PLAN } })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
    setAiTextBillingRuntimeForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('uses the plan matrix quotas unchanged (Free 20)', () => {
    expect(FREE_LIMIT).toBe(20)
    expect(PREMIUM_LIMIT).toBeGreaterThan(FREE_LIMIT)
  })

  it('FREE: every /api/ai action uses exactly one unit, reserved before OpenAI; the 21st request is denied with 0 OpenAI calls', async () => {
    const openAi = stubOpenAi()
    const reserve = vi.spyOn(runtime.quota, 'reserveQuota')
    for (let index = 0; index < FREE_LIMIT; index += 1) {
      const action = ACTIONS[index % ACTIONS.length]
      const res = await callAi(action, { attemptId: `free-${index}`, body: FORGED })
      expect(openAiSuccess(res), `${action} #${index + 1}`).toBe(true)
      expect(await used(FREE_USER)).toBe(index + 1)
      // The reservation happened before the OpenAI request of this call.
      expect(reserve.mock.invocationCallOrder[index]).toBeLessThan(openAi.mock.invocationCallOrder[index])
    }
    expect(openAi).toHaveBeenCalledTimes(FREE_LIMIT)

    // Exhausted: every action is denied before OpenAI, even with forged claims.
    for (const action of ACTIONS) {
      const res = await callAi(action, { attemptId: `free-over-${action}`, body: FORGED })
      expect(res.statusCode, action).toBe(429)
      expect(res.body.error.code).toBe('RATE_LIMITED')
      expect(res.body.reply ?? res.body.summary ?? res.body.hint ?? res.body.report ?? res.body.insights).toBeUndefined()
    }
    expect(openAi).toHaveBeenCalledTimes(FREE_LIMIT)
    expect(await used(FREE_USER)).toBe(FREE_LIMIT)
    const events = await runtime.usageRepository.list()
    expect(events).toHaveLength(FREE_LIMIT)
    expect(events.every((event) => event.feature === 'ai.text.request' && event.quantity === 1)).toBe(true)
    expect(JSON.stringify(events)).not.toMatch(/test-key|Vad ska jag äta|Hej från OpenAI/)
  })

  it('PREMIUM (server plan assignment): allowed past the Free quota; its own quota exhausted → denied with 0 OpenAI calls', async () => {
    currentUser = PREMIUM_USER
    const openAi = stubOpenAi()
    for (let index = 0; index < PREMIUM_LIMIT; index += 1) {
      const res = await callAi(ACTIONS[index % ACTIONS.length], { attemptId: `premium-${index}` })
      expect(openAiSuccess(res), `#${index + 1}`).toBe(true)
    }
    const denied = await callAi('chat', { attemptId: 'premium-over' })
    expect(denied.statusCode).toBe(429)
    expect(openAi).toHaveBeenCalledTimes(PREMIUM_LIMIT)
    expect(await used(PREMIUM_USER)).toBe(PREMIUM_LIMIT)
  })

  it('FORGED quota is ignored: a Premium user claiming an exhausted quota is still served by the server quota', async () => {
    currentUser = PREMIUM_USER
    const openAi = stubOpenAi()
    const res = await callAi('chat', { attemptId: 'forged-exhausted', body: { plan_id: 'plan.free', quota: { remaining: 0 }, remaining: 0, used: 999 } })
    expect(openAiSuccess(res)).toBe(true)
    expect(openAi).toHaveBeenCalledTimes(1)
  })

  it('INVALID plan (unknown server plan) is denied before OpenAI', async () => {
    currentUser = BAD_PLAN_USER
    const openAi = stubOpenAi()
    for (const action of ACTIONS) {
      const res = await callAi(action, { attemptId: `bad-${action}`, body: FORGED })
      expect(res.statusCode, action).toBe(429)
    }
    const coach = await callCoach({ attemptId: 'bad-coach', body: FORGED })
    expect(coach.statusCode).toBe(429)
    expect(openAi).not.toHaveBeenCalled()
  })

  it('NO entitlement (ai.text.request disabled by the server feature control) is denied before OpenAI', async () => {
    runtime.featureControl = { feature_id: 'ai.text.request', mode: FEATURE_MODE.DISABLED, reason_code: 'MANUAL_ADMIN', version: 1 }
    const openAi = stubOpenAi()
    const res = await callAi('weekly-report', { attemptId: 'disabled', body: FORGED })
    expect(res.statusCode).toBe(403)
    const coach = await callCoach({ attemptId: 'disabled-coach' })
    expect(coach.statusCode).toBe(403)
    expect(openAi).not.toHaveBeenCalled()
    expect(await used(FREE_USER)).toBe(0)
  })

  it('billing store unavailable fails closed with 0 OpenAI calls', async () => {
    setAiTextBillingRuntimeForTests({ code: 'DURABLE_STORE_UNAVAILABLE', ok: false })
    const openAi = stubOpenAi()
    expect((await callAi('daily-coach')).statusCode).toBe(503)
    expect((await callCoach()).statusCode).toBe(503)
    expect(openAi).not.toHaveBeenCalled()
  })

  it('OpenAI never started (dispatch claim fails): the reservation is rolled back, nothing is charged', async () => {
    runtime.operationStore.claimDispatch = async () => ({ result: DISPATCH_CAS_RESULT.PERSISTENCE_FAILURE })
    const rollback = vi.spyOn(runtime.quota, 'rollbackReservation')
    const openAi = stubOpenAi()
    const res = await callAi('chat', { attemptId: 'no-dispatch' })
    expect(res.statusCode).toBe(503)
    expect(openAi).not.toHaveBeenCalled()
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(await used(FREE_USER)).toBe(0)
  })

  it('OpenAI failure after dispatch: one unit is committed (existing semantics), the action keeps its fallback, no double charge', async () => {
    const openAi = stubOpenAi({ status: 500 })
    const res = await callAi('proactive-coach', { attemptId: 'provider-500' })
    expect(res.statusCode).toBe(200)
    expect(res.body.source).toBe('mock')
    expect(openAi).toHaveBeenCalledTimes(1)
    expect(await used(FREE_USER)).toBe(1)
    // The same attempt again does not charge or call OpenAI a second time.
    await callAi('proactive-coach', { attemptId: 'provider-500' })
    expect(openAi).toHaveBeenCalledTimes(1)
    expect(await used(FREE_USER)).toBe(1)
  })

  it('REPLAY of the same attempt (per action) makes no second OpenAI call and no second unit', async () => {
    const openAi = stubOpenAi()
    for (const action of ACTIONS) {
      const first = await callAi(action, { attemptId: `replay-${action}` })
      expect(openAiSuccess(first), action).toBe(true)
      const replay = await callAi(action, { attemptId: `replay-${action}` })
      expect(replay.statusCode, action).toBe(409)
    }
    expect(openAi).toHaveBeenCalledTimes(ACTIONS.length)
    expect(await used(FREE_USER)).toBe(ACTIONS.length)
  })

  it('deterministic answers (unsafe chat message, no API key) use no quota', async () => {
    const openAi = stubOpenAi()
    const unsafe = await callAi('chat', { attemptId: 'unsafe', body: { message: 'Ge mig en diagnos' } })
    expect(unsafe.body.source).toBe('mock')
    delete process.env.OPENAI_API_KEY
    const noKey = await callAi('study-buddy', { attemptId: 'no-key' })
    expect(noKey.body.source).toBe('mock')
    expect(openAi).not.toHaveBeenCalled()
    expect(await used(FREE_USER)).toBe(0)
  })
})

describe('/api/adaptive-coach ai.text.request quota', () => {
  const originalEnv = { ...process.env }
  let runtime
  let currentUser

  beforeEach(async () => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', OPENAI_COACH_RATE_LIMIT_MAX: '500' }
    currentUser = FREE_USER
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
    resetMeteredLifecycleInflightForTests()
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: currentUser } }))
    const usageRepository = createInMemoryUsageRepository()
    const assignments = createInMemoryPlanAssignmentStore()
    await assignments.set({ plan_id: PREMIUM_PLAN, plan_version: 1, source: 'server', user_id: PREMIUM_USER })
    runtime = installAiTextBillingTestRuntime({ quota: createQuotaEngine({ assignments, usageRepository }), usageRepository })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
    setAiTextBillingRuntimeForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  const used = async (userId) => (await runtime.quota.inspectQuota({ feature: 'ai.text.request', unit: 'requests', userId })).used

  it('FREE: 20 coach requests, then denied before OpenAI even with forged Premium and quota', async () => {
    const openAi = stubOpenAi()
    for (let index = 0; index < FREE_LIMIT; index += 1) {
      const res = await callCoach({ attemptId: `coach-free-${index}`, body: { ...FORGED, confidence: 0.8 - index * 0.001 } })
      expect(openAiSuccess(res), `#${index + 1}`).toBe(true)
    }
    const denied = await callCoach({ attemptId: 'coach-free-over', body: FORGED })
    expect(denied.statusCode).toBe(429)
    expect(openAi).toHaveBeenCalledTimes(FREE_LIMIT)
    expect(await used(FREE_USER)).toBe(FREE_LIMIT)
  })

  it('PREMIUM: allowed past the Free quota by the server plan', async () => {
    currentUser = PREMIUM_USER
    const openAi = stubOpenAi()
    for (let index = 0; index <= FREE_LIMIT; index += 1) {
      const res = await callCoach({ attemptId: `coach-premium-${index}`, body: { confidence: 0.8 - index * 0.001 } })
      expect(openAiSuccess(res), `#${index + 1}`).toBe(true)
    }
    expect(openAi).toHaveBeenCalledTimes(FREE_LIMIT + 1)
  })

  it('REPLAY of the same attempt: one OpenAI call, one unit', async () => {
    const openAi = stubOpenAi()
    expect(openAiSuccess(await callCoach({ attemptId: 'coach-replay' }))).toBe(true)
    expect((await callCoach({ attemptId: 'coach-replay' })).statusCode).toBe(409)
    expect(openAi).toHaveBeenCalledTimes(1)
    expect(await used(FREE_USER)).toBe(1)
  })

  it('OpenAI failure after dispatch commits one unit and returns the existing error', async () => {
    const openAi = stubOpenAi({ status: 500 })
    const res = await callCoach({ attemptId: 'coach-500' })
    expect(res.statusCode).toBeGreaterThanOrEqual(500)
    expect(openAi).toHaveBeenCalled()
    expect(await used(FREE_USER)).toBe(1)
  })
})
