import { describe, expect, it } from 'vitest'
import {
  COST_LIMIT_MODE,
  COST_SAFETY,
  COST_SAFETY_CLASSIFICATION,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
} from './catalog.js'
import { assertCostSummary, assertCostThreshold, resolveCostSafety } from './costSafety.js'

const SOFT = Object.freeze({
  amount_minor: 900,
  currency: 'SEK',
  mode: COST_LIMIT_MODE.SOFT_ALERT,
  period: COST_THRESHOLD_PERIOD.DAILY,
  scope: COST_THRESHOLD_SCOPE.GLOBAL,
})

const HARD = Object.freeze({
  ...SOFT,
  mode: COST_LIMIT_MODE.HARD_STOP,
})

function summary({
  amount_minor = 0,
  classification = 'MEASURED',
  currency = 'SEK',
  feature_id,
  period = 'DAILY',
  scope = 'GLOBAL',
} = {}) {
  return {
    amount_minor,
    classification,
    currency,
    feature_id,
    period,
    scope,
  }
}

describe('BILL-4C1a cost safety catalog', () => {
  it('reuses BILL-1 USAGE_BASIS classifications', () => {
    expect(COST_SAFETY_CLASSIFICATION).toEqual(['MEASURED', 'ESTIMATED', 'UNAVAILABLE'])
  })
})

describe('BILL-4C1a measured vs soft', () => {
  it('returns COST_SAFE below soft threshold', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 899 }), threshold: SOFT })
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
    expect(result.estimated).toBe(false)
  })

  it('returns COST_SOFT_ALERT at soft threshold', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 900 }), threshold: SOFT })
    expect(result.result).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.allow).toBe(true)
  })

  it('returns COST_SOFT_ALERT above soft threshold without hard block', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 901 }), threshold: SOFT })
    expect(result.result).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.allow).toBe(true)
  })
})

describe('BILL-4C1a measured vs hard', () => {
  it('returns COST_SAFE below hard threshold', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 899 }), threshold: HARD })
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
  })

  it('returns COST_HARD_STOP at hard threshold', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 900 }), threshold: HARD })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })

  it('returns COST_HARD_STOP above hard threshold', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 901 }), threshold: HARD })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })
})

describe('BILL-4C1a estimated policy', () => {
  it('compares estimated cost like measured for soft and marks estimated', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 900, classification: 'ESTIMATED' }),
      threshold: SOFT,
    })
    expect(result.result).toBe(COST_SAFETY.COST_SOFT_ALERT)
    expect(result.allow).toBe(true)
    expect(result.estimated).toBe(true)
    expect(result.classification).toBe('ESTIMATED')
    expect(result.metering_complete).toBe(false)
  })

  it('compares estimated cost conservatively for hard stop', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 900, classification: 'ESTIMATED' }),
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
    expect(result.estimated).toBe(true)
    expect(result.classification).toBe('ESTIMATED')
  })
})

describe('BILL-4C1a unavailable policy', () => {
  it('does not treat UNAVAILABLE as zero for soft alert', () => {
    const result = resolveCostSafety({
      costSummary: summary({ classification: 'UNAVAILABLE', amount_minor: undefined, currency: 'SEK' }),
      threshold: SOFT,
    })
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(true)
    expect(result.amount_minor).toBeNull()
    expect(result.reason).toBe('cost_unavailable')
  })

  it('does not return COST_SAFE for UNAVAILABLE hard-stop safety', () => {
    const result = resolveCostSafety({
      costSummary: summary({ classification: 'UNAVAILABLE' }),
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(false)
    expect(result.amount_minor).toBeNull()
  })
})

describe('BILL-4C1a zero and money validation', () => {
  it('treats measured zero as under a positive threshold', () => {
    const result = resolveCostSafety({ costSummary: summary({ amount_minor: 0 }), threshold: HARD })
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
  })

  it('treats zero HARD_STOP threshold as reached from first known cost including zero', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 0 }),
      threshold: { ...HARD, amount_minor: 0 },
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })

  it('blocks negative threshold and negative cost', () => {
    expect(() => assertCostThreshold({ ...HARD, amount_minor: -1 })).toThrow(/invalid_cost_threshold/)
    expect(() => assertCostSummary(summary({ amount_minor: -1 }))).toThrow(/invalid_cost_amount/)
  })

  it('blocks floating threshold and floating authoritative cost', () => {
    expect(() => assertCostThreshold({ ...HARD, amount_minor: 9.5 })).toThrow(/invalid_cost_threshold/)
    expect(() => assertCostSummary(summary({ amount_minor: 1.25 }))).toThrow(/invalid_cost_amount/)
  })

  it('blocks values outside safe integer range', () => {
    expect(() => assertCostThreshold({ ...HARD, amount_minor: Number.MAX_SAFE_INTEGER + 1 })).toThrow()
  })
})

describe('BILL-4C1a unknown enums', () => {
  it('blocks unknown classification', () => {
    expect(() => assertCostSummary(summary({ classification: 'FAKE' }))).toThrow(/invalid_cost_classification/)
  })

  it('blocks unknown limit mode', () => {
    expect(() => assertCostThreshold({ ...HARD, mode: 'WARN' })).toThrow(/invalid_limit_mode/)
  })

  it('blocks unknown period and scope', () => {
    expect(() => assertCostThreshold({ ...HARD, period: 'WEEKLY' })).toThrow(/invalid_cost_period/)
    expect(() => assertCostThreshold({ ...HARD, scope: 'USER' })).toThrow(/invalid_cost_scope/)
  })
})

describe('BILL-4C1a mismatch fail-safe', () => {
  it('does not convert currency mismatch', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 100, currency: 'USD' }),
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.INVALID_COST_INPUT)
    expect(result.reason).toBe('currency_mismatch')
    expect(result.allow).toBe(false)
  })

  it('blocks period mismatch', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 100, period: 'MONTHLY' }),
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.INVALID_COST_INPUT)
    expect(result.reason).toBe('period_mismatch')
    expect(result.allow).toBe(false)
  })

  it('blocks feature mismatch and unknown feature ids', () => {
    const threshold = {
      amount_minor: 900,
      currency: 'SEK',
      feature_id: 'food.scan',
      mode: COST_LIMIT_MODE.HARD_STOP,
      period: 'DAILY',
      scope: 'FEATURE',
    }
    const result = resolveCostSafety({
      costSummary: summary({
        amount_minor: 100,
        feature_id: 'body.scan',
        scope: 'FEATURE',
      }),
      threshold,
    })
    expect(result.result).toBe(COST_SAFETY.INVALID_COST_INPUT)
    expect(result.reason).toBe('feature_mismatch')
    expect(() => assertCostThreshold({ ...threshold, feature_id: 'not.a.feature' })).toThrow(/unknown_feature/)
    expect(() => assertCostThreshold({ ...threshold, feature_id: 'food_scan' })).toThrow(/unknown_feature/)
  })

  it('does not compare a feature summary against a global threshold', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 100, feature_id: 'food.scan', scope: 'FEATURE' }),
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.INVALID_COST_INPUT)
    expect(result.reason).toBe('scope_mismatch')
  })
})

describe('BILL-4C1a local free and partial', () => {
  it('does not hard-block LOCAL_FREE by an unrelated external cost threshold', () => {
    const result = resolveCostSafety({
      costSummary: summary({ amount_minor: 5000 }),
      feature: 'friend_chat',
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_SAFE)
    expect(result.allow).toBe(true)
    expect(result.reason).toBe('not_cost_driving')
  })

  it('does not let client costDriving=false bypass an EXTERNAL_COST hard stop', () => {
    const result = resolveCostSafety({
      costDriving: false,
      costSummary: summary({ amount_minor: 5000 }),
      feature: 'food.scan',
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })

  it('uses UNAVAILABLE policy for PARTIAL + unavailable cost', () => {
    const result = resolveCostSafety({
      costSummary: summary({ classification: 'UNAVAILABLE' }),
      feature: 'tts.request',
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(false)
    expect(result.metering_complete).toBe(false)
  })
})

describe('BILL-4C1a client spoof ignored', () => {
  it('ignores client costSafe/underLimit flags', () => {
    const result = resolveCostSafety({
      clientClaim: { costSafe: true, underLimit: true },
      costSummary: summary({ amount_minor: 5000 }),
      feature: 'food.scan',
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })
})
