import { describe, expect, it, vi } from 'vitest'
import {
  COST_LIMIT_MODE,
  COST_SAFETY,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
} from './catalog.js'
import {
  MAX_UNIQUE_SUMMARIES,
  collectCostThresholdSummaries,
} from './costThresholdSelection.js'
import { FINAL_REASON, resolveFinalCostSafety } from './finalCostSafety.js'

const FEATURE = 'food.scan'

function threshold({
  amount_minor = 1000,
  feature_id = null,
  mode = COST_LIMIT_MODE.HARD_STOP,
  period = COST_THRESHOLD_PERIOD.DAILY,
  scope = COST_THRESHOLD_SCOPE.GLOBAL,
  threshold_id = `${scope}-${feature_id || 'g'}-${period}-${mode}`,
} = {}) {
  return {
    amount_minor,
    currency: 'SEK',
    feature_id,
    mode,
    period,
    scope,
    threshold_id,
  }
}

function summary({
  amount_minor = 0,
  classification = 'MEASURED',
  feature_id = null,
  period = COST_THRESHOLD_PERIOD.DAILY,
  scope = COST_THRESHOLD_SCOPE.GLOBAL,
} = {}) {
  return { amount_minor, classification, currency: 'SEK', feature_id, period, scope }
}

function pairing(thresholds, summariesByKey) {
  return { featureId: FEATURE, selectedThresholds: thresholds, summariesByKey }
}

describe('BILL-4C2b2 final cost safety decision', () => {
  it('NO ACTIVE THRESHOLD: no thresholds is non-blocking and distinguishable from a safe measured result', () => {
    const result = resolveFinalCostSafety({ featureId: FEATURE, selectedThresholds: [] })
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
    expect(result.no_active_threshold).toBe(true)
    expect(result.reason).toBe(FINAL_REASON.NO_ACTIVE_THRESHOLD)
  })

  it('distinguishes NO_ACTIVE_THRESHOLD from measured-and-below-threshold COST_SAFE', () => {
    const safe = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'SOFT_ALERT', amount_minor: 1000 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 500 }) },
    ))
    expect(safe.no_active_threshold).toBe(false)
    expect(safe.reason).toBe(FINAL_REASON.ALL_SAFE)
    expect(safe.result).toBe(COST_SAFETY.COST_SAFE)
  })

  it('one soft threshold, safe', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'SOFT_ALERT', amount_minor: 1000 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 999 }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
  })

  it('one soft threshold, reached', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'SOFT_ALERT', amount_minor: 1000 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 1000 }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.allow).toBe(true)
    expect(result.triggered).toHaveLength(1)
  })

  it('one hard threshold, safe', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'HARD_STOP', amount_minor: 1000 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 999 }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
  })

  it('one hard threshold, reached', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'HARD_STOP', amount_minor: 1000 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 1000 }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
    expect(result.reason).toBe(FINAL_REASON.HARD_STOP_REACHED)
  })

  it('soft reached + hard safe -> final is soft alert', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'SOFT_ALERT', amount_minor: 500, threshold_id: 'soft' }),
        threshold({ mode: 'HARD_STOP', amount_minor: 5000, threshold_id: 'hard' }),
      ],
      { 'GLOBAL::DAILY': summary({ amount_minor: 600 }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.allow).toBe(true)
  })

  it('hard reached + soft reached -> hard wins over all soft results', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'SOFT_ALERT', amount_minor: 500, threshold_id: 'soft' }),
        threshold({ mode: 'HARD_STOP', amount_minor: 900, threshold_id: 'hard' }),
      ],
      { 'GLOBAL::DAILY': summary({ amount_minor: 950 }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })

  it('global hard reached + feature safe -> HARD_STOP (no scope bypass)', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'HARD_STOP', amount_minor: 100, scope: 'GLOBAL', threshold_id: 'g' }),
        threshold({ mode: 'HARD_STOP', amount_minor: 5000, scope: 'FEATURE', feature_id: FEATURE, threshold_id: 'f' }),
      ],
      {
        'GLOBAL::DAILY': summary({ amount_minor: 200 }),
        [`FEATURE:${FEATURE}:DAILY`]: summary({ amount_minor: 10, feature_id: FEATURE, scope: 'FEATURE' }),
      },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
  })

  it('feature hard reached + global safe -> HARD_STOP (no scope bypass)', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'HARD_STOP', amount_minor: 5000, scope: 'GLOBAL', threshold_id: 'g' }),
        threshold({ mode: 'HARD_STOP', amount_minor: 100, scope: 'FEATURE', feature_id: FEATURE, threshold_id: 'f' }),
      ],
      {
        'GLOBAL::DAILY': summary({ amount_minor: 10 }),
        [`FEATURE:${FEATURE}:DAILY`]: summary({ amount_minor: 200, feature_id: FEATURE, scope: 'FEATURE' }),
      },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
  })

  it('daily hard reached + monthly safe -> HARD_STOP (no period bypass)', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'HARD_STOP', amount_minor: 100, period: 'DAILY', threshold_id: 'd' }),
        threshold({ mode: 'HARD_STOP', amount_minor: 5000, period: 'MONTHLY', threshold_id: 'm' }),
      ],
      {
        'GLOBAL::DAILY': summary({ amount_minor: 200, period: 'DAILY' }),
        'GLOBAL::MONTHLY': summary({ amount_minor: 10, period: 'MONTHLY' }),
      },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
  })

  it('monthly hard reached + daily safe -> HARD_STOP (no period bypass)', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'HARD_STOP', amount_minor: 5000, period: 'DAILY', threshold_id: 'd' }),
        threshold({ mode: 'HARD_STOP', amount_minor: 100, period: 'MONTHLY', threshold_id: 'm' }),
      ],
      {
        'GLOBAL::DAILY': summary({ amount_minor: 10, period: 'DAILY' }),
        'GLOBAL::MONTHLY': summary({ amount_minor: 200, period: 'MONTHLY' }),
      },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
  })

  it('multiple soft alerts collapse to one final COST_SOFT_ALERT, no duplicate side effects', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'SOFT_ALERT', amount_minor: 100, period: 'DAILY', threshold_id: 's1' }),
        threshold({ mode: 'SOFT_ALERT', amount_minor: 100, period: 'MONTHLY', threshold_id: 's2' }),
      ],
      {
        'GLOBAL::DAILY': summary({ amount_minor: 200, period: 'DAILY' }),
        'GLOBAL::MONTHLY': summary({ amount_minor: 200, period: 'MONTHLY' }),
      },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.triggered).toHaveLength(2)
  })

  it('hard threshold with UNAVAILABLE cost denies and is never COST_SAFE', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'HARD_STOP', threshold_id: 'hard-unavail' })],
      { 'GLOBAL::DAILY': summary({ classification: 'UNAVAILABLE', amount_minor: null }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(false)
    expect(result.reason).toBe(FINAL_REASON.HARD_UNAVAILABLE)
  })

  it('hard unavailable is never downgraded by an unrelated soft result', () => {
    const result = resolveFinalCostSafety(pairing(
      [
        threshold({ mode: 'SOFT_ALERT', amount_minor: 100, period: 'MONTHLY', threshold_id: 'soft-safe' }),
        threshold({ mode: 'HARD_STOP', period: 'DAILY', threshold_id: 'hard-unavail' }),
      ],
      {
        'GLOBAL::DAILY': summary({ classification: 'UNAVAILABLE', amount_minor: null, period: 'DAILY' }),
        'GLOBAL::MONTHLY': summary({ amount_minor: 50, period: 'MONTHLY' }),
      },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(false)
  })

  it('soft threshold with UNAVAILABLE cost signals unavailable without pretending 0, stays allowed', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'SOFT_ALERT', threshold_id: 'soft-unavail' })],
      { 'GLOBAL::DAILY': summary({ classification: 'UNAVAILABLE', amount_minor: null }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(true)
    expect(result.reason).toBe(FINAL_REASON.SOFT_UNAVAILABLE)
    expect(result.triggered[0].amount_minor).toBeNull()
  })

  it('preserves ESTIMATED classification without claiming measured certainty', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'SOFT_ALERT', amount_minor: 100 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 200, classification: 'ESTIMATED' }) },
    ))
    expect(result.estimated).toBe(true)
    expect(result.evaluations[0].classification).toBe('ESTIMATED')
  })

  it('preserves MEASURED classification', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'SOFT_ALERT', amount_minor: 100 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 50, classification: 'MEASURED' }) },
    ))
    expect(result.estimated).toBe(false)
    expect(result.evaluations[0].classification).toBe('MEASURED')
  })

  it('known empty window (MEASURED 0) below threshold stays COST_SAFE', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'HARD_STOP', amount_minor: 1000 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 0, classification: 'MEASURED' }) },
    ))
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.evaluations[0].amount_minor).toBe(0)
  })

  it('LOCAL FREE feature: unrelated cost thresholds never block it (selection stage yields no active threshold)', async () => {
    const pairingResult = await collectCostThresholdSummaries({
      featureId: 'friend_chat',
      thresholds: [threshold({ mode: 'HARD_STOP', amount_minor: 1 })],
    })
    const result = resolveFinalCostSafety({
      featureId: 'friend_chat',
      selectedThresholds: pairingResult.selectedThresholds,
      summariesByKey: pairingResult.summariesByKey,
    })
    expect(result.no_active_threshold).toBe(true)
    expect(result.allow).toBe(true)
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
  })

  it('UNKNOWN FEATURE fails safe', () => {
    expect(() => resolveFinalCostSafety({
      featureId: 'not_a_real_feature',
      selectedThresholds: [threshold({ mode: 'HARD_STOP' })],
      summariesByKey: { 'GLOBAL::DAILY': summary() },
    })).toThrowError(expect.objectContaining({ code: 'unknown_feature' }))
  })

  it('UNKNOWN FEATURE fails safe even with no active thresholds', () => {
    expect(() => resolveFinalCostSafety({
      featureId: 'not_a_real_feature',
      selectedThresholds: [],
      summariesByKey: {},
    })).toThrowError(expect.objectContaining({ code: 'unknown_feature' }))
  })

  it('CLIENT SPOOF: claimed overrides are ignored, authoritative pairing wins', () => {
    const spoof = {
      classification: 'MEASURED',
      costSafe: true,
      currentCost: 0,
      ignoreHardStop: true,
      threshold: 999999,
      underLimit: true,
    }
    const result = resolveFinalCostSafety({
      clientClaim: spoof,
      featureId: FEATURE,
      selectedThresholds: [threshold({ mode: 'HARD_STOP', amount_minor: 100 })],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: 500 }) },
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })

  it('SAFE OUTPUT: only client-safe decision metadata is returned, no free-text/media/secret fields', () => {
    const result = resolveFinalCostSafety(pairing(
      [threshold({ mode: 'HARD_STOP', amount_minor: 100 })],
      { 'GLOBAL::DAILY': summary({ amount_minor: 500 }) },
    ))
    const topKeys = Object.keys(result).sort()
    expect(topKeys).toEqual([
      'allow',
      'estimated',
      'evaluations',
      'feature_id',
      'metering_complete',
      'no_active_threshold',
      'reason',
      'result',
      'triggered',
    ])
    const forbidden = ['prompt', 'response', 'audio', 'image', 'gps', 'chat', 'api_key', 'token', 'credential']
    const serialized = JSON.stringify(result).toLowerCase()
    for (const word of forbidden) {
      expect(serialized.includes(word)).toBe(false)
    }
    const evalKeys = Object.keys(result.evaluations[0]).sort()
    expect(evalKeys).toEqual([
      'amount_minor',
      'classification',
      'currency',
      'estimated',
      'feature_id',
      'mode',
      'period',
      'result',
      'scope',
      'threshold_id',
      'threshold_minor',
    ])
  })

  it('NO DUPLICATE AGGREGATION: resolveFinalCostSafety issues zero additional summary calls beyond BILL-4C2b1 dedup', async () => {
    let calls = 0
    const getCostSummaryFn = vi.fn(async ({ period, scope }) => {
      calls += 1
      return summary({ amount_minor: 10, period, scope })
    })
    const thresholds = [
      threshold({ mode: 'SOFT_ALERT', period: 'DAILY', scope: 'GLOBAL', threshold_id: 'g-d-s' }),
      threshold({ mode: 'HARD_STOP', period: 'DAILY', scope: 'GLOBAL', threshold_id: 'g-d-h' }),
      threshold({ mode: 'SOFT_ALERT', period: 'MONTHLY', scope: 'GLOBAL', threshold_id: 'g-m-s' }),
      threshold({ mode: 'HARD_STOP', period: 'MONTHLY', scope: 'GLOBAL', threshold_id: 'g-m-h' }),
      threshold({ mode: 'SOFT_ALERT', period: 'DAILY', scope: 'FEATURE', feature_id: FEATURE, threshold_id: 'f-d-s' }),
      threshold({ mode: 'HARD_STOP', period: 'DAILY', scope: 'FEATURE', feature_id: FEATURE, threshold_id: 'f-d-h' }),
      threshold({ mode: 'SOFT_ALERT', period: 'MONTHLY', scope: 'FEATURE', feature_id: FEATURE, threshold_id: 'f-m-s' }),
      threshold({ mode: 'HARD_STOP', period: 'MONTHLY', scope: 'FEATURE', feature_id: FEATURE, threshold_id: 'f-m-h' }),
    ]
    const pairingResult = await collectCostThresholdSummaries({
      featureId: FEATURE,
      getCostSummaryFn,
      thresholds,
    })
    expect(calls).toBeLessThanOrEqual(MAX_UNIQUE_SUMMARIES)
    const callsAfterSelection = calls

    resolveFinalCostSafety({
      featureId: FEATURE,
      selectedThresholds: pairingResult.selectedThresholds,
      summariesByKey: pairingResult.summariesByKey,
    })

    expect(calls).toBe(callsAfterSelection)
  })
})
