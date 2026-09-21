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
  FEATURE_MODE,
  OPERATIONAL_AVAILABILITY,
  PROVIDER_MODE,
} from './catalog.js'
import { createBillingAdminService } from './adminService.js'
import { createInMemoryAdminAuditStore } from './adminAuthority.js'
import { createProviderControlService } from './providerControlService.js'
import { createInMemoryProviderControlStore } from './providerControlStore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921230000_billing_feature_controls.sql'), 'utf8')
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
  const store = createInMemoryProviderControlStore()
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
  const providers = createProviderControlService({
    admin,
    now: () => new Date(nowIso),
    store,
  })
  return { admin, audits, providers, store }
}

describe('BILL-4B2b provider control migration static security', () => {
  it('extends the unapplied BILL-4B file with RLS deny-all and no BILL-1/2/3 rewrite', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/strategy A/)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(sql).not.toMatch(/alter table billing\.subscriptions/i)
    expect(sql).toMatch(/provider_controls_deny_all/)
    expect(sql).toMatch(/revoke all on table billing\.provider_controls from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/and version = expected/)
    expect(sql).toMatch(/provider_controls are not deletable/)
    expect(sql).toMatch(/set_provider_control/)
    expect(sql).toMatch(/provider\.control\.created/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|service_role/)
  })
})

describe('BILL-4B2b provider control service', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('creates version 1 for a known provider and writes one audit row', async () => {
    const { admin, audits, providers } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await providers.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })
    expect(result.control.version).toBe(1)
    expect(result.control.updated_by).toBe(ADMIN)
    expect(await audits.list()).toHaveLength(1)
    expect((await audits.list())[0].action).toBe(ADMIN_AUDIT_ACTION.PROVIDER_CONTROL_CREATED)
    expect((await audits.list())[0].target_id).toBe('openai')
    expect((await audits.list())[0].after_safe).toEqual({
      mode: 'UNAVAILABLE',
      provider_id: 'openai',
      reason_code: 'PROVIDER_OUTAGE',
      version: 1,
    })
  })

  it('blocks unknown provider create', async () => {
    const { admin, providers, store } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(providers.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'acme.magic',
      reasonCode: 'PROVIDER_OUTAGE',
    })).rejects.toMatchObject({ code: 'unknown_provider' })
    expect(await store.list()).toHaveLength(0)
  })

  it('updates with expected version and rejects stale expected version', async () => {
    const { admin, audits, providers } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await providers.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })
    const updated = await providers.setProviderControl({
      actorUserId: ADMIN,
      expectedVersion: 1,
      mode: PROVIDER_MODE.MAINTENANCE,
      providerId: 'openai',
      reasonCode: 'MAINTENANCE',
    })
    expect(updated.control.version).toBe(2)
    expect(await audits.list()).toHaveLength(2)
    await expect(providers.setProviderControl({
      actorUserId: ADMIN,
      expectedVersion: 1,
      mode: PROVIDER_MODE.AVAILABLE,
      providerId: 'openai',
      reasonCode: 'MANUAL_ADMIN',
    })).rejects.toMatchObject({ code: 'CONFIG_CONFLICT' })
    expect((await providers.getProviderControl('openai')).version).toBe(2)
    expect(await audits.list()).toHaveLength(2)
  })

  it('lets only one of two instances win the same expected version', async () => {
    const store = createInMemoryProviderControlStore()
    const admin = createBillingAdminService()
    await admin.bootstrapGrantForTests(ADMIN)
    const left = createProviderControlService({ admin, store })
    const right = createProviderControlService({ admin, store })
    await left.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })
    const results = await Promise.allSettled([
      left.setProviderControl({
        actorUserId: ADMIN,
        expectedVersion: 1,
        mode: PROVIDER_MODE.MAINTENANCE,
        providerId: 'openai',
        reasonCode: 'MAINTENANCE',
      }),
      right.setProviderControl({
        actorUserId: ADMIN,
        expectedVersion: 1,
        mode: PROVIDER_MODE.AVAILABLE,
        providerId: 'openai',
        reasonCode: 'MANUAL_ADMIN',
      }),
    ])
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((row) => row.status === 'rejected' && row.reason?.code === 'CONFIG_CONFLICT')).toHaveLength(1)
    expect((await store.get('openai')).version).toBe(2)
  })

  it('keeps a single row for concurrent first create', async () => {
    const store = createInMemoryProviderControlStore()
    const admin = createBillingAdminService()
    await admin.bootstrapGrantForTests(ADMIN)
    const left = createProviderControlService({ admin, store })
    const right = createProviderControlService({ admin, store })
    const results = await Promise.allSettled([
      left.setProviderControl({
        actorUserId: ADMIN,
        mode: PROVIDER_MODE.UNAVAILABLE,
        providerId: 'google.cloud_run.ai_ear',
        reasonCode: 'PROVIDER_OUTAGE',
      }),
      right.setProviderControl({
        actorUserId: ADMIN,
        mode: PROVIDER_MODE.MAINTENANCE,
        providerId: 'google.cloud_run.ai_ear',
        reasonCode: 'MAINTENANCE',
      }),
    ])
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1)
    expect((await store.list()).filter((row) => row.provider_id === 'google.cloud_run.ai_ear')).toHaveLength(1)
  })

  it('blocks invalid mode, reason, non-admin, spoof, and secrets', async () => {
    const { admin, providers } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(providers.setProviderControl({
      actorUserId: ADMIN,
      mode: 'DOWN',
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })).rejects.toMatchObject({ code: 'invalid_provider_mode' })
    await expect(providers.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'COST_CONTROL',
    })).rejects.toMatchObject({ code: 'invalid_reason_code' })
    await expect(providers.setProviderControl({
      actorUserId: USER,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })).rejects.toMatchObject({ code: 'forbidden_admin' })
    await expect(providers.setProviderControl({
      actorUserId: USER,
      clientClaim: { isAdmin: true, role: 'admin', billing_admin: true },
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })).rejects.toMatchObject({ code: 'forbidden_admin' })
    await expect(providers.setProviderControl({
      actorUserId: ADMIN,
      api_key: 'secret',
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })).rejects.toMatchObject({ code: 'rejected_secret_field' })
  })

  it('stores verified admin id and server time instead of client spoof fields', async () => {
    const { admin, providers } = harness({ nowIso: '2026-09-21T08:00:00.000Z' })
    await admin.bootstrapGrantForTests(ADMIN)
    const result = await providers.setProviderControl({
      actorUserId: ADMIN,
      clientClaim: { updated_at: '2099-01-01T00:00:00.000Z', updated_by: OTHER, new_version: 99 },
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'SECURITY',
    })
    expect(result.control.updated_by).toBe(ADMIN)
    expect(result.control.updated_at).toBe('2026-09-21T08:00:00.000Z')
    expect(result.control.version).toBe(1)
  })

  it('rolls back the control when audit insert fails', async () => {
    const { admin, providers } = harness({ failAudit: true })
    await admin.bootstrapGrantForTests(ADMIN)
    await expect(providers.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })).rejects.toMatchObject({ code: 'audit_down' })
    expect(await providers.getProviderControl('openai')).toBeNull()
  })

  it('feeds the 4B2a operational resolver from persisted controls', async () => {
    const { admin, providers } = harness()
    await admin.bootstrapGrantForTests(ADMIN)
    expect((await providers.resolveFromStore({ featureId: 'food.scan' })).result)
      .toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
    await providers.setProviderControl({
      actorUserId: ADMIN,
      mode: PROVIDER_MODE.UNAVAILABLE,
      providerId: 'openai',
      reasonCode: 'PROVIDER_OUTAGE',
    })
    expect((await providers.resolveFromStore({ featureId: 'ai.text.request' })).result)
      .toBe(OPERATIONAL_AVAILABILITY.PROVIDER_UNAVAILABLE)
    expect((await providers.resolveFromStore({ featureId: 'tts.request' })).result)
      .toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
    await providers.setProviderControl({
      actorUserId: ADMIN,
      expectedVersion: 1,
      mode: PROVIDER_MODE.MAINTENANCE,
      providerId: 'openai',
      reasonCode: 'MAINTENANCE',
    })
    expect((await providers.resolveFromStore({ featureId: 'body.scan' })).result)
      .toBe(OPERATIONAL_AVAILABILITY.PROVIDER_MAINTENANCE)
    expect((await providers.resolveFromStore({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.DISABLED,
        reason_code: 'SECURITY',
        version: 1,
      },
      featureId: 'food.scan',
    })).result).toBe(OPERATIONAL_AVAILABILITY.DISABLED)
    expect((await providers.resolveFromStore({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.MAINTENANCE,
        reason_code: 'MAINTENANCE',
        version: 1,
      },
      featureId: 'food.scan',
    })).result).toBe(OPERATIONAL_AVAILABILITY.MAINTENANCE)
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
        action: 'set_provider_control',
        isAdmin: true,
        mode: 'UNAVAILABLE',
        provider_id: 'openai',
      },
      method: 'POST',
    }), response)
    expect(response.statusCode).toBe(403)
    const denied = await requireBillingAdmin(createRequest({ body: { isAdmin: true } }))
    expect(denied.ok).toBe(false)
  })
})
