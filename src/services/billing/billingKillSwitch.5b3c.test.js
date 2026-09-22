import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../api/billing/admin/index.js'
import {
  setBillingAdminControlsForTests,
  setBillingAdminServiceForTests,
  setBillingAdminStoreUnavailableForTests,
} from '../../../api/_shared/billing/admin.js'
import {
  executeFoodScanMeteredOperation,
  installFoodScanBillingTestRuntime,
  setFoodScanBillingRuntimeForTests,
} from '../../../api/_shared/billing/foodScanLiveBilling.js'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import { ENFORCEMENT_DECISION, FEATURE_MODE, PROVIDER_MODE } from './catalog.js'
import { LIFECYCLE_OUTCOME } from './meteredOperationLifecycle.js'
import { createBillingAdminService } from './adminService.js'
import { createInMemoryAdminAuditStore, createInMemoryAdminPermissionStore } from './adminAuthority.js'
import { createPostgresBillingControlAdapter } from './billingControlPostgres.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function createFakeBillingClient() {
  const features = new Map()
  const providers = new Map()
  const admins = new Set()
  const rpcCalls = []
  return {
    admins,
    features,
    providers,
    rpcCalls,
    schema(name) {
      if (name !== 'billing') throw new Error('unexpected_schema')
      return {
        from(table) {
          const state = { value: null }
          return {
            select() {
              return this
            },
            eq(_column, value) {
              state.value = value
              return this
            },
            async maybeSingle() {
              const map = table === 'feature_controls' ? features : providers
              return { data: map.get(state.value) || null, error: null }
            },
          }
        },
        async rpc(fn, args) {
          rpcCalls.push({ args, fn })
          if (fn === 'has_billing_admin') {
            return { data: admins.has(args.p_user_id), error: null }
          }
          if (fn === 'set_feature_control') {
            if (!admins.has(args.p_actor_user_id)) {
              return { data: null, error: { code: 'forbidden_admin', message: 'forbidden_admin' } }
            }
            const current = features.get(args.p_feature_id)
            const currentVersion = current ? current.version : 0
            if (currentVersion !== args.p_expected_version) {
              return { data: null, error: { code: 'CONFIG_CONFLICT', message: 'CONFIG_CONFLICT' } }
            }
            const row = {
              feature_id: args.p_feature_id,
              mode: args.p_mode,
              reason_code: args.p_reason_code,
              version: currentVersion + 1,
            }
            features.set(args.p_feature_id, row)
            return { data: row, error: null }
          }
          if (fn === 'set_provider_control') {
            if (!admins.has(args.p_actor_user_id)) {
              return { data: null, error: { code: 'forbidden_admin', message: 'forbidden_admin' } }
            }
            const current = providers.get(args.p_provider_id)
            const currentVersion = current ? current.version : 0
            if (currentVersion !== args.p_expected_version) {
              return { data: null, error: { code: 'CONFIG_CONFLICT', message: 'CONFIG_CONFLICT' } }
            }
            const row = {
              mode: args.p_mode,
              provider_id: args.p_provider_id,
              reason_code: args.p_reason_code,
              version: currentVersion + 1,
            }
            providers.set(args.p_provider_id, row)
            return { data: row, error: null }
          }
          return { data: null, error: { message: 'unsupported_rpc' } }
        },
      }
    },
  }
}

function createRequest({
  body = {},
  method = 'POST',
  query = {},
  token = 'admin-token',
} = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
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

function countDeployableFunctions(dir = join(root, 'api')) {
  const found = []
  function walk(current) {
    for (const entry of readdirSync(current)) {
      if (entry.startsWith('_') || entry.endsWith('.test.js')) continue
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'index.js') found.push(full)
    }
  }
  walk(dir)
  return found
}

function servicePair() {
  const audits = createInMemoryAdminAuditStore()
  const permissions = createInMemoryAdminPermissionStore()
  const service = createBillingAdminService({ audits, permissions })
  return { audits, permissions, service }
}

describe('BILL-5B3C admin kill switches', () => {
  const originalEnv = { ...process.env }
  let fake
  let controls

  beforeEach(async () => {
    process.env = { ...originalEnv }
    const { service } = servicePair()
    await service.bootstrapGrantForTests(ADMIN)
    fake = createFakeBillingClient()
    fake.admins.add(ADMIN)
    controls = createPostgresBillingControlAdapter({ client: fake })
    setBillingAdminServiceForTests(service)
    setBillingAdminControlsForTests(controls)
    setBillingAdminStoreUnavailableForTests(false)
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'admin-token') return { user: { id: ADMIN } }
      if (token === 'user-token') return { user: { id: USER } }
      return { error: { message: 'invalid jwt' } }
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setBillingAdminServiceForTests(null)
    setBillingAdminControlsForTests(undefined)
    setBillingAdminStoreUnavailableForTests(false)
    setSupabaseAuthVerifierForTests(null)
    setFoodScanBillingRuntimeForTests(null)
  })

  it('denies unauthenticated kill-switch mutation', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
      token: '',
    }), response)
    expect(response.statusCode).toBe(401)
    expect(fake.rpcCalls.some((call) => call.fn === 'set_feature_control')).toBe(false)
  })

  it('denies authenticated but unauthorized kill-switch mutation', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
      token: 'user-token',
    }), response)
    expect(response.statusCode).toBe(403)
    expect(fake.rpcCalls.some((call) => call.fn === 'set_feature_control')).toBe(false)
  })

  it('denies invalid feature ids', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'secret.nuke', mode: 'DISABLED' },
    }), response)
    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('UNKNOWN_FEATURE')
    expect(fake.rpcCalls.some((call) => call.fn === 'set_feature_control')).toBe(false)
  })

  it('denies invalid provider ids', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_provider_control', provider_id: 'acme.magic', mode: 'UNAVAILABLE' },
    }), response)
    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('UNKNOWN_PROVIDER')
    expect(fake.rpcCalls.some((call) => call.fn === 'set_provider_control')).toBe(false)
  })

  it('denies invalid control states including MAINTENANCE on this surface', async () => {
    const feature = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'MAINTENANCE' },
    }), feature)
    expect(feature.statusCode).toBe(400)
    expect(feature.body.error.code).toBe('INVALID_CONTROL_STATE')
    const provider = createResponse()
    await handler(createRequest({
      body: { action: 'set_provider_control', provider_id: 'openai', mode: 'DOWN' },
    }), provider)
    expect(provider.statusCode).toBe(400)
    expect(provider.body.error.code).toBe('INVALID_CONTROL_STATE')
  })

  it('disables food.scan through set_feature_control', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(fake.rpcCalls.some((call) => call.fn === 'set_feature_control' && call.args.p_feature_id === 'food.scan' && call.args.p_mode === 'DISABLED')).toBe(true)
    expect(response.body.control).toEqual({
      feature_id: 'food.scan',
      mode: FEATURE_MODE.DISABLED,
      reason_code: 'SECURITY',
      version: 1,
    })
  })

  it('enables food.scan through set_feature_control', async () => {
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
    }), createResponse())
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_feature_control',
        expected_version: 1,
        feature_id: 'food.scan',
        mode: 'ENABLED',
      },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.control.mode).toBe(FEATURE_MODE.ENABLED)
    expect(response.body.control.version).toBe(2)
  })

  it('marks openai unavailable through set_provider_control', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_provider_control', provider_id: 'openai', mode: 'UNAVAILABLE' },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(fake.rpcCalls.some((call) => call.fn === 'set_provider_control' && call.args.p_provider_id === 'openai')).toBe(true)
    expect(response.body.control.mode).toBe(PROVIDER_MODE.UNAVAILABLE)
  })

  it('marks openai available through set_provider_control', async () => {
    await handler(createRequest({
      body: { action: 'set_provider_control', provider_id: 'openai', mode: 'UNAVAILABLE' },
    }), createResponse())
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_provider_control',
        expected_version: 1,
        mode: 'AVAILABLE',
        provider_id: 'openai',
      },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.control.mode).toBe(PROVIDER_MODE.AVAILABLE)
  })

  it('fails closed when durable controls are unavailable', async () => {
    setBillingAdminStoreUnavailableForTests(true)
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
    }), response)
    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('ADMIN_STORE_UNAVAILABLE')
    expect(response.body.ok).toBe(false)
    expect(response.body.control).toBeUndefined()
    expect(fake.rpcCalls.some((call) => call.fn === 'set_feature_control')).toBe(false)
  })

  it('does not use a process Map as production control authority', () => {
    const adapterSrc = readFileSync(join(root, 'src/services/billing/billingControlPostgres.js'), 'utf8')
    const adminSrc = readFileSync(join(root, 'api/_shared/billing/admin.js'), 'utf8')
    const routeSrc = readFileSync(join(root, 'api/billing/admin/index.js'), 'utf8')
    expect(adapterSrc).toMatch(/set_feature_control/)
    expect(adapterSrc).toMatch(/set_provider_control/)
    expect(adapterSrc).not.toMatch(/new Map/)
    expect(adapterSrc).toMatch(/durable: true/)
    expect(adminSrc).toMatch(/createPostgresBillingControlAdapter/)
    expect(adminSrc).not.toMatch(/createInMemoryFeatureControlStore/)
    expect(routeSrc).toMatch(/ADMIN_STORE_UNAVAILABLE/)
  })

  it('read-back confirms feature state after disable', async () => {
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
    }), createResponse())
    const row = await controls.getFeatureControl('food.scan')
    expect(row.mode).toBe(FEATURE_MODE.DISABLED)
    expect(row.feature_id).toBe('food.scan')
  })

  it('read-back confirms provider state after unavailable', async () => {
    await handler(createRequest({
      body: { action: 'set_provider_control', provider_id: 'openai', mode: 'UNAVAILABLE' },
    }), createResponse())
    const row = await controls.getProviderControl('openai')
    expect(row.mode).toBe(PROVIDER_MODE.UNAVAILABLE)
    expect(row.provider_id).toBe('openai')
  })

  it('disabled food.scan evaluation does not call the provider', async () => {
    await handler(createRequest({
      body: { action: 'set_feature_control', feature_id: 'food.scan', mode: 'DISABLED' },
    }), createResponse())
    const featureControl = await controls.getFeatureControl('food.scan')
    const runtime = installFoodScanBillingTestRuntime({ featureControl })
    const executeProvider = vi.fn(async () => ({ ok: true }))
    const { billing } = await executeFoodScanMeteredOperation({
      executeProvider,
      operationId: 'op_killswitch_feature_disabled01',
      runtime,
      userId: USER,
    })
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(billing.decision).toBe(ENFORCEMENT_DECISION.DENY_FEATURE_DISABLED)
    expect(billing.outcome).toBe(LIFECYCLE_OUTCOME.DENIED_EVALUATE)
    expect(billing.calls.reserve).toBe(0)
  })

  it('unavailable openai evaluation does not call the provider', async () => {
    await handler(createRequest({
      body: { action: 'set_provider_control', provider_id: 'openai', mode: 'UNAVAILABLE' },
    }), createResponse())
    const providerControl = await controls.getProviderControl('openai')
    const runtime = installFoodScanBillingTestRuntime({
      providerControls: [providerControl],
    })
    const executeProvider = vi.fn(async () => ({ ok: true }))
    const { billing } = await executeFoodScanMeteredOperation({
      executeProvider,
      operationId: 'op_killswitch_provider_unavail01',
      runtime,
      userId: USER,
    })
    expect(executeProvider).toHaveBeenCalledTimes(0)
    expect(billing.decision).toBe(ENFORCEMENT_DECISION.DENY_PROVIDER_UNAVAILABLE)
    expect(billing.calls.reserve).toBe(0)
  })

  it('preserves existing admin grant behavior', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'grant', reason_code: 'MANUAL_ADMIN', target_user_id: USER },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.permission).toBe('ACTIVE')
  })

  it('preserves existing admin revoke behavior', async () => {
    await handler(createRequest({
      body: { action: 'grant', target_user_id: USER },
    }), createResponse())
    const response = createResponse()
    await handler(createRequest({
      body: { action: 'revoke', target_user_id: USER },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(response.body.permission).toBe('REVOKED')
  })

  it('does not expose secrets in kill-switch responses or logs', async () => {
    const logs = []
    const spy = vi.spyOn(console, 'info').mockImplementation((...args) => {
      logs.push(JSON.stringify(args))
    })
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_feature_control',
        api_key: 'sk-live-secret',
        feature_id: 'food.scan',
        mode: 'DISABLED',
        service_role: 'service-role-value',
        token: 'Bearer abc',
      },
    }), response)
    spy.mockRestore()
    const blob = `${JSON.stringify(response.body)}\n${logs.join('\n')}`
    expect(blob).not.toMatch(/sk-live-secret|service-role-value|Bearer abc|SUPABASE_SERVICE_ROLE/)
    expect(response.body.control.feature_id).toBe('food.scan')
  })

  it('ignores client-selected rpc/table/schema injection', async () => {
    const response = createResponse()
    await handler(createRequest({
      body: {
        action: 'set_feature_control',
        feature_id: 'food.scan',
        mode: 'DISABLED',
        rpc: 'reserve_quota',
        schema: 'public',
        sql: 'delete from billing.usage_events',
        table: 'usage_events',
      },
    }), response)
    expect(response.statusCode).toBe(200)
    expect(fake.rpcCalls.map((call) => call.fn).sort()).toEqual([
      'has_billing_admin',
      'set_feature_control',
    ].sort())
    expect(fake.rpcCalls.some((call) => call.fn === 'reserve_quota')).toBe(false)
  })

  it('does not add a new API route and keeps 11 deployable functions', () => {
    const functions = countDeployableFunctions()
    expect(functions).toHaveLength(11)
    expect(readFileSync(join(root, 'api/billing/admin/index.js'), 'utf8')).toMatch(/set_feature_control/)
    expect(functions.some((file) => file.includes('kill-switch'))).toBe(false)
  })
})

describe('BILL-5B3C postgres control adapter', () => {
  it('requires a schema-capable client', () => {
    expect(() => createPostgresBillingControlAdapter({})).toThrow(/admin_store_unavailable/)
  })

  it('calls billing RPCs with server actor id', async () => {
    const fake = createFakeBillingClient()
    fake.admins.add(ADMIN)
    const adapter = createPostgresBillingControlAdapter({ client: fake })
    await adapter.setFeatureControl({
      actorUserId: ADMIN,
      expectedVersion: 0,
      featureId: 'food.scan',
      mode: 'DISABLED',
      reasonCode: 'SECURITY',
    })
    expect(fake.rpcCalls[0]).toEqual({
      args: {
        p_actor_user_id: ADMIN,
        p_expected_version: 0,
        p_feature_id: 'food.scan',
        p_mode: 'DISABLED',
        p_reason_code: 'SECURITY',
      },
      fn: 'set_feature_control',
    })
  })
})

