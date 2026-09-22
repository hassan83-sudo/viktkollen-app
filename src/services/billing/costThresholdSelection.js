import {
  COST_LIMIT_MODE,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
  COST_THRESHOLD_SELECTION,
} from './catalog.js'
import { getCostSummary } from './costAggregation.js'
import { isCostDrivingFeature, resolveFeatureId } from './features.js'

const MAX_RELEVANT_THRESHOLDS = 8
const MAX_UNIQUE_SUMMARIES = 4

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function assertCanonicalFeature(value) {
  const canonical = resolveFeatureId(value)
  const raw = String(value || '').trim()
  if (!canonical || canonical !== raw) fail('unknown_feature')
  return canonical
}

export function costSummaryKey({ feature_id = null, period, scope } = {}) {
  const scopeKind = String(scope || '').trim()
  const periodKind = String(period || '').trim()
  if (!Object.values(COST_THRESHOLD_SCOPE).includes(scopeKind)) fail('invalid_cost_scope')
  if (!Object.values(COST_THRESHOLD_PERIOD).includes(periodKind)) fail('invalid_cost_period')
  if (scopeKind === COST_THRESHOLD_SCOPE.GLOBAL) {
    return `GLOBAL::${periodKind}`
  }
  const featureId = assertCanonicalFeature(feature_id)
  return `FEATURE:${featureId}:${periodKind}`
}

function assertEnabledThresholdShape(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('invalid_cost_threshold')
  const currency = String(row.currency || '').trim().toUpperCase()
  if (currency !== 'SEK') fail('invalid_cost_currency')
  const period = String(row.period || '').trim()
  if (!Object.values(COST_THRESHOLD_PERIOD).includes(period)) fail('invalid_cost_period')
  const scope = String(row.scope || '').trim()
  if (!Object.values(COST_THRESHOLD_SCOPE).includes(scope)) fail('invalid_cost_scope')
  const mode = String(row.limit_mode || row.mode || '').trim()
  if (!Object.values(COST_LIMIT_MODE).includes(mode)) fail('invalid_limit_mode')
  if (scope === COST_THRESHOLD_SCOPE.GLOBAL && row.feature_id != null && row.feature_id !== '') {
    fail('invalid_cost_scope')
  }
  const featureId = scope === COST_THRESHOLD_SCOPE.FEATURE
    ? assertCanonicalFeature(row.feature_id)
    : null
  return Object.freeze({
    amount_minor: row.amount_minor,
    currency: 'SEK',
    enabled: true,
    feature_id: featureId,
    limit_mode: mode,
    period,
    scope,
    threshold_id: row.threshold_id || null,
    version: row.version || null,
  })
}

/**
 * Selects enabled, identity-matching thresholds. Does not decide HARD/SOFT.
 */
export function selectApplicableCostThresholds({
  clientClaim = {},
  costDriving,
  featureId,
  thresholds = [],
} = {}) {
  void clientClaim.threshold
  void clientClaim.thresholds
  void clientClaim.amount_minor
  void clientClaim.classification
  void clientClaim.costDriving
  void clientClaim.currentCost
  void clientClaim.underLimit
  void clientClaim.now
  void costDriving

  const canonical = assertCanonicalFeature(featureId)
  const driving = isCostDrivingFeature(canonical)

  if (driving === false) {
    return Object.freeze({
      feature_id: canonical,
      reason: COST_THRESHOLD_SELECTION.NO_APPLICABLE_COST_THRESHOLD,
      selectedThresholds: Object.freeze([]),
    })
  }

  const selected = []
  for (const row of thresholds) {
    if (row?.enabled !== true) continue
    const validated = assertEnabledThresholdShape(row)
    if (validated.scope === COST_THRESHOLD_SCOPE.FEATURE && validated.feature_id !== canonical) {
      continue
    }
    selected.push(validated)
  }

  return Object.freeze({
    feature_id: canonical,
    reason: null,
    selectedThresholds: Object.freeze(selected),
  })
}

export function buildCostSummaryPlan(selectedThresholds = []) {
  const byKey = new Map()
  for (const threshold of selectedThresholds) {
    const key = costSummaryKey({
      feature_id: threshold.feature_id,
      period: threshold.period,
      scope: threshold.scope,
    })
    if (byKey.has(key)) {
      byKey.get(key).threshold_ids.push(threshold.threshold_id)
      continue
    }
    byKey.set(key, {
      feature_id: threshold.scope === COST_THRESHOLD_SCOPE.FEATURE ? threshold.feature_id : null,
      key,
      period: threshold.period,
      scope: threshold.scope,
      threshold_ids: [threshold.threshold_id],
    })
  }
  return Object.freeze([...byKey.values()].map((row) => Object.freeze({
    ...row,
    threshold_ids: Object.freeze(row.threshold_ids),
  })))
}

/**
 * Pairs selected thresholds with unique BILL-4C2a summaries.
 * Does not return COST_HARD_STOP / COST_SOFT_ALERT.
 */
export async function collectCostThresholdSummaries({
  catalog = [],
  clientClaim = {},
  clock = () => new Date(),
  costDriving,
  featureId,
  getCostSummaryFn = getCostSummary,
  now,
  repository,
  thresholds = [],
} = {}) {
  const selection = selectApplicableCostThresholds({
    clientClaim,
    costDriving,
    featureId,
    thresholds,
  })
  const summaryRequirements = buildCostSummaryPlan(selection.selectedThresholds)
  const summariesByKey = {}

  for (const requirement of summaryRequirements) {
    const summary = await getCostSummaryFn({
      catalog,
      clientClaim,
      clock,
      featureId: requirement.feature_id,
      now,
      period: requirement.period,
      repository,
      scope: requirement.scope,
    })
    summariesByKey[requirement.key] = summary
  }

  return Object.freeze({
    feature_id: selection.feature_id,
    reason: selection.reason,
    selectedThresholds: selection.selectedThresholds,
    summariesByKey: Object.freeze(summariesByKey),
    summaryRequirements,
  })
}

export { MAX_RELEVANT_THRESHOLDS, MAX_UNIQUE_SUMMARIES }
