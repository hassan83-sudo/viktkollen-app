import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { ENFORCEMENT_DECISION, QUOTA_STATUS, SUBSCRIPTION_STATUS } from '../../../src/services/billing/catalog.js'
import { FEATURE_COST_CLASS, FEATURE_COST_POLICY, getFeatureCostPolicy } from '../../../src/services/billing/featureCostPolicy.js'
import { BILLING_FEATURES, resolveFeatureId } from '../../../src/services/billing/features.js'
import { COST_GATE_DECISION, runCostGatedOperation } from './featureCostGate.js'

// BILL-AI-COST-GATE-1: the server-side cost gate. The provider is a spy:
// every denial must leave it uncalled.

const USER = 'a1111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-27T12:00:00Z')
const PREMIUM_PLAN = 'plan.prelim.sek.month.29'

function activeSubscription(planId = PREMIUM_PLAN) {
  return {
    current_period_end: '2026-10-15T00:00:00Z',
    current_period_start: '2026-09-15T00:00:00Z',
    plan_id: planId,
    plan_version: 1,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    subscription_id: 'sub-1',
  }
}

// A registered, metered, OpenAI-backed feature treated as Premium-only, so
// the Premium path runs through the real billing engine.
const premiumOnlyEye = (featureId) => (featureId === 'ai.eye.analysis'
  ? { costClass: FEATURE_COST_CLASS.METERED, enforcement: 'test', premiumOnly: true, status: 'live' }
  : getFeatureCostPolicy(featureId))

const FORGED = {
  isAdmin: true,
  plan_id: PREMIUM_PLAN,
  premium: true,
  quota: { remaining: 999999 },
  remaining: 999999,
  unlimited: true,
  user_id: 'bbbbbbbb-2222-4222-8222-222222222222',
}

function spies(quotaStatus = QUOTA_STATUS.ALLOWED, remaining = 5) {
  return {
    inspectQuota: vi.fn(async () => ({ remaining, status: quotaStatus })),
    provider: vi.fn(async () => ({ ok: true })),
  }
}

async function run(input, { getPolicy = premiumOnlyEye, quota = spies() } = {}) {
  const outcome = await runCostGatedOperation(
    { now: NOW, userId: USER, ...input },
    quota.provider,
    { getFeatureCostPolicy: getPolicy, inspectQuota: quota.inspectQuota },
  )
  return { ...outcome, quota }
}

describe('feature cost gate: Premium / metered', () => {
  it('FREE user + Premium-only metered feature: denied before billing, 0 provider calls', async () => {
    const { executed, gate, quota } = await run({ featureId: 'ai.eye.analysis', subscriptions: [] })
    expect(executed).toBe(false)
    expect(gate.decision).toBe(COST_GATE_DECISION.DENY_PREMIUM_REQUIRED)
    expect(quota.provider).not.toHaveBeenCalled()
    expect(quota.inspectQuota).not.toHaveBeenCalled()
  })

  it('NO entitlement (expired or unknown-plan subscription) + metered feature: denied', async () => {
    const expired = { ...activeSubscription(), current_period_end: '2026-09-01T00:00:00Z', current_period_start: '2026-08-01T00:00:00Z' }
    for (const subscriptions of [[expired], [activeSubscription('plan.does.not.exist')]]) {
      const { executed, gate, quota } = await run({ featureId: 'ai.eye.analysis', subscriptions })
      expect(executed).toBe(false)
      expect(gate.decision).toBe(COST_GATE_DECISION.DENY_PREMIUM_REQUIRED)
      expect(quota.provider).not.toHaveBeenCalled()
    }
  })

  it('client-forged Premium (plan, premium flag, admin, other user id) is ignored: denied', async () => {
    const { executed, gate, quota } = await run({ clientClaim: FORGED, featureId: 'ai.eye.analysis', subscriptions: [] })
    expect(executed).toBe(false)
    expect(gate.decision).toBe(COST_GATE_DECISION.DENY_PREMIUM_REQUIRED)
    expect(quota.provider).not.toHaveBeenCalled()
  })

  it('Premium user reaches the quota layer with the server user id, then the provider runs once', async () => {
    const { executed, gate, quota } = await run({ featureId: 'ai.eye.analysis', subscriptions: [activeSubscription()] })
    expect(gate.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(executed).toBe(true)
    expect(quota.inspectQuota).toHaveBeenCalledTimes(1)
    expect(quota.inspectQuota.mock.calls[0][0]).toMatchObject({ feature: 'ai.eye.analysis', userId: USER })
    expect(quota.provider).toHaveBeenCalledTimes(1)
  })

  it('exhausted quota blocks the cost, and a client-forged quota is ignored', async () => {
    const quota = spies(QUOTA_STATUS.DENIED_QUOTA_EXCEEDED, 0)
    const { executed, gate } = await run({ clientClaim: FORGED, featureId: 'ai.eye.analysis', subscriptions: [activeSubscription()] }, { quota })
    expect(executed).toBe(false)
    expect(gate.decision).toBe(ENFORCEMENT_DECISION.DENY_QUOTA)
    expect(quota.inspectQuota).toHaveBeenCalledTimes(1)
    expect(quota.provider).not.toHaveBeenCalled()
  })

  it('without a verified user id nothing runs', async () => {
    const { executed, gate, quota } = await run({ featureId: 'ai.eye.analysis', subscriptions: [activeSubscription()], userId: 'not-a-user' })
    expect(executed).toBe(false)
    expect(gate.decision).toBe(ENFORCEMENT_DECISION.DENY_AUTH)
    expect(quota.provider).not.toHaveBeenCalled()
  })

  it('a metered feature with a Free quota (existing plan matrix) goes to the quota layer for Free users', async () => {
    const { executed, gate, quota } = await run({ featureId: 'food.scan', subscriptions: [] }, { getPolicy: getFeatureCostPolicy })
    expect(gate.decision).toBe(ENFORCEMENT_DECISION.ALLOW)
    expect(quota.inspectQuota).toHaveBeenCalledTimes(1)
    expect(executed).toBe(true)
  })
})

describe('feature cost gate: real policy', () => {
  it('dormant AI Örat providers are denied even for Premium (not registered in billing)', async () => {
    for (const featureId of ['ai.ear.transcription', 'ai.ear.music']) {
      const { executed, gate, quota } = await run({ featureId, subscriptions: [activeSubscription()] }, { getPolicy: getFeatureCostPolicy })
      expect(gate.decision, featureId).toBe(COST_GATE_DECISION.DENY_NOT_REGISTERED)
      expect(executed).toBe(false)
      expect(quota.provider).not.toHaveBeenCalled()
    }
  })

  it('OpenAI Realtime voice and unknown features are BLOCK_UNTIL_VERIFIED for everyone', async () => {
    for (const featureId of ['ai.voice.session', 'something.new', '']) {
      const { executed, gate, quota } = await run({ clientClaim: FORGED, featureId, subscriptions: [activeSubscription()] }, { getPolicy: getFeatureCostPolicy })
      expect(gate.decision, featureId).toBe(COST_GATE_DECISION.DENY_COST_UNVERIFIED)
      expect(executed).toBe(false)
      expect(quota.provider).not.toHaveBeenCalled()
    }
  })

  it('FREE + negligible-cost AI Örat analysis stays available without plan or quota', async () => {
    const { executed, gate, quota } = await run({ featureId: 'ai.ear.interpret', subscriptions: [] }, { getPolicy: getFeatureCostPolicy })
    expect(gate.decision).toBe(COST_GATE_DECISION.ALLOW_FREE_NEGLIGIBLE)
    expect(executed).toBe(true)
    expect(quota.inspectQuota).not.toHaveBeenCalled()
    expect(quota.provider).toHaveBeenCalledTimes(1)
  })

  it('every external-cost billing feature has an explicit cost class; live metered ones are registered', () => {
    for (const [id, feature] of Object.entries(BILLING_FEATURES)) {
      if (feature.classification !== 'EXTERNAL_COST') continue
      expect(Object.keys(FEATURE_COST_POLICY), id).toContain(id)
    }
    for (const [id, policy] of Object.entries(FEATURE_COST_POLICY)) {
      if (policy.costClass === FEATURE_COST_CLASS.METERED && policy.status === 'live') expect(resolveFeatureId(id), id).toBe(id)
    }
  })

  it('public.user_entitlements is not created by any migration', () => {
    const dir = resolve(process.cwd(), 'supabase/migrations')
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(resolve(dir, file), 'utf8').replace(/--.*$/gm, '')
      expect(sql, file).not.toMatch(/create\s+(table|view)[^;]*user_entitlements/i)
    }
  })
})
