import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { BILLING_PERMISSION } from '../../../src/services/billing/catalog.js'
import { createBillingAdminService } from '../../../src/services/billing/adminService.js'

let authority = createBillingAdminService()

export function setBillingAdminServiceForTests(service = null) {
  authority = service || createBillingAdminService()
}

export function getBillingAdminService() {
  return authority
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

  const allowed = await authority.hasBillingAdmin(auth.user.id).catch(() => false)
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
