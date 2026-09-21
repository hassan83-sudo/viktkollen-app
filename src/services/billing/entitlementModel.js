import { LIMIT_KIND, USAGE_UNITS } from './catalog.js'

export function numberLimit(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    const error = new Error('invalid_limit')
    error.code = 'invalid_limit'
    throw error
  }
  return Object.freeze({ kind: LIMIT_KIND.NUMBER, value: n })
}

export function unlimitedLimit() {
  return Object.freeze({ kind: LIMIT_KIND.UNLIMITED, value: null })
}

export function isUnlimitedLimit(limit) {
  return limit?.kind === LIMIT_KIND.UNLIMITED
}

export function limitValue(limit) {
  if (isUnlimitedLimit(limit)) return null
  return Number.isInteger(limit?.value) ? limit.value : 0
}

export function createEntitlement({
  enabled = true,
  feature,
  limit = numberLimit(0),
  quota_status = 'PRELIMINARY',
  unit,
} = {}) {
  const resolvedUnit = String(unit || '').trim()
  if (!USAGE_UNITS.includes(resolvedUnit)) {
    const error = new Error('invalid_unit')
    error.code = 'invalid_unit'
    throw error
  }
  return Object.freeze({
    configurability: 'ADMIN-CONFIGURABLE',
    enabled: enabled === true,
    feature,
    limit: limit?.kind === LIMIT_KIND.UNLIMITED ? unlimitedLimit() : numberLimit(limit?.value ?? limit),
    quota_status,
    unit: resolvedUnit,
  })
}
