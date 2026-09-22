import {
  COST_LIMIT_MODE,
  COST_SAFETY,
  COST_THRESHOLD_SCOPE,
} from './catalog.js'
import { costSummaryKey } from './costThresholdSelection.js'
import { resolveCostSafety } from './costSafety.js'
import { resolveFeatureId } from './features.js'

const FINAL_REASON = Object.freeze({
  ALL_SAFE: 'ALL_SAFE',
  HARD_STOP_REACHED: 'HARD_STOP_REACHED',
  HARD_UNAVAILABLE: 'HARD_UNAVAILABLE',
  INVALID_COST_PAIRING: 'INVALID_COST_PAIRING',
  NO_ACTIVE_THRESHOLD: 'NO_ACTIVE_THRESHOLD',
  SOFT_ALERT_REACHED: 'SOFT_ALERT_REACHED',
  SOFT_UNAVAILABLE: 'SOFT_UNAVAILABLE',
})

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

/**
 * Only client-safe decision metadata. Never prompt/response/audio/image/GPS/
 * chat text/API keys/tokens/credentials (those never enter this module).
 */
function toSafeEvaluation(evaluation) {
  return Object.freeze({
    amount_minor: evaluation.amount_minor,
    classification: evaluation.classification,
    currency: evaluation.currency,
    estimated: evaluation.estimated,
    feature_id: evaluation.feature_id,
    mode: evaluation.mode,
    period: evaluation.period,
    result: evaluation.result,
    scope: evaluation.scope,
    threshold_id: evaluation.threshold_id,
    threshold_minor: evaluation.threshold_minor,
  })
}

function finalize({
  allEvaluations,
  allow,
  featureId,
  reason,
  result,
  triggered,
}) {
  return Object.freeze({
    allow,
    estimated: allEvaluations.some((item) => item.estimated),
    evaluations: Object.freeze(allEvaluations.map(toSafeEvaluation)),
    feature_id: featureId,
    metering_complete: allEvaluations.length > 0 && allEvaluations.every((item) => item.metering_complete),
    no_active_threshold: false,
    reason,
    result,
    triggered: Object.freeze(triggered.map(toSafeEvaluation)),
  })
}

/**
 * BILL-4C2b2: deterministic final cost-safety decision.
 *
 * Pure / server-side. Consumes the already-selected threshold/summary
 * pairings produced by BILL-4C2b1 (`selectApplicableCostThresholds`,
 * `buildCostSummaryPlan`, `collectCostThresholdSummaries`) and evaluates
 * each pairing with BILL-4C1a's `resolveCostSafety`. Issues no aggregation
 * queries of its own, mutates no state, and calls no provider.
 *
 * Precedence (highest first):
 *   1. INVALID_COST_INPUT on any pairing  -> INVALID_COST_PAIRING (deny)
 *   2. COST_HARD_STOP on any pairing      -> HARD_STOP_REACHED (deny)
 *   3. COST_UNAVAILABLE on a HARD_STOP threshold -> HARD_UNAVAILABLE (deny)
 *   4. COST_SOFT_ALERT on any pairing     -> SOFT_ALERT_REACHED (allow)
 *   5. COST_UNAVAILABLE on a SOFT_ALERT threshold -> SOFT_UNAVAILABLE (allow)
 *   6. otherwise                          -> ALL_SAFE (allow)
 *
 * A hard stop (reached or unavailable) always wins over any soft result,
 * regardless of GLOBAL/FEATURE scope or DAILY/MONTHLY period: every
 * selected threshold is evaluated, so no scope or period can bypass an
 * applicable hard stop elsewhere in the matrix.
 */
export function resolveFinalCostSafety({
  clientClaim = {},
  costDriving,
  featureId,
  selectedThresholds = [],
  summariesByKey = {},
} = {}) {
  // Authoritative pairings win. Any client-claimed override is discarded,
  // never read below.
  void clientClaim.amount_minor
  void clientClaim.classification
  void clientClaim.costDriving
  void clientClaim.costSafe
  void clientClaim.currentCost
  void clientClaim.ignoreHardStop
  void clientClaim.threshold
  void clientClaim.underLimit
  void costDriving

  const canonicalFeatureId = assertCanonicalFeature(featureId)

  if (!Array.isArray(selectedThresholds) || selectedThresholds.length === 0) {
    return Object.freeze({
      allow: true,
      estimated: false,
      evaluations: Object.freeze([]),
      feature_id: canonicalFeatureId,
      metering_complete: false,
      no_active_threshold: true,
      reason: FINAL_REASON.NO_ACTIVE_THRESHOLD,
      result: COST_SAFETY.COST_SAFE,
      triggered: Object.freeze([]),
    })
  }

  const evaluations = selectedThresholds.map((threshold) => {
    const key = costSummaryKey({
      feature_id: threshold.scope === COST_THRESHOLD_SCOPE.FEATURE ? threshold.feature_id : null,
      period: threshold.period,
      scope: threshold.scope,
    })
    const summary = summariesByKey[key]
    if (!summary) fail('missing_cost_summary')
    const evaluation = resolveCostSafety({
      clientClaim,
      costSummary: summary,
      feature: canonicalFeatureId,
      threshold,
    })
    return { ...evaluation, threshold_id: threshold.threshold_id }
  })

  const invalid = evaluations.filter((item) => item.result === COST_SAFETY.INVALID_COST_INPUT)
  if (invalid.length > 0) {
    return finalize({
      allEvaluations: evaluations,
      allow: false,
      featureId: canonicalFeatureId,
      reason: FINAL_REASON.INVALID_COST_PAIRING,
      result: COST_SAFETY.INVALID_COST_INPUT,
      triggered: invalid,
    })
  }

  const hardStops = evaluations.filter((item) => item.result === COST_SAFETY.COST_HARD_STOP)
  if (hardStops.length > 0) {
    return finalize({
      allEvaluations: evaluations,
      allow: false,
      featureId: canonicalFeatureId,
      reason: FINAL_REASON.HARD_STOP_REACHED,
      result: COST_SAFETY.COST_HARD_STOP,
      triggered: hardStops,
    })
  }

  const hardUnavailable = evaluations.filter((item) => (
    item.result === COST_SAFETY.COST_UNAVAILABLE && item.mode === COST_LIMIT_MODE.HARD_STOP
  ))
  if (hardUnavailable.length > 0) {
    return finalize({
      allEvaluations: evaluations,
      allow: false,
      featureId: canonicalFeatureId,
      reason: FINAL_REASON.HARD_UNAVAILABLE,
      result: COST_SAFETY.COST_UNAVAILABLE,
      triggered: hardUnavailable,
    })
  }

  const softAlerts = evaluations.filter((item) => item.result === COST_SAFETY.COST_SOFT_ALERT)
  if (softAlerts.length > 0) {
    return finalize({
      allEvaluations: evaluations,
      allow: true,
      featureId: canonicalFeatureId,
      reason: FINAL_REASON.SOFT_ALERT_REACHED,
      result: COST_SAFETY.COST_SOFT_ALERT,
      triggered: softAlerts,
    })
  }

  const softUnavailable = evaluations.filter((item) => item.result === COST_SAFETY.COST_UNAVAILABLE)
  if (softUnavailable.length > 0) {
    return finalize({
      allEvaluations: evaluations,
      allow: true,
      featureId: canonicalFeatureId,
      reason: FINAL_REASON.SOFT_UNAVAILABLE,
      result: COST_SAFETY.COST_UNAVAILABLE,
      triggered: softUnavailable,
    })
  }

  return finalize({
    allEvaluations: evaluations,
    allow: true,
    featureId: canonicalFeatureId,
    reason: FINAL_REASON.ALL_SAFE,
    result: COST_SAFETY.COST_SAFE,
    triggered: [],
  })
}

export { FINAL_REASON }
