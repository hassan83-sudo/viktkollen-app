import {
  ADMIN_AUDIT_SAFE_KEYS,
  BILLING_PERMISSION,
} from './catalog.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FORBIDDEN_AUDIT_KEYS = Object.freeze([
  'api_key',
  'audio',
  'card_number',
  'coordinates',
  'cvv',
  'database_url',
  'image',
  'latitude',
  'longitude',
  'password',
  'prompt',
  'response',
  'service_role',
  'token',
])

export function isBillingAdminPermission(value) {
  return value === BILLING_PERMISSION.ADMIN
}

export function sanitizeAdminSnapshot(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const safe = {}
  for (const key of ADMIN_AUDIT_SAFE_KEYS) {
    if (!(key in input)) continue
    const value = input[key]
    if (typeof value === 'string' && value.length <= 120) safe[key] = value
  }
  return Object.freeze(safe)
}

export function assertAuditPayloadSafe(snapshot = {}) {
  const text = JSON.stringify(snapshot)
  for (const key of FORBIDDEN_AUDIT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key) || new RegExp(`"${key}"`, 'i').test(text)) {
      const error = new Error('audit_sensitive_field')
      error.code = 'audit_sensitive_field'
      throw error
    }
  }
  return sanitizeAdminSnapshot(snapshot)
}

export function createInMemoryAdminPermissionStore() {
  const byKey = new Map()

  function keyOf(userId, permission) {
    return `${userId}:${permission}`
  }

  return {
    async get(userId, permission = BILLING_PERMISSION.ADMIN) {
      return byKey.get(keyOf(userId, permission)) || null
    },
    async upsert(row) {
      const stored = Object.freeze({ ...row })
      byKey.set(keyOf(stored.user_id, stored.permission), stored)
      return stored
    },
    async list() {
      return [...byKey.values()]
    },
    reset() {
      byKey.clear()
    },
  }
}

export function createInMemoryAdminAuditStore() {
  const byId = new Map()

  return {
    async insert(row) {
      if (byId.has(row.audit_id)) {
        const error = new Error('duplicate_audit')
        error.code = 'duplicate_audit'
        throw error
      }
      const stored = Object.freeze({ ...row })
      byId.set(stored.audit_id, stored)
      return stored
    },
    async replace() {
      const error = new Error('audit_append_only')
      error.code = 'audit_append_only'
      throw error
    },
    async remove() {
      const error = new Error('audit_append_only')
      error.code = 'audit_append_only'
      throw error
    },
    async list() {
      return [...byId.values()]
    },
    reset() {
      byId.clear()
    },
  }
}

export { UUID_RE }
