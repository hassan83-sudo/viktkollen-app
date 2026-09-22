import { createSupabaseAdminClient } from '../supabaseServer.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { BILLING_PERMISSION } from '../../../src/services/billing/catalog.js'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'
import { createPostgresBillingControlAdapter } from '../../../src/services/billing/billingControlPostgres.js'

let authority = createBillingAdminService()
let testServiceInjected = false
let controlsForTests = undefined
let forceUnavailable = false

export function setBillingAdminServiceForTests(service = null) {
  authority = service || createBillingAdminService()
  testServiceInjected = service != null
  forceUnavailable = false
}

export function setBillingAdminControlsForTests(controls = undefined) {
  controlsForTests = controls
}

export function setBillingAdminStoreUnavailableForTests(unavailable = true) {
  forceUnavailable = unavailable === true
}

export function getBillingAdminService() {
  return authority
}

export function resolveBillingControlAdapter() {
  if (forceUnavailable) return null
  if (controlsForTests !== undefined) return controlsForTests
  if (testServiceInjected) return null
  const client = createSupabaseAdminClient()
  if (!client) return null
  try {
    return createPostgresBillingControlAdapter({ client })
  } catch {
    return null
  }
}

export async function requireBillingAdmin(request, { requestId = '' } = {}) {
  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return {
      ok: false,
      status: auth.status,
      error: auth.error,
    }
  }

  const adapter = resolveBillingControlAdapter()
  const checker = adapter && typeof adapter.hasBillingAdmin === 'function'
    ? (userId) => adapter.hasBillingAdmin(userId)
    : (userId) => authority.hasBillingAdmin(userId)

  const allowed = await Promise.resolve(checker(auth.user.id)).catch(() => false)
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: { code: 'FORBIDDEN' },
    }
  }

  return {
    ok: true,
    permissions: [BILLING_PERMISSION.ADMIN],
    user: auth.user,
  }
}

export function toClientSafeAdminSession(admin) {
  return {
    authorized: true,
    permissions: admin.permissions || [BILLING_PERMISSION.ADMIN],
  }
}

export function toClientSafeControl(row = {}) {
  if (!row || typeof row !== 'object') return null
  const safe = {}
  if (typeof row.feature_id === 'string') safe.feature_id = row.feature_id
  if (typeof row.provider_id === 'string') safe.provider_id = row.provider_id
  if (typeof row.mode === 'string') safe.mode = row.mode
  if (typeof row.reason_code === 'string' || row.reason_code == null) safe.reason_code = row.reason_code || null
  if (Number.isInteger(row.version)) safe.version = row.version
  return safe
}
