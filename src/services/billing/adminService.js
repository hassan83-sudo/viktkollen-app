import { randomUUID } from 'node:crypto'
import {
  ADMIN_AUDIT_ACTION,
  ADMIN_AUDIT_REASONS,
  BILLING_PERMISSION,
  PERMISSION_STATUS,
} from './catalog.js'
import {
  UUID_RE,
  assertAuditPayloadSafe,
  createInMemoryAdminAuditStore,
  createInMemoryAdminPermissionStore,
  isBillingAdminPermission,
  sanitizeAdminSnapshot,
} from './adminAuthority.js'

function requireUuid(value, code = 'invalid_user_id') {
  const id = String(value || '').trim()
  if (!UUID_RE.test(id)) {
    const error = new Error(code)
    error.code = code
    throw error
  }
  return id
}

function requireReason(reason) {
  if (!ADMIN_AUDIT_REASONS.includes(reason)) {
    const error = new Error('invalid_reason_code')
    error.code = 'invalid_reason_code'
    throw error
  }
  return reason
}

/**
 * In-memory default is empty → deny. Not production persistence.
 * Production lookup is billing.admin_permissions via service_role SELECT/RPC.
 * No permission cache: revoke is visible on the next call.
 */
export function createBillingAdminService({
  audits = createInMemoryAdminAuditStore(),
  now = () => new Date(),
  permissions = createInMemoryAdminPermissionStore(),
} = {}) {
  async function hasBillingAdmin(userId) {
    const id = String(userId || '').trim()
    if (!UUID_RE.test(id)) return false
    const row = await permissions.get(id, BILLING_PERMISSION.ADMIN)
    return row?.status === PERMISSION_STATUS.ACTIVE
  }

  async function writeAudit({ action, actorUserId, after, before, reasonCode, targetId, targetType }) {
    return audits.insert({
      action,
      admin_user_id: actorUserId,
      after_safe: assertAuditPayloadSafe(after),
      audit_id: randomUUID(),
      before_safe: assertAuditPayloadSafe(before),
      created_at: now().toISOString(),
      reason_code: requireReason(reasonCode),
      target_id: String(targetId || '').slice(0, 80),
      target_type: String(targetType || 'permission').slice(0, 40),
    })
  }

  async function grant({ actorUserId, clientClaim = {}, reasonCode = 'MANUAL_ADMIN', targetUserId }) {
    void clientClaim.admin_user_id
    void clientClaim.isAdmin
    const actor = requireUuid(actorUserId)
    const target = requireUuid(targetUserId, 'invalid_target_user_id')
    if (!(await hasBillingAdmin(actor))) {
      const error = new Error('forbidden_admin')
      error.code = 'forbidden_admin'
      throw error
    }
    if (!isBillingAdminPermission(BILLING_PERMISSION.ADMIN)) {
      const error = new Error('unknown_permission')
      error.code = 'unknown_permission'
      throw error
    }
    const existing = await permissions.get(target, BILLING_PERMISSION.ADMIN)
    const next = await permissions.upsert({
      created_at: existing?.created_at || now().toISOString(),
      permission: BILLING_PERMISSION.ADMIN,
      status: PERMISSION_STATUS.ACTIVE,
      updated_at: now().toISOString(),
      user_id: target,
    })
    if (existing?.status === PERMISSION_STATUS.ACTIVE) return { audit: null, permission: next }
    const audit = await writeAudit({
      action: ADMIN_AUDIT_ACTION.PERMISSION_GRANT,
      actorUserId: actor,
      after: sanitizeAdminSnapshot(next),
      before: sanitizeAdminSnapshot(existing || {}),
      reasonCode,
      targetId: target,
      targetType: 'admin_permission',
    })
    return { audit, permission: next }
  }

  async function revoke({ actorUserId, clientClaim = {}, reasonCode = 'SECURITY', targetUserId }) {
    void clientClaim.admin_user_id
    const actor = requireUuid(actorUserId)
    const target = requireUuid(targetUserId, 'invalid_target_user_id')
    if (!(await hasBillingAdmin(actor))) {
      const error = new Error('forbidden_admin')
      error.code = 'forbidden_admin'
      throw error
    }
    const existing = await permissions.get(target, BILLING_PERMISSION.ADMIN)
    if (!existing || existing.status !== PERMISSION_STATUS.ACTIVE) {
      const error = new Error('permission_not_active')
      error.code = 'permission_not_active'
      throw error
    }
    const next = await permissions.upsert({
      ...existing,
      status: PERMISSION_STATUS.REVOKED,
      updated_at: now().toISOString(),
    })
    const audit = await writeAudit({
      action: ADMIN_AUDIT_ACTION.PERMISSION_REVOKE,
      actorUserId: actor,
      after: sanitizeAdminSnapshot(next),
      before: sanitizeAdminSnapshot(existing),
      reasonCode,
      targetId: target,
      targetType: 'admin_permission',
    })
    return { audit, permission: next }
  }

  async function bootstrapGrantForTests(userId) {
    return permissions.upsert({
      created_at: now().toISOString(),
      permission: BILLING_PERMISSION.ADMIN,
      status: PERMISSION_STATUS.ACTIVE,
      updated_at: now().toISOString(),
      user_id: requireUuid(userId),
    })
  }

  return {
    bootstrapGrantForTests,
    grant,
    hasBillingAdmin,
    listAudits: () => audits.list(),
    revoke,
    writeAudit,
  }
}
