import {
  COST_SAFETY_CLASSIFICATION,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
  USAGE_EVENT_TYPES,
  USAGE_UNITS,
} from './catalog.js'
import { estimateUsageCost } from './estimateCost.js'
import { getFeatureDefinition, resolveFeatureId } from './features.js'
import { periodBounds } from './period.js'
import { getUsageRepository } from './usageRepository.js'

const MAX_MINOR = Number.MAX_SAFE_INTEGER
const PRECEDENCE = Object.freeze({
  UNAVAILABLE: 3,
  ESTIMATED: 2,
  MEASURED: 1,
})

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function costPeriodBounds(period, at = new Date()) {
  const kind = String(period || '').trim()
  if (kind === COST_THRESHOLD_PERIOD.DAILY) {
    const bounds = periodBounds('day', at)
    return Object.freeze({
      period: COST_THRESHOLD_PERIOD.DAILY,
      period_end: bounds.period_end,
      period_start: bounds.period_start,
    })
  }
  if (kind === COST_THRESHOLD_PERIOD.MONTHLY) {
    const bounds = periodBounds('month', at)
    return Object.freeze({
      period: COST_THRESHOLD_PERIOD.MONTHLY,
      period_end: bounds.period_end,
      period_start: bounds.period_start,
    })
  }
  fail('invalid_cost_period')
}

function assertCanonicalFeature(value) {
  const canonical = resolveFeatureId(value)
  const raw = String(value || '').trim()
  if (!canonical || canonical !== raw) fail('unknown_feature')
  return canonical
}

function mergeClass(current, next) {
  if (!current) return next
  return PRECEDENCE[next] > PRECEDENCE[current] ? next : current
}

function eventTypesForScope(scope, featureId) {
  if (scope === COST_THRESHOLD_SCOPE.GLOBAL) return USAGE_EVENT_TYPES.slice()
  const definition = getFeatureDefinition(featureId)
  if (!definition) fail('unknown_feature')
  if (!definition.event_type) return null
  return [definition.event_type]
}

function priceEvent(event, catalog) {
  if (!Number.isInteger(event?.quantity) || event.quantity < 0) {
    return { classification: 'UNAVAILABLE', minor: null, reason: 'invalid_quantity' }
  }
  if (!USAGE_UNITS.includes(String(event?.unit || ''))) {
    return { classification: 'UNAVAILABLE', minor: null, reason: 'invalid_unit' }
  }
  let estimate
  try {
    estimate = estimateUsageCost({
      catalog,
      event,
      occurredAt: event.occurred_at,
    })
  } catch {
    return { classification: 'UNAVAILABLE', minor: null, reason: 'invalid_cost_input' }
  }
  if (estimate.cost_basis !== 'ESTIMATED' || !Number.isInteger(estimate.sek_ore) || estimate.sek_ore < 0) {
    return { classification: 'UNAVAILABLE', minor: null, reason: estimate.reason || 'unknown_price' }
  }
  if (estimate.sek_ore > MAX_MINOR) {
    return { classification: 'UNAVAILABLE', minor: null, reason: 'overflow' }
  }
  return { classification: 'ESTIMATED', minor: estimate.sek_ore, reason: null }
}

function toSummary({
  amount,
  classification,
  currency,
  featureId,
  period,
  period_end,
  period_start,
  scope,
}) {
  const unavailable = classification === 'UNAVAILABLE'
  return Object.freeze({
    amount_minor: unavailable ? null : amount,
    classification,
    currency,
    feature_id: scope === COST_THRESHOLD_SCOPE.FEATURE ? featureId : null,
    period,
    period_end,
    period_start,
    scope,
  })
}

/**
 * Authoritative cost summary from BILL-1 usage + catalog.
 * Does not read client cost claims. Does not decide SOFT/HARD.
 * Production `now` is the injected clock (server time), never clientNow.
 */
export async function getCostSummary({
  catalog = [],
  clientClaim = {},
  clock = () => new Date(),
  featureId = null,
  now,
  period,
  repository = getUsageRepository(),
  scope,
} = {}) {
  void clientClaim.amount_minor
  void clientClaim.classification
  void clientClaim.currentCost
  void clientClaim.totalCost
  void clientClaim.costMinor
  void clientClaim.estimatedCost
  void clientClaim.underLimit
  void clientClaim.now
  void clientClaim.clientNow

  const periodKind = String(period || '').trim()
  if (!Object.values(COST_THRESHOLD_PERIOD).includes(periodKind)) fail('invalid_cost_period')
  const scopeKind = String(scope || '').trim()
  if (!Object.values(COST_THRESHOLD_SCOPE).includes(scopeKind)) fail('invalid_cost_scope')

  let canonicalFeature = null
  if (scopeKind === COST_THRESHOLD_SCOPE.FEATURE) {
    canonicalFeature = assertCanonicalFeature(featureId)
  } else if (featureId != null && featureId !== '') {
    fail('invalid_cost_scope')
  }

  const at = now === undefined ? clock() : now
  const bounds = costPeriodBounds(periodKind, at)
  const eventTypes = eventTypesForScope(scopeKind, canonicalFeature)

  if (eventTypes === null) {
    return toSummary({
      amount: null,
      classification: 'UNAVAILABLE',
      currency: 'SEK',
      featureId: canonicalFeature,
      period: periodKind,
      period_end: bounds.period_end,
      period_start: bounds.period_start,
      scope: scopeKind,
    })
  }

  const events = await repository.listInPeriod({
    eventTypes,
    period_end: bounds.period_end,
    period_start: bounds.period_start,
  })

  if (!events.length) {
    return toSummary({
      amount: 0,
      classification: 'MEASURED',
      currency: 'SEK',
      featureId: canonicalFeature,
      period: periodKind,
      period_end: bounds.period_end,
      period_start: bounds.period_start,
      scope: scopeKind,
    })
  }

  let classification = 'MEASURED'
  let total = 0n
  for (const event of events) {
    const priced = priceEvent(event, catalog)
    classification = mergeClass(classification, priced.classification)
    if (priced.classification === 'UNAVAILABLE') {
      return toSummary({
        amount: null,
        classification: 'UNAVAILABLE',
        currency: 'SEK',
        featureId: canonicalFeature,
        period: periodKind,
        period_end: bounds.period_end,
        period_start: bounds.period_start,
        scope: scopeKind,
      })
    }
    total += BigInt(priced.minor)
    if (total > BigInt(MAX_MINOR)) {
      return toSummary({
        amount: null,
        classification: 'UNAVAILABLE',
        currency: 'SEK',
        featureId: canonicalFeature,
        period: periodKind,
        period_end: bounds.period_end,
        period_start: bounds.period_start,
        scope: scopeKind,
      })
    }
  }

  if (!COST_SAFETY_CLASSIFICATION.includes(classification)) fail('invalid_cost_classification')

  return toSummary({
    amount: Number(total),
    classification,
    currency: 'SEK',
    featureId: canonicalFeature,
    period: periodKind,
    period_end: bounds.period_end,
    period_start: bounds.period_start,
    scope: scopeKind,
  })
}
