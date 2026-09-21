export const USAGE_EVENT_TYPES = Object.freeze([
  'ai.text.request',
  'ai.voice.session',
  'tts.request',
  'food.scan',
  'ai.eye.analysis',
  'ai.ear.interpret',
  'body.scan',
  'gps.live.session',
])

export const USAGE_UNITS = Object.freeze([
  'requests',
  'tokens',
  'seconds',
  'images',
  'sessions',
  'writes',
  'reads',
])

export const USAGE_BASIS = Object.freeze(['MEASURED', 'ESTIMATED', 'UNAVAILABLE'])
export const COST_BASIS = Object.freeze(['ESTIMATED', 'UNAVAILABLE'])

export const USAGE_METADATA_ALLOWLIST = Object.freeze([
  'cached_tokens',
  'image_count',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'usage_basis',
])

export const SENSITIVE_USAGE_FIELDS = Object.freeze([
  'api_key',
  'audio',
  'audio_url',
  'card_number',
  'coordinates',
  'cvv',
  'image',
  'image_hash',
  'image_url',
  'latitude',
  'longitude',
  'password',
  'prompt',
  'response',
  'transcript',
])

export const SUPPORTED_CURRENCIES = Object.freeze(['SEK', 'USD', 'EUR'])
export const CATALOG_STATUS = Object.freeze(['UNCONFIGURED', 'UNKNOWN', 'CONFIGURED'])

/** BILL-2: single unit list is USAGE_UNITS. Do not add a second unit system. */
export const BILLING_INTERVALS = Object.freeze(['day', 'week', 'month'])

export const LIMIT_KIND = Object.freeze({
  NUMBER: 'NUMBER',
  UNLIMITED: 'UNLIMITED',
})

export const QUOTA_STATUS = Object.freeze({
  ALLOWED: 'ALLOWED',
  ALLOWED_UNMETERED: 'ALLOWED_UNMETERED',
  COMMITTED: 'COMMITTED',
  DENIED_DISABLED: 'DENIED_DISABLED',
  DENIED_INVALID_QUANTITY: 'DENIED_INVALID_QUANTITY',
  DENIED_NO_USER: 'DENIED_NO_USER',
  DENIED_QUOTA_EXCEEDED: 'DENIED_QUOTA_EXCEEDED',
  DENIED_UNIT_MISMATCH: 'DENIED_UNIT_MISMATCH',
  DENIED_UNKNOWN_FEATURE: 'DENIED_UNKNOWN_FEATURE',
  DENIED_UNKNOWN_PLAN: 'DENIED_UNKNOWN_PLAN',
  RESERVED: 'RESERVED',
  ROLLED_BACK: 'ROLLED_BACK',
  UNLIMITED: 'UNLIMITED',
})

export const RESERVATION_STATUS = Object.freeze({
  COMMITTED: 'COMMITTED',
  EXPIRED: 'EXPIRED',
  PENDING: 'PENDING',
  ROLLED_BACK: 'ROLLED_BACK',
})

export const PLAN_PRICE_STATUS = Object.freeze({
  ADMIN_CONFIGURABLE: 'ADMIN-CONFIGURABLE',
  PRELIMINARY: 'PRELIMINARY',
})

/**
 * If actual usage exceeds the reservation, count the actual integer against
 * the period and never report negative remaining. Future reserves use the
 * updated committed total. Documented in docs/billing/BILL_2_PLAN_QUOTA.md.
 */
export const OVERAGE_POLICY = 'COMMIT_ACTUAL_COUNT_OVERAGE'

export const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  PAST_DUE: 'PAST_DUE',
  PAUSED: 'PAUSED',
  TRIALING: 'TRIALING',
})

export const SUBSCRIPTION_TERMINAL = Object.freeze([
  SUBSCRIPTION_STATUS.CANCELED,
  SUBSCRIPTION_STATUS.EXPIRED,
])

export const SUBSCRIPTION_OPEN = Object.freeze([
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.PAST_DUE,
  SUBSCRIPTION_STATUS.PAUSED,
  SUBSCRIPTION_STATUS.TRIALING,
])

export const PLAN_CHANGE_WHEN = Object.freeze({
  NEXT_PERIOD: 'next_period',
  NOW: 'now',
})

export const BILLING_PERMISSION = Object.freeze({
  ADMIN: 'billing_admin',
})

export const PERMISSION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
})

export const ADMIN_AUDIT_REASONS = Object.freeze([
  'COST_CONTROL',
  'MAINTENANCE',
  'MANUAL_ADMIN',
  'PROVIDER_OUTAGE',
  'SECURITY',
])

export const ADMIN_AUDIT_ACTION = Object.freeze({
  FEATURE_CONTROL_CHANGED: 'feature.control.changed',
  FEATURE_CONTROL_CREATED: 'feature.control.created',
  PERMISSION_GRANT: 'permission.grant',
  PERMISSION_REVOKE: 'permission.revoke',
})

export const ADMIN_AUDIT_ACTIONS = Object.freeze(Object.values(ADMIN_AUDIT_ACTION))

export const ADMIN_AUDIT_TARGET_TYPE = 'admin_permission'

export const ADMIN_AUDIT_TARGET_TYPES = Object.freeze([
  'admin_permission',
  'feature_control',
])

export const FEATURE_CONTROL_TARGET_TYPE = 'feature_control'

export const ADMIN_AUDIT_SAFE_KEYS = Object.freeze([
  'feature_id',
  'mode',
  'permission',
  'reason_code',
  'status',
  'target_id',
  'target_type',
  'user_id',
  'version',
])

export const ADMIN_AUDIT_MAX_SNAPSHOT_BYTES = 2048

export const FEATURE_CLASSIFICATION = Object.freeze({
  EXTERNAL_COST: 'EXTERNAL_COST',
  LOCAL_FREE: 'LOCAL_FREE',
  PARTIAL: 'PARTIAL',
})

export const FEATURE_MODE = Object.freeze({
  DISABLED: 'DISABLED',
  ENABLED: 'ENABLED',
  MAINTENANCE: 'MAINTENANCE',
})

export const FEATURE_AVAILABILITY = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  DISABLED: 'DISABLED',
  MAINTENANCE: 'MAINTENANCE',
  UNKNOWN_FEATURE: 'UNKNOWN_FEATURE',
})

export const FEATURE_CONTROL_REASONS = Object.freeze([
  'MAINTENANCE',
  'MANUAL_ADMIN',
  'SECURITY',
])

export const PROVIDER_CLASSIFICATION = Object.freeze({
  EXTERNAL_API: 'EXTERNAL_API',
  EXTERNAL_COMPUTE: 'EXTERNAL_COMPUTE',
})

export const PROVIDER_MODE = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  MAINTENANCE: 'MAINTENANCE',
  UNAVAILABLE: 'UNAVAILABLE',
})

export const PROVIDER_AVAILABILITY = Object.freeze({
  PROVIDER_AVAILABLE: 'PROVIDER_AVAILABLE',
  PROVIDER_MAINTENANCE: 'PROVIDER_MAINTENANCE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
})

export const OPERATIONAL_AVAILABILITY = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  DISABLED: 'DISABLED',
  MAINTENANCE: 'MAINTENANCE',
  PROVIDER_MAINTENANCE: 'PROVIDER_MAINTENANCE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  UNKNOWN_FEATURE: 'UNKNOWN_FEATURE',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
})

export const PROVIDER_CONTROL_REASONS = Object.freeze([
  'MAINTENANCE',
  'MANUAL_ADMIN',
  'PROVIDER_OUTAGE',
  'SECURITY',
])
