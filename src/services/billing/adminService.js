import { randomUUID } from 'node:crypto'
import {
  ADMIN_AUDIT_ACTION,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_REASONS,
  ADMIN_AUDIT_TARGET_TYPE,
  ADMIN_AUDIT_TARGET_TYPES,
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
import { resolveFeatureId } from './features.js'

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
    try {
      const row = await permissions.get(id, BILLING_PERMISSION.ADMIN)
      return row?.status === PERMISSION_STATUS.ACTIVE
    } catch {
      return false
    }
  }

  async function writeAudit({ action, actorUserId, after, before, reasonCode, targetId, targetType }) {
    if (!ADMIN_AUDIT_ACTIONS.includes(action)) {
      const error = new Error('invalid_audit_action')
      error.code = 'invalid_audit_action'
      throw error
    }
    if (!ADMIN_AUDIT_TARGET_TYPES.includes(targetType)) {
      const error = new Error('invalid_target_type')
      error.code = 'invalid_target_type'
      throw error
    }
    let storedTargetId
    if (targetType === ADMIN_AUDIT_TARGET_TYPE) {
      storedTargetId = requireUuid(targetId, 'invalid_target_id')
    } else {
      const featureId = resolveFeatureId(targetId)
      if (!featureId || featureId !== String(targetId || '').trim()) {
        const error = new Error('invalid_target_id')
        error.code = 'invalid_target_id'
        throw error
      }
      storedTargetId = featureId
    }
    return audits.insert({
      action,
      admin_user_id: actorUserId,
      after_safe: assertAuditPayloadSafe(after),
      audit_id: randomUUID(),
      before_safe: assertAuditPayloadSafe(before),
      created_at: now().toISOString(),
      reason_code: requireReason(reasonCode),
      target_id: storedTargetId,
      target_type: targetType,
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
    if (existing?.status === PERMISSION_STATUS.ACTIVE) {
      return { audit: null, permission: existing }
    }
    const next = await permissions.upsert({
      created_at: existing?.created_at || now().toISOString(),
      permission: BILLING_PERMISSION.ADMIN,
      status: PERMISSION_STATUS.ACTIVE,
      updated_at: now().toISOString(),
      user_id: target,
    })
    try {
      const audit = await writeAudit({
        action: ADMIN_AUDIT_ACTION.PERMISSION_GRANT,
        actorUserId: actor,
        after: sanitizeAdminSnapshot(next),
        before: sanitizeAdminSnapshot(existing || {}),
        reasonCode,
        targetId: target,
        targetType: ADMIN_AUDIT_TARGET_TYPE,
      })
      return { audit, permission: next }
    } catch (error) {
      if (existing) await permissions.upsert(existing)
      else await permissions.remove(target, BILLING_PERMISSION.ADMIN)
      throw error
    }
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
    try {
      const audit = await writeAudit({
        action: ADMIN_AUDIT_ACTION.PERMISSION_REVOKE,
        actorUserId: actor,
        after: sanitizeAdminSnapshot(next),
        before: sanitizeAdminSnapshot(existing),
        reasonCode,
        targetId: target,
        targetType: ADMIN_AUDIT_TARGET_TYPE,
      })
      return { audit, permission: next }
    } catch (error) {
      await permissions.upsert(existing)
      throw error
    }
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
