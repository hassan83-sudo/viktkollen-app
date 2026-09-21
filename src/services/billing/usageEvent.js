import {
  COST_BASIS,
  SENSITIVE_USAGE_FIELDS,
  USAGE_BASIS,
  USAGE_EVENT_TYPES,
  USAGE_METADATA_ALLOWLIST,
  USAGE_UNITS,
} from './catalog.js'

const CORE_FIELDS = new Set([
  'cost_basis',
  'event_id',
  'event_type',
  'feature',
  'model',
  'occurred_at',
  'provider',
  'quantity',
  'reference_id',
  'unit',
  'user_id',
])

function isNonEmptyString(value, max = 120) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
}

function hasSensitiveKey(key) {
  const normalized = String(key || '').toLowerCase()
  return SENSITIVE_USAGE_FIELDS.some((field) => normalized === field || normalized.includes(field))
}

export function sanitizeUsageMetadata(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const metadata = {}
  for (const [key, value] of Object.entries(input)) {
    if (CORE_FIELDS.has(key) || hasSensitiveKey(key)) continue
    if (!USAGE_METADATA_ALLOWLIST.includes(key)) continue
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      metadata[key] = Number.isInteger(value) ? value : Math.floor(value)
      continue
    }
    if (typeof value === 'string' && USAGE_BASIS.includes(value)) {
      metadata[key] = value
    }
  }
  return metadata
}

export function createUsageEvent(input = {}) {
  const errors = []
  const eventType = String(input.event_type || '').trim()
  const unit = String(input.unit || '').trim()
  const quantity = Number(input.quantity)
  const occurredAt = input.occurred_at ? new Date(input.occurred_at) : new Date()

  if (!USAGE_EVENT_TYPES.includes(eventType)) errors.push('invalid_event_type')
  if (!USAGE_UNITS.includes(unit)) errors.push('invalid_unit')
  if (!Number.isInteger(quantity) || quantity < 0) errors.push('invalid_quantity')
  if (Number.isNaN(occurredAt.getTime())) errors.push('invalid_timestamp')
  if (input.provider && !isNonEmptyString(input.provider, 80)) errors.push('invalid_provider')
  if (input.model && !isNonEmptyString(input.model, 80)) errors.push('invalid_model')
  if (input.feature && !isNonEmptyString(input.feature, 80)) errors.push('invalid_feature')
  if (input.cost_basis && !COST_BASIS.includes(input.cost_basis)) errors.push('invalid_cost_basis')

  const eventId = String(input.event_id || input.idempotency_key || '').trim()
  if (!isNonEmptyString(eventId, 180)) errors.push('missing_event_id')

  if (errors.length) {
    const error = new Error(errors[0])
    error.code = errors[0]
    error.details = errors
    throw error
  }

  return {
    cost_basis: input.cost_basis || 'UNAVAILABLE',
    event_id: eventId,
    event_type: eventType,
    feature: input.feature ? String(input.feature).trim() : eventType,
    metadata: sanitizeUsageMetadata(input.metadata),
    model: input.model ? String(input.model).trim() : '',
    occurred_at: occurredAt.toISOString(),
    provider: input.provider ? String(input.provider).trim() : '',
    quantity,
    reference_id: input.reference_id ? String(input.reference_id).trim().slice(0, 180) : eventId,
    unit,
    user_id: input.user_id ? String(input.user_id).trim().slice(0, 80) : '',
  }
}

export function usageEventContainsSensitiveContent(event) {
  const blob = JSON.stringify(event || {})
  return SENSITIVE_USAGE_FIELDS.some((field) => new RegExp(`"${field}"\\s*:`, 'i').test(blob))
}
