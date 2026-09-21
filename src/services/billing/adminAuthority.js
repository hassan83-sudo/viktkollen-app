import {
  ADMIN_AUDIT_MAX_SNAPSHOT_BYTES,
  ADMIN_AUDIT_SAFE_KEYS,
  BILLING_PERMISSION,
  PERMISSION_STATUS,
} from './catalog.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FORBIDDEN_AUDIT_KEYS = Object.freeze([
  'api_key',
  'audio',
  'auth_token',
  'bank',
  'card_number',
  'chat_text',
  'coordinates',
  'credential',
  'cvv',
  'database_url',
  'gps',
  'image',
  'latitude',
  'longitude',
  'password',
  'prompt',
  'response',
  'secret',
  'service_role',
  'token',
  'transcript',
])

function throwAudit(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function keyLooksSensitive(key) {
  const lowered = String(key || '').toLowerCase()
  return FORBIDDEN_AUDIT_KEYS.some((item) => lowered === item || lowered.includes(item))
}

function walkAuditNode(node) {
  if (Array.isArray(node)) throwAudit('audit_nested_payload')
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (keyLooksSensitive(key)) throwAudit('audit_sensitive_field')
    if (value && typeof value === 'object') throwAudit('audit_nested_payload')
  }
}

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
    if (key === 'version' && Number.isInteger(value) && value >= 1) safe[key] = value
  }
  return Object.freeze(safe)
}

export function assertAuditPayloadSafe(snapshot = {}) {
  if (snapshot == null) return {}
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) throwAudit('audit_nested_payload')
  const encoded = JSON.stringify(snapshot)
  if (encoded.length > ADMIN_AUDIT_MAX_SNAPSHOT_BYTES) throwAudit('audit_payload_too_large')
  walkAuditNode(snapshot)
  const text = encoded.toLowerCase()
  for (const key of FORBIDDEN_AUDIT_KEYS) {
    if (text.includes(`"${key}"`)) throwAudit('audit_sensitive_field')
  }
  const safe = sanitizeAdminSnapshot(snapshot)
  if (JSON.stringify(safe).length > ADMIN_AUDIT_MAX_SNAPSHOT_BYTES) throwAudit('audit_payload_too_large')
  return safe
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
      if (row.permission !== BILLING_PERMISSION.ADMIN) {
        throwAudit('unknown_permission')
      }
      if (!Object.values(PERMISSION_STATUS).includes(row.status)) {
        throwAudit('unknown_permission_status')
      }
      const stored = Object.freeze({ ...row })
      byKey.set(keyOf(stored.user_id, stored.permission), stored)
      return stored
    },
    async remove(userId, permission = BILLING_PERMISSION.ADMIN) {
      byKey.delete(keyOf(userId, permission))
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
        throwAudit('duplicate_audit')
      }
      const stored = Object.freeze({ ...row })
      byId.set(stored.audit_id, stored)
      return stored
    },
    async replace() {
      throwAudit('audit_append_only')
    },
    async remove() {
      throwAudit('audit_append_only')
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
