import {
  COST_LIMIT_MODE,
  COST_SAFETY,
  COST_SAFETY_CLASSIFICATION,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
  FEATURE_CLASSIFICATION,
} from './catalog.js'
import { getFeatureDefinition, isCostDrivingFeature, resolveFeatureId } from './features.js'

const MAX_MINOR = Number.MAX_SAFE_INTEGER

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function assertMinor(value, code) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_MINOR) fail(code)
  return value
}

function assertCanonicalFeature(value, code = 'unknown_feature') {
  const canonical = resolveFeatureId(value)
  const raw = String(value || '').trim()
  if (!canonical || canonical !== raw) fail(code)
  return canonical
}

export function assertCostThreshold(threshold = {}) {
  if (!threshold || typeof threshold !== 'object' || Array.isArray(threshold)) fail('invalid_cost_threshold')
  const mode = String(threshold.mode || threshold.limit_mode || '').trim()
  if (!Object.values(COST_LIMIT_MODE).includes(mode)) fail('invalid_limit_mode')
  const period = String(threshold.period || '').trim()
  if (!Object.values(COST_THRESHOLD_PERIOD).includes(period)) fail('invalid_cost_period')
  const scope = String(threshold.scope || '').trim()
  if (!Object.values(COST_THRESHOLD_SCOPE).includes(scope)) fail('invalid_cost_scope')
  const currency = String(threshold.currency || '').trim().toUpperCase()
  if (currency !== 'SEK') fail('invalid_cost_currency')
  const amount = assertMinor(threshold.amount_minor, 'invalid_cost_threshold')
  let featureId = null
  if (scope === COST_THRESHOLD_SCOPE.FEATURE) {
    featureId = assertCanonicalFeature(threshold.feature_id)
  } else if (threshold.feature_id != null && threshold.feature_id !== '') {
    fail('invalid_cost_scope')
  }
  return Object.freeze({
    amount_minor: amount,
    currency: 'SEK',
    feature_id: featureId,
    mode,
    period,
    scope,
  })
}

export function assertCostSummary(summary = {}) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) fail('invalid_cost_summary')
  const classification = String(summary.classification || '').trim()
  if (!COST_SAFETY_CLASSIFICATION.includes(classification)) fail('invalid_cost_classification')
  const period = String(summary.period || '').trim()
  if (!Object.values(COST_THRESHOLD_PERIOD).includes(period)) fail('invalid_cost_period')
  const scope = String(summary.scope || '').trim()
  if (!Object.values(COST_THRESHOLD_SCOPE).includes(scope)) fail('invalid_cost_scope')
  const currency = String(summary.currency || '').trim().toUpperCase()
  if (classification !== 'UNAVAILABLE') {
    if (currency !== 'SEK' && currency !== 'USD' && currency !== 'EUR') fail('invalid_cost_currency')
    assertMinor(summary.amount_minor, 'invalid_cost_amount')
  } else if (summary.amount_minor != null) {
    assertMinor(summary.amount_minor, 'invalid_cost_amount')
  }
  let featureId = null
  if (scope === COST_THRESHOLD_SCOPE.FEATURE) {
    featureId = assertCanonicalFeature(summary.feature_id)
  }
  return Object.freeze({
    amount_minor: classification === 'UNAVAILABLE' ? null : summary.amount_minor,
    classification,
    currency: currency || null,
    feature_id: featureId,
    period,
    scope,
  })
}

function decision({
  allow,
  estimated,
  result,
  threshold,
  cost,
  meteringComplete,
  reason,
}) {
  return Object.freeze({
    allow,
    amount_minor: cost.amount_minor,
    classification: cost.classification,
    currency: cost.currency,
    estimated,
    feature_id: threshold.feature_id || cost.feature_id,
    metering_complete: meteringComplete,
    mode: threshold.mode,
    period: threshold.period,
    reason: reason || null,
    result,
    scope: threshold.scope,
    threshold_minor: threshold.amount_minor,
  })
}

/**
 * Pure cost-safety decision. No DB, quota, subscription, provider, or notify.
 * Boundary: current >= threshold is reached.
 * UNAVAILABLE is never treated as 0. HARD_STOP + UNAVAILABLE is not COST_SAFE.
 */
export function resolveCostSafety({
  clientClaim = {},
  costDriving,
  costSummary,
  feature,
  threshold,
} = {}) {
  void clientClaim.amount_minor
  void clientClaim.classification
  void clientClaim.costDriving
  void clientClaim.costSafe
  void clientClaim.currentCost
  void clientClaim.ignoreHardStop
  void clientClaim.threshold
  void clientClaim.underLimit
  void costDriving
  const validatedThreshold = assertCostThreshold(threshold)
  const validatedCost = assertCostSummary(costSummary)

  const featureId = feature != null ? resolveFeatureId(feature) : null
  if (feature != null && !featureId) fail('unknown_feature')
  const definition = featureId ? getFeatureDefinition(featureId) : null
  const partial = definition?.classification === FEATURE_CLASSIFICATION.PARTIAL
  const driving = featureId ? isCostDrivingFeature(featureId) : true

  if (driving === false) {
    return decision({
      allow: true,
      cost: validatedCost,
      estimated: validatedCost.classification === 'ESTIMATED',
      meteringComplete: false,
      reason: 'not_cost_driving',
      result: COST_SAFETY.COST_SAFE,
      threshold: validatedThreshold,
    })
  }

  if (validatedCost.currency && validatedCost.currency !== validatedThreshold.currency) {
    return decision({
      allow: false,
      cost: validatedCost,
      estimated: false,
      meteringComplete: false,
      reason: 'currency_mismatch',
      result: COST_SAFETY.INVALID_COST_INPUT,
      threshold: validatedThreshold,
    })
  }
  if (validatedCost.period !== validatedThreshold.period) {
    return decision({
      allow: false,
      cost: validatedCost,
      estimated: false,
      meteringComplete: false,
      reason: 'period_mismatch',
      result: COST_SAFETY.INVALID_COST_INPUT,
      threshold: validatedThreshold,
    })
  }
  if (validatedCost.scope !== validatedThreshold.scope) {
    return decision({
      allow: false,
      cost: validatedCost,
      estimated: false,
      meteringComplete: false,
      reason: 'scope_mismatch',
      result: COST_SAFETY.INVALID_COST_INPUT,
      threshold: validatedThreshold,
    })
  }
  if (validatedThreshold.scope === COST_THRESHOLD_SCOPE.FEATURE) {
    if (validatedCost.feature_id !== validatedThreshold.feature_id) {
      return decision({
        allow: false,
        cost: validatedCost,
        estimated: false,
        meteringComplete: false,
        reason: 'feature_mismatch',
        result: COST_SAFETY.INVALID_COST_INPUT,
        threshold: validatedThreshold,
      })
    }
  }

  if (validatedCost.classification === 'UNAVAILABLE') {
    const hard = validatedThreshold.mode === COST_LIMIT_MODE.HARD_STOP
    return decision({
      allow: !hard,
      cost: { ...validatedCost, amount_minor: null },
      estimated: false,
      meteringComplete: false,
      reason: 'cost_unavailable',
      result: COST_SAFETY.COST_UNAVAILABLE,
      threshold: validatedThreshold,
    })
  }

  const reached = validatedCost.amount_minor >= validatedThreshold.amount_minor
  const estimated = validatedCost.classification === 'ESTIMATED'
  if (!reached) {
    return decision({
      allow: true,
      cost: validatedCost,
      estimated,
      meteringComplete: !partial && !estimated,
      result: COST_SAFETY.COST_SAFE,
      threshold: validatedThreshold,
    })
  }
  if (validatedThreshold.mode === COST_LIMIT_MODE.SOFT_ALERT) {
    return decision({
      allow: true,
      cost: validatedCost,
      estimated,
      meteringComplete: !partial && !estimated,
      result: COST_SAFETY.COST_SOFT_ALERT,
      threshold: validatedThreshold,
    })
  }
  return decision({
    allow: false,
    cost: validatedCost,
    estimated,
    meteringComplete: !partial && !estimated,
    result: COST_SAFETY.COST_HARD_STOP,
    threshold: validatedThreshold,
  })
}
