import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import {
  getBillingAdminService,
  requireBillingAdmin,
  setBillingAdminServiceForTests,
} from '../../../api/_shared/billing/admin.js'
import handler from '../../../api/billing/admin/index.js'
import { BILLING_PERMISSION } from './catalog.js'
import {
  assertAuditPayloadSafe,
  createInMemoryAdminAuditStore,
  createInMemoryAdminPermissionStore,
} from './adminAuthority.js'
import { createBillingAdminService } from './adminService.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921220000_billing_admin_authority.sql'), 'utf8')
const usageSql = readFileSync(join(root, 'supabase/migrations/20260921121500_billing_usage_events.sql'), 'utf8')
const quotaSql = readFileSync(join(root, 'supabase/migrations/20260921180000_billing_plan_quota.sql'), 'utf8')
const subSql = readFileSync(join(root, 'supabase/migrations/20260921200000_billing_subscriptions.sql'), 'utf8')
const srcTree = readFileSync(join(root, 'src/services/supabaseClient.js'), 'utf8')
const envExample = readFileSync(join(root, '.env.example'), 'utf8')
const adminApi = readFileSync(join(root, 'api/billing/admin/index.js'), 'utf8')
const adminShared = readFileSync(join(root, 'api/_shared/billing/admin.js'), 'utf8')
const adminServiceSrc = readFileSync(join(root, 'src/services/billing/adminService.js'), 'utf8')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

function createRequest({
  body = {},
  method = 'GET',
  token = 'user-token',
} = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
  }
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

function servicePair() {
  const audits = createInMemoryAdminAuditStore()
  const permissions = createInMemoryAdminPermissionStore()
  const service = createBillingAdminService({ audits, permissions })
  return { audits, permissions, service }
}

describe('BILL-4A admin migration static security', () => {
  it('is local-only and does not rewrite BILL-1/2/3 tables', () => {
    const ddl = sql.replace(/--[^\n]*/g, '')
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(sql).not.toMatch(/alter table billing\.quota_reservations/i)
    expect(sql).not.toMatch(/alter table billing\.subscriptions/i)
    expect(ddl).not.toMatch(/stripe|sumup|klarna|checkout|refund|proration/i)
    expect(ddl).not.toMatch(/feature_controls|kill.?switch/i)
    expect(usageSql).toMatch(/billing\.usage_events is append-only/)
    expect(quotaSql).toMatch(/terminal state is immutable/)
    expect(subSql).toMatch(/subscriptions_one_open_per_user_uidx/)
  })

  it('force-RLS denies clients and limits trusted access', () => {
    const ddl = sql.replace(/--[^\n]*/g, '')
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/using \(false\)/)
    expect(sql).toMatch(/with check \(false\)/)
    expect(sql).toMatch(/grant select on table billing\.admin_permissions to service_role/)
    expect(sql).toMatch(/grant select on table billing\.admin_audit to service_role/)
    expect(sql).toMatch(/revoke all on table billing\.admin_permissions from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/revoke all on table billing\.admin_audit from public, anon, authenticated, service_role/)
    expect(sql).not.toMatch(/grant (all|select|insert|update|delete).*authenticated/i)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(ddl).not.toMatch(/localStorage|isAdmin|VITE_/)
  })

  it('enforces unique permission, indexes, and append-only audit', () => {
    expect(sql).toMatch(/admin_permissions_user_permission_uidx/)
    expect(sql).toMatch(/on billing\.admin_permissions \(user_id, permission\)/)
    expect(sql).toMatch(/admin_permissions_user_active_idx/)
    expect(sql).toMatch(/admin_audit_created_idx/)
    expect(sql).toMatch(/admin_audit_admin_idx/)
    expect(sql).toMatch(/admin_audit_action_idx/)
    expect(sql).toMatch(/billing\.admin_audit is append-only/)
    expect(sql).toMatch(/unique_violation/)
    expect(sql).toMatch(/for update/i)
  })

  it('uses SECURITY DEFINER helpers with locked search_path', () => {
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).toMatch(/grant execute on function billing\.has_billing_admin/)
    expect(sql).toMatch(/grant execute on function billing\.grant_billing_admin/)
    expect(sql).toMatch(/grant execute on function billing\.revoke_billing_admin/)
    expect(sql).toMatch(/revoke all on function billing\.append_admin_audit/)
    expect(sql).toMatch(/audit_sensitive_field/)
    expect(sql).toMatch(/permission = 'billing_admin'/)
  })

  it('does not put service role or admin secrets on the Vite client', () => {
    expect(srcTree).toMatch(/VITE_SUPABASE_ANON_KEY/)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|serviceRole|service_role/)
    expect(envExample).not.toMatch(/VITE_SUPABASE_SERVICE_ROLE/)
    expect(adminApi).not.toMatch(/service_role|sk_live|SUPABASE_SERVICE/)
    expect(adminShared).not.toMatch(/localStorage/)
    expect(adminServiceSrc).toMatch(/No permission cache/)
  })
})

describe('BILL-4A requireBillingAdmin and admin API', () => {
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    process.env = { ...originalEnv }
    const { service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: USER } }
      return { error: { message: 'invalid jwt' } }
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('blocks anon admin API access', async () => {
    const response = createResponse()
    await handler(createRequest({ token: '' }), response)
    expect(response.statusCode).toBe(401)
    expect(response.body.ok).toBe(false)
  })

  it('blocks a normal authenticated user', async () => {
    const response = createResponse()
    await handler(createRequest(), response)
    expect(response.statusCode).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(JSON.stringify(response.body)).not.toMatch(/service_role|admin_permissions|11111111-1111/)
  })

  it('ignores client isAdmin/role/billing_admin spoof fields', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { billing_admin: true, isAdmin: true, role: 'admin' },
    }), response)
    expect(response.statusCode).toBe(403)
  })

  it('allows a verified billing_admin and returns a client-safe session', async () => {
    const response = createResponse()
    await handler(createRequest({ token: 'admin-token' }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.session).toEqual({
      authorized: true,
      permissions: [BILLING_PERMISSION.ADMIN],
    })
    expect(JSON.stringify(response.body)).not.toMatch(/service_role|password|access_token/)
  })

  it('ignores a client-supplied admin_user_id on grant', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'grant',
        admin_user_id: OTHER,
        reason_code: 'MANUAL_ADMIN',
        target_user_id: USER,
      },
      method: 'POST',
      token: 'admin-token',
    }), response)
    expect(response.statusCode).toBe(200)
    const service = getBillingAdminService()
    expect(await service.hasBillingAdmin(USER)).toBe(true)
    const rows = await service.listAudits()
    expect(rows).toHaveLength(1)
    expect(rows[0].admin_user_id).toBe(ADMIN)
    expect(rows[0].admin_user_id).not.toBe(OTHER)
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'admin-token' ? { user: { id: ADMIN } } : { user: { id: OTHER } }
    ))
    const fake = await requireBillingAdmin(createRequest({
      body: { admin_user_id: ADMIN },
      token: 'other-token',
    }))
    expect(fake.ok).toBe(false)
  })

  it('blocks self-grant from a normal user', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'grant',
        target_user_id: USER,
      },
      method: 'POST',
    }), response)
    expect(response.statusCode).toBe(403)
    expect(await getBillingAdminService().hasBillingAdmin(USER)).toBe(false)
  })

  it('blocks raw client permission mutation without the admin guard', async () => {
    const denied = await requireBillingAdmin(createRequest({
      body: { action: 'revoke', target_user_id: ADMIN },
    }))
    expect(denied.ok).toBe(false)
    expect(denied.status).toBe(403)
    expect(await getBillingAdminService().hasBillingAdmin(ADMIN)).toBe(true)
  })
})

describe('BILL-4A permission and audit service', () => {
  it('prevents duplicate authoritative permission rows', async () => {
    const { audits, permissions, service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    await service.grant({ actorUserId: ADMIN, targetUserId: USER })
    await service.grant({ actorUserId: ADMIN, targetUserId: USER })
    const rows = (await permissions.list()).filter((row) => row.user_id === USER)
    expect(rows).toHaveLength(1)
    expect(rows[0].permission).toBe('billing_admin')
    expect((await audits.list()).filter((row) => row.target_id === USER)).toHaveLength(1)
  })

  it('writes exactly one audit row for a trusted grant', async () => {
    const { audits, service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    await service.grant({ actorUserId: ADMIN, reasonCode: 'MANUAL_ADMIN', targetUserId: USER })
    expect(await audits.list()).toHaveLength(1)
    expect((await audits.list())[0].admin_user_id).toBe(ADMIN)
  })

  it('blocks audit update and delete', async () => {
    const { audits, service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    await service.grant({ actorUserId: ADMIN, targetUserId: USER })
    await expect(audits.replace()).rejects.toMatchObject({ code: 'audit_append_only' })
    await expect(audits.remove()).rejects.toMatchObject({ code: 'audit_append_only' })
  })

  it('blocks sensitive audit fields', () => {
    expect(() => assertAuditPayloadSafe({ password: 'x' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ api_key: 'k' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ token: 't' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ prompt: 'hi' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ audio: 'blob' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ coordinates: '1,2' })).toThrow(/audit_sensitive_field/)
    expect(assertAuditPayloadSafe({ permission: 'billing_admin', status: 'ACTIVE' })).toEqual({
      permission: 'billing_admin',
      status: 'ACTIVE',
    })
  })

  it('stores verified actor identity instead of a client admin_user_id', async () => {
    const { audits, service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    await service.grant({
      actorUserId: ADMIN,
      clientClaim: { admin_user_id: OTHER },
      targetUserId: USER,
    })
    expect((await audits.list())[0].admin_user_id).toBe(ADMIN)
    expect((await audits.list())[0].admin_user_id).not.toBe(OTHER)
  })

  it('denies the next requireBillingAdmin after trusted revoke', async () => {
    const { service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    await service.grant({ actorUserId: ADMIN, targetUserId: USER })
    expect(await service.hasBillingAdmin(USER)).toBe(true)
    await service.revoke({ actorUserId: ADMIN, reasonCode: 'SECURITY', targetUserId: USER })
    expect(await service.hasBillingAdmin(USER)).toBe(false)
    setBillingAdminServiceForTests(service)
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: USER } }))
    const result = await requireBillingAdmin(createRequest({ token: 'user-token' }))
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
    setBillingAdminServiceForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('defaults deny for missing, unknown, or unverifiable identity', async () => {
    const { service } = servicePair()
    expect(await service.hasBillingAdmin('')).toBe(false)
    expect(await service.hasBillingAdmin('not-a-uuid')).toBe(false)
    expect(await service.hasBillingAdmin(USER)).toBe(false)
    await expect(service.grant({ actorUserId: USER, targetUserId: ADMIN })).rejects.toMatchObject({
      code: 'forbidden_admin',
    })
  })
})
