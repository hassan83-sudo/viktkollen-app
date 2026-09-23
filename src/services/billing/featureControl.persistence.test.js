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
  FEATURE_AVAILABILITY,
  FEATURE_MODE,
} from './catalog.js'
import { createBillingAdminService } from './adminService.js'
import { createInMemoryAdminAuditStore } from './adminAuthority.js'
import { createFeatureControlService } from './featureControlService.js'
import { createInMemoryFeatureControlStore } from './featureControlStore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921230000_billing_feature_controls.sql'), 'utf8')
const sql4a = readFileSync(join(root, 'supabase/migrations/20260921220000_billing_admin_authority.sql'), 'utf8')
const srcTree = readFileSync(join(root, 'src/services/supabaseClient.js'), 'utf8')

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

function harness({ failAudit = false, nowIso = '2026-09-21T12:00:00.000Z' } = {}) {
  const store = createInMemoryFeatureControlStore()
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
  const features = createFeatureControlService({
    admin,
    now: () => new Date(nowIso),
    store,
  })
  return { admin, audits, features, store }
}

describe('BILL-4B1b feature control migration static security', () => {
  it('is local-only, RLS deny-all, and does not rewrite BILL-1/2/3', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(sql).not.toMatch(/alter table billing\.subscriptions/i)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/feature_controls_deny_all/)
    expect(sql).toMatch(/revoke all on table billing\.feature_controls from public, anon, authenticated, service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/CONFIG_CONFLICT/)
    expect(sql).toMatch(/and version = expected/)
    expect(sql).toMatch(/feature_controls are not deletable/)
    expect(sql4a).toMatch(/billing\.admin_audit is append-only/)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|service_role/)
  })
})

describe('BILL-4B1b feature control service', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('creates version 1 for a known feature and writes one audit row', async () => {
    const { admin, audits, features } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })
    expect(result.control.version).toBe(1)
    expect(result.control.updated_by).toBe(ADMIN)
    expect(await audits.list()).toHaveLength(1)
    expect((await audits.list())[0].action).toBe(ADMIN_AUDIT_ACTION.FEATURE_CONTROL_CREATED)
    expect((await audits.list())[0].target_id).toBe('food.scan')
  })

  it('blocks unknown feature create', async () => {
    const { admin, features, store } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'secret.nuke',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'unknown_feature' })
    expect(await store.list()).toHaveLength(0)
  })

  it('updates with expected version and rejects stale expected version', async () => {
    const { admin, audits, features } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })
    const updated = await features.setFeatureControl({
      actorUserId: ADMIN,
      expectedVersion: 1,
      featureId: 'food.scan',
      mode: FEATURE_MODE.MAINTENANCE,
      reasonCode: 'MAINTENANCE',
    })
    expect(updated.control.version).toBe(2)
    expect(await audits.list()).toHaveLength(2)
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      expectedVersion: 1,
      featureId: 'food.scan',
      mode: FEATURE_MODE.ENABLED,
      reasonCode: 'MANUAL_ADMIN',
    })).rejects.toMatchObject({ code: 'CONFIG_CONFLICT' })
    expect((await features.getFeatureControl('food.scan')).version).toBe(2)
    expect(await audits.list()).toHaveLength(2)
  })

  it('lets only one of two instances win the same expected version', async () => {
    const store = createInMemoryFeatureControlStore()
    const admin = createBillingAdminService()
    await admin.bootstrapGrantForTests(ADMIN)
    const left = createFeatureControlService({ admin, store })
    const right = createFeatureControlService({ admin, store })
    await left.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'body.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })
    const results = await Promise.allSettled([
      left.setFeatureControl({
        actorUserId: ADMIN,
        expectedVersion: 1,
        featureId: 'body.scan',
        mode: FEATURE_MODE.MAINTENANCE,
        reasonCode: 'MAINTENANCE',
      }),
      right.setFeatureControl({
        actorUserId: ADMIN,
        expectedVersion: 1,
        featureId: 'body.scan',
        mode: FEATURE_MODE.ENABLED,
        reasonCode: 'MANUAL_ADMIN',
      }),
    ])
    const ok = results.filter((row) => row.status === 'fulfilled')
    const conflict = results.filter((row) => row.status === 'rejected' && row.reason?.code === 'CONFIG_CONFLICT')
    expect(ok).toHaveLength(1)
    expect(conflict).toHaveLength(1)
    expect((await store.get('body.scan')).version).toBe(2)
  })

  it('keeps a single row for concurrent first create', async () => {
    const store = createInMemoryFeatureControlStore()
    const admin = createBillingAdminService()
    await admin.bootstrapGrantForTests(ADMIN)
    const left = createFeatureControlService({ admin, store })
    const right = createFeatureControlService({ admin, store })
    const results = await Promise.allSettled([
      left.setFeatureControl({
        actorUserId: ADMIN,
        featureId: 'tts.request',
        mode: FEATURE_MODE.DISABLED,
        reasonCode: 'SECURITY',
      }),
      right.setFeatureControl({
        actorUserId: ADMIN,
        featureId: 'tts.request',
        mode: FEATURE_MODE.MAINTENANCE,
        reasonCode: 'MAINTENANCE',
      }),
    ])
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1)
    expect((await store.list()).filter((row) => row.feature_id === 'tts.request')).toHaveLength(1)
  })

  it('blocks invalid mode, reason, version, non-admin, spoof, and secrets', async () => {
    const { admin, features } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'food.scan',
      mode: 'PAUSED',
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'invalid_feature_mode' })
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'COST_CONTROL',
    })).rejects.toMatchObject({ code: 'invalid_reason_code' })
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      expectedVersion: 1.5,
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'invalid_feature_version' })
    await expect(features.setFeatureControl({
      actorUserId: USER,
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'forbidden_admin' })
    await expect(features.setFeatureControl({
      actorUserId: USER,
      clientClaim: { isAdmin: true, role: 'admin', billing_admin: true },
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'forbidden_admin' })
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      api_key: 'secret',
      featureId: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'rejected_secret_field' })
  })

  it('stores verified admin id and server time instead of client spoof fields', async () => {
    const { admin, features } = harness({ nowIso: '2026-09-21T08:00:00.000Z' })
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await features.setFeatureControl({
      actorUserId: ADMIN,
      clientClaim: { updated_at: '2099-01-01T00:00:00.000Z', updated_by: OTHER, new_version: 99 },
      featureId: 'ready_avatar',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'MANUAL_ADMIN',
    })
    expect(result.control.updated_by).toBe(ADMIN)
    expect(result.control.updated_by).not.toBe(OTHER)
    expect(result.control.updated_at).toBe('2026-09-21T08:00:00.000Z')
    expect(result.control.version).toBe(1)
    const audit = (await admin.listAudits())[0]
    expect(audit.admin_user_id).toBe(ADMIN)
    expect(audit.after_safe).toEqual({
      feature_id: 'ready_avatar',
      mode: 'DISABLED',
      reason_code: 'MANUAL_ADMIN',
      version: 1,
    })
  })

  it('rolls back the control when audit insert fails', async () => {
    const { admin, features } = harness({ failAudit: true })
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'friend_chat',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })).rejects.toMatchObject({ code: 'audit_down' })
    expect(await features.getFeatureControl('friend_chat')).toBeNull()
  })

  it('feeds the 4B1a resolver and keeps the no-row default', async () => {
    const { admin, features } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    expect((await features.resolveFromStore('gps_standard')).result).toBe(FEATURE_AVAILABILITY.AVAILABLE)
    await features.setFeatureControl({
      actorUserId: ADMIN,
      featureId: 'gps_standard',
      mode: FEATURE_MODE.DISABLED,
      reasonCode: 'SECURITY',
    })
    expect((await features.resolveFromStore('gps_standard')).result).toBe(FEATURE_AVAILABILITY.DISABLED)
    await features.setFeatureControl({
      actorUserId: ADMIN,
      expectedVersion: 1,
      featureId: 'gps_standard',
      mode: FEATURE_MODE.MAINTENANCE,
      reasonCode: 'MAINTENANCE',
    })
    expect((await features.resolveFromStore('gps_standard')).result).toBe(FEATURE_AVAILABILITY.MAINTENANCE)
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
        action: 'set_feature_control',
        feature_id: 'food.scan',
        isAdmin: true,
        mode: 'DISABLED',
      },
      method: 'POST',
    }), response)
    expect(response.statusCode).toBe(403)
    const denied = await requireBillingAdmin(createRequest({ body: { isAdmin: true } }))
    expect(denied.ok).toBe(false)
  })
})
