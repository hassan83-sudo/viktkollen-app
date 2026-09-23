import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import {
  requireBillingAdmin,
  setBillingAdminServiceForTests,
} from '../../../api/_shared/billing/admin.js'
import handler from '../../../api/billing/admin/index.js'
import {
  ADMIN_AUDIT_ACTION,
  COST_LIMIT_MODE,
  COST_SAFETY,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
} from './catalog.js'
import { createBillingAdminService } from './adminService.js'
import { createInMemoryAdminAuditStore } from './adminAuthority.js'
import { resolveCostSafety } from './costSafety.js'
import { createCostThresholdService, toResolverThreshold } from './costThresholdService.js'
import { createInMemoryCostThresholdStore } from './costThresholdStore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260922000000_billing_cost_safety.sql'), 'utf8')
const sql4b = readFileSync(join(root, 'supabase/migrations/20260921230000_billing_feature_controls.sql'), 'utf8')
const srcTree = readFileSync(join(root, 'src/services/supabaseClient.js'), 'utf8')
const postgresSrc = readFileSync(join(root, 'src/services/billing/costThresholdPostgres.js'), 'utf8')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

function createRequest({ body = {}, method = 'GET', token = 'user-token' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query: {},
  }
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader(name, value) {
      response.headers[name] = value
    },
    status(statusCode) {
      response.statusCode = statusCode
      return response
    },
  }
  return response
}

function harness({ failAudit = false, nowIso = '2026-09-22T08:00:00.000Z' } = {}) {
  const store = createInMemoryCostThresholdStore()
  const audits = createInMemoryAdminAuditStore()
  const insert = audits.insert.bind(audits)
  if (failAudit) {
    audits.insert = async () => {
      const error = new Error('audit_down')
      error.code = 'audit_down'
      throw error
    }
  } else {
    audits.insert = insert
  }
  const admin = createBillingAdminService({
    audits,
    now: () => new Date(nowIso),
  })
  const thresholds = createCostThresholdService({
    admin,
    now: () => new Date(nowIso),
    store,
  })
  return { admin, audits, store, thresholds }
}

describe('BILL-4C1b cost threshold migration static security', () => {
  it('is local-only, RLS deny-all, integer money, and does not rewrite earlier billing tables', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(sql).not.toMatch(/alter table billing\.subscriptions/i)
    expect(sql).not.toMatch(/alter table billing\.feature_controls/i)
    expect(sql).not.toMatch(/insert into billing\.admin_permissions/i)
    expect(sql).toMatch(/amount_minor bigint/)
    expect(sql).toMatch(/amount_minor >= 0/)
    expect(sql).toMatch(/currency = 'SEK'/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/cost_thresholds_deny_all/)
    expect(sql).toMatch(/revoke all on table billing\.cost_thresholds from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/and version = p_expected_version/)
    expect(sql).toMatch(/when unique_violation then/)
    expect(sql).toMatch(/cost_thresholds are not deletable/)
    expect(sql).toMatch(/cost_thresholds_identity_uidx/)
    expect(sql).toMatch(/cost_thresholds_active_lookup_idx/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).toMatch(/grant execute on function billing\.create_cost_threshold/)
    expect(sql).toMatch(/grant execute on function billing\.update_cost_threshold/)
    expect(sql).toMatch(/'cost\.threshold\.created'/)
    expect(sql).toMatch(/'cost_threshold'/)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|service_role/)
    expect(postgresSrc).toMatch(/billing\.create_cost_threshold/)
    expect(postgresSrc).toMatch(/billing\.list_active_cost_thresholds/)
    expect(sql4b).toMatch(/feature_controls/)
  })
})

describe('BILL-4C1b cost threshold service', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('creates a GLOBAL DAILY HARD_STOP threshold at 10000 öre with version 1', async () => {
    const { admin, audits, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 10000,
      currency: 'SEK',
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    expect(result.threshold.version).toBe(1)
    expect(result.threshold.amount_minor).toBe(10000)
    expect(result.threshold.currency).toBe('SEK')
    expect(result.threshold.scope).toBe('GLOBAL')
    expect(result.threshold.feature_id).toBeNull()
    expect(await audits.list()).toHaveLength(1)
    expect((await audits.list())[0].action).toBe(ADMIN_AUDIT_ACTION.COST_THRESHOLD_CREATED)
    expect((await audits.list())[0].target_type).toBe('cost_threshold')
    expect((await audits.list())[0].after_safe.amount_minor).toBe(10000)
  })

  it('creates a FEATURE canonical daily threshold', async () => {
    const { admin, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 500,
      enabled: true,
      featureId: 'food.scan',
      limitMode: COST_LIMIT_MODE.SOFT_ALERT,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.FEATURE,
    })
    expect(result.threshold.feature_id).toBe('food.scan')
    expect(result.threshold.period).toBe('DAILY')
  })

  it('blocks GLOBAL with feature_id and FEATURE without feature_id', async () => {
    const { admin, store, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      featureId: 'food.scan',
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })).rejects.toMatchObject({ code: 'invalid_cost_scope' })
    await expect(thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.FEATURE,
    })).rejects.toMatchObject({ code: 'unknown_feature' })
    expect(store.list()).toHaveLength(0)
  })

  it('blocks unknown feature, money, currency, period, scope, and limit mode', async () => {
    const { admin, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const base = {
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    }
    await expect(thresholds.createCostThreshold({
      ...base,
      featureId: 'not.a.feature',
      scope: COST_THRESHOLD_SCOPE.FEATURE,
    })).rejects.toMatchObject({ code: 'unknown_feature' })
    await expect(thresholds.createCostThreshold({ ...base, amountMinor: -1 })).rejects.toMatchObject({
      code: 'invalid_cost_threshold',
    })
    await expect(thresholds.createCostThreshold({ ...base, amountMinor: 9.5 })).rejects.toMatchObject({
      code: 'invalid_cost_threshold',
    })
    await expect(thresholds.createCostThreshold({ ...base, currency: 'USD' })).rejects.toMatchObject({
      code: 'invalid_cost_currency',
    })
    await expect(thresholds.createCostThreshold({ ...base, period: 'WEEKLY' })).rejects.toMatchObject({
      code: 'invalid_cost_period',
    })
    await expect(thresholds.createCostThreshold({ ...base, scope: 'USER' })).rejects.toMatchObject({
      code: 'invalid_cost_scope',
    })
    await expect(thresholds.createCostThreshold({ ...base, limitMode: 'WARN' })).rejects.toMatchObject({
      code: 'invalid_limit_mode',
    })
  })

  it('updates with expected version 1 to version 2 and rejects stale CAS', async () => {
    const { admin, audits, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const created = await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 10000,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.MONTHLY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    const updated = await thresholds.updateCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 20000,
      enabled: true,
      expectedVersion: 1,
      thresholdId: created.threshold.threshold_id,
    })
    expect(updated.threshold.version).toBe(2)
    expect(updated.threshold.amount_minor).toBe(20000)
    expect(await audits.list()).toHaveLength(2)
    expect((await audits.list())[1].action).toBe(ADMIN_AUDIT_ACTION.COST_THRESHOLD_CHANGED)
    await expect(thresholds.updateCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 1,
      enabled: true,
      expectedVersion: 1,
      thresholdId: created.threshold.threshold_id,
    })).rejects.toMatchObject({ code: 'CONFIG_CONFLICT' })
    expect((await thresholds.getCostThreshold(created.threshold.threshold_id)).version).toBe(2)
    expect((await thresholds.getCostThreshold(created.threshold.threshold_id)).amount_minor).toBe(20000)
    expect(await audits.list()).toHaveLength(2)
  })

  it('lets only one of two service instances win the same expected version', async () => {
    const store = createInMemoryCostThresholdStore()
    const admin = createBillingAdminService()
    await admin.bootstrapGrantForTests(ADMIN)
    const left = createCostThresholdService({ admin, store })
    const right = createCostThresholdService({ admin, store })
    const created = await left.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    const results = await Promise.allSettled([
      left.updateCostThreshold({
        actorUserId: ADMIN,
        amountMinor: 200,
        enabled: true,
        expectedVersion: 1,
        thresholdId: created.threshold.threshold_id,
      }),
      right.updateCostThreshold({
        actorUserId: ADMIN,
        amountMinor: 300,
        enabled: true,
        expectedVersion: 1,
        thresholdId: created.threshold.threshold_id,
      }),
    ])
    const ok = results.filter((row) => row.status === 'fulfilled')
    const conflict = results.filter((row) => row.status === 'rejected' && row.reason?.code === 'CONFIG_CONFLICT')
    expect(ok).toHaveLength(1)
    expect(conflict).toHaveLength(1)
    expect((await store.get(created.threshold.threshold_id)).version).toBe(2)
  })

  it('keeps a single authoritative row for concurrent first create of the same identity', async () => {
    const store = createInMemoryCostThresholdStore()
    const admin = createBillingAdminService()
    await admin.bootstrapGrantForTests(ADMIN)
    const left = createCostThresholdService({ admin, store })
    const right = createCostThresholdService({ admin, store })
    const payload = {
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      featureId: 'body.scan',
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.FEATURE,
    }
    const results = await Promise.allSettled([
      left.createCostThreshold(payload),
      right.createCostThreshold({ ...payload, amountMinor: 999 }),
    ])
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1)
    expect(store.list()).toHaveLength(1)
  })

  it('lets SOFT_ALERT and HARD_STOP coexist for the same scope and period', async () => {
    const { admin, store, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 8000,
      enabled: true,
      limitMode: COST_LIMIT_MODE.SOFT_ALERT,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 10000,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    expect(store.list()).toHaveLength(2)
    await expect(thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 1,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })).rejects.toMatchObject({ code: 'CONFIG_CONFLICT' })
  })

  it('blocks non-admin mutation and client admin spoof', async () => {
    const { admin, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const payload = {
      amountMinor: 100,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    }
    await expect(thresholds.createCostThreshold({
      ...payload,
      actorUserId: USER,
    })).rejects.toMatchObject({ code: 'forbidden_admin' })
    await expect(thresholds.createCostThreshold({
      ...payload,
      actorUserId: USER,
      clientClaim: { isAdmin: true, role: 'admin', billing_admin: true },
    })).rejects.toMatchObject({ code: 'forbidden_admin' })
  })

  it('stores verified admin id and server time instead of client spoof fields', async () => {
    const { admin, thresholds } = harness({ nowIso: '2026-09-22T08:00:00.000Z' })
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      clientClaim: {
        isAdmin: true,
        threshold_id: '99999999-9999-4999-8999-999999999999',
        updated_at: '2099-01-01T00:00:00.000Z',
        updated_by: OTHER,
      },
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    expect(result.threshold.updated_by).toBe(ADMIN)
    expect(result.threshold.updated_by).not.toBe(OTHER)
    expect(result.threshold.updated_at).toBe('2026-09-22T08:00:00.000Z')
    expect(result.threshold.threshold_id).not.toBe('99999999-9999-4999-8999-999999999999')
    expect(result.audit.admin_user_id).toBe(ADMIN)
  })

  it('rolls back the threshold when audit insert fails', async () => {
    const { admin, store, thresholds } = harness({ failAudit: true })
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })).rejects.toMatchObject({ code: 'audit_down' })
    expect(store.list()).toHaveLength(0)
  })

  it('rejects secret extra input and never persists it', async () => {
    const { admin, store, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      api_key: 'secret',
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      prompt: 'hi',
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })).rejects.toMatchObject({ code: 'rejected_secret_field' })
    expect(store.list()).toHaveLength(0)
  })

  it('filters disabled thresholds from active reads', async () => {
    const { admin, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const created = await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: false,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    expect(await thresholds.listActiveCostThresholds()).toHaveLength(0)
    await thresholds.updateCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 100,
      enabled: true,
      expectedVersion: 1,
      thresholdId: created.threshold.threshold_id,
    })
    expect(await thresholds.listActiveCostThresholds()).toHaveLength(1)
  })

  it('feeds BILL-4C1a resolveCostSafety without mutating persistence', async () => {
    const { admin, store, thresholds } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const created = await thresholds.createCostThreshold({
      actorUserId: ADMIN,
      amountMinor: 900,
      enabled: true,
      limitMode: COST_LIMIT_MODE.HARD_STOP,
      period: COST_THRESHOLD_PERIOD.DAILY,
      scope: COST_THRESHOLD_SCOPE.GLOBAL,
    })
    const mapped = toResolverThreshold(created.threshold)
    const decision = resolveCostSafety({
      costSummary: {
        amount_minor: 900,
        classification: 'MEASURED',
        currency: 'SEK',
        period: 'DAILY',
        scope: 'GLOBAL',
      },
      feature: 'food.scan',
      threshold: mapped,
    })
    expect(decision.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(decision.allow).toBe(false)
    expect(store.get(created.threshold.threshold_id).version).toBe(1)
  })

  it('blocks non-admin HTTP mutation', async () => {
    const { admin } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(admin)
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'admin-token' ? { user: { id: ADMIN } } : { user: { id: USER } }
    ))
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'create_cost_threshold',
        amount_minor: 100,
        isAdmin: true,
        scope: 'GLOBAL',
      },
      method: 'POST',
    }), response)
    expect(response.statusCode).toBe(403)
    const denied = await requireBillingAdmin(createRequest({ body: { isAdmin: true } }))
    expect(denied.ok).toBe(false)
  })
})
