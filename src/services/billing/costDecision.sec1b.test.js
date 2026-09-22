import { describe, expect, it, vi } from 'vitest'
import { COST_SAFETY, COST_THRESHOLD_SELECTION } from './catalog.js'
import { getCostSummary } from './costAggregation.js'
import { resolveCostSafety } from './costSafety.js'
import {
  MAX_UNIQUE_SUMMARIES,
  collectCostThresholdSummaries,
  selectApplicableCostThresholds,
} from './costThresholdSelection.js'
import { FINAL_REASON, resolveFinalCostSafety } from './finalCostSafety.js'
import { isCostDrivingFeature } from './features.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const FEATURE = 'food.scan'
const HARD = {
  amount_minor: 10000,
  currency: 'SEK',
  limit_mode: 'HARD_STOP',
  mode: 'HARD_STOP',
  period: 'DAILY',
  scope: 'GLOBAL',
  threshold_id: 'th-hard',
}

function enabledThreshold(overrides = {}) {
  return {
    amount_minor: 10000,
    currency: 'SEK',
    enabled: true,
    feature_id: null,
    limit_mode: 'HARD_STOP',
    period: 'DAILY',
    scope: 'GLOBAL',
    threshold_id: 'th-1',
    ...overrides,
  }
}

function summary(overrides = {}) {
  return {
    amount_minor: 0,
    classification: 'MEASURED',
    currency: 'SEK',
    feature_id: null,
    period: 'DAILY',
    scope: 'GLOBAL',
    ...overrides,
  }
}

describe('BILL-4C-SEC1b cost decision security', () => {
  it('derives cost-driving from the server registry only', () => {
    expect(isCostDrivingFeature('food.scan')).toBe(true)
    expect(isCostDrivingFeature('tts.request')).toBe(true)
    expect(isCostDrivingFeature('friend_chat')).toBe(false)
    expect(isCostDrivingFeature('not.a.feature')).toBeNull()
  })

  it('still applies thresholds when client sends costDriving=false for EXTERNAL_COST', async () => {
    const selected = selectApplicableCostThresholds({
      costDriving: false,
      featureId: FEATURE,
      thresholds: [enabledThreshold()],
    })
    expect(selected.selectedThresholds).toHaveLength(1)
    const decision = resolveCostSafety({
      costDriving: false,
      costSummary: summary({ amount_minor: 10000 }),
      feature: FEATURE,
      threshold: HARD,
    })
    expect(decision.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(decision.allow).toBe(false)
  })

  it('ignores client classification=LOCAL_FREE on an EXTERNAL_COST feature', () => {
    const result = resolveCostSafety({
      clientClaim: { classification: 'LOCAL_FREE' },
      costSummary: summary({ amount_minor: 10000 }),
      feature: FEATURE,
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
  })

  it('keeps UNAVAILABLE when the client claims MEASURED', () => {
    const result = resolveFinalCostSafety({
      clientClaim: { amount_minor: 0, classification: 'MEASURED' },
      featureId: FEATURE,
      selectedThresholds: [HARD],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: null, classification: 'UNAVAILABLE' }) },
    })
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.reason).toBe(FINAL_REASON.HARD_UNAVAILABLE)
    expect(result.allow).toBe(false)
    expect(result.evaluations[0].amount_minor).toBeNull()
  })

  it('keeps HARD_STOP when the client claims amount_minor=0', () => {
    const result = resolveFinalCostSafety({
      clientClaim: { amount_minor: 0, currentCost: 0, underLimit: true },
      featureId: FEATURE,
      selectedThresholds: [HARD],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: 10000 }) },
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.allow).toBe(false)
  })

  it('uses persisted threshold amount, not a client fake threshold', () => {
    const result = resolveFinalCostSafety({
      clientClaim: { threshold: { amount_minor: 999999999, period: 'NEVER', scope: 'LOCAL' } },
      featureId: FEATURE,
      selectedThresholds: [HARD],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: 10000 }) },
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.triggered[0].threshold_minor).toBe(10000)
  })

  it('uses the server-selected period rather than a client NEVER period', () => {
    const result = resolveFinalCostSafety({
      clientClaim: { period: 'NEVER', now: '1999-01-01T00:00:00.000Z' },
      featureId: FEATURE,
      selectedThresholds: [{ ...HARD, period: 'MONTHLY' }],
      summariesByKey: { 'GLOBAL::MONTHLY': summary({ amount_minor: 10000, period: 'MONTHLY' }) },
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(result.triggered[0].period).toBe('MONTHLY')
  })

  it('denies HARD + UNAVAILABLE and never treats it as zero/safe', () => {
    const result = resolveFinalCostSafety({
      featureId: FEATURE,
      selectedThresholds: [HARD],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: null, classification: 'UNAVAILABLE' }) },
    })
    expect(result.allow).toBe(false)
    expect(result.reason).toBe(FINAL_REASON.HARD_UNAVAILABLE)
    expect(result.evaluations[0].amount_minor).not.toBe(0)
  })

  it('signals SOFT-only UNAVAILABLE and allows', () => {
    const result = resolveFinalCostSafety({
      featureId: FEATURE,
      selectedThresholds: [{ ...HARD, limit_mode: 'SOFT_ALERT', mode: 'SOFT_ALERT' }],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: null, classification: 'UNAVAILABLE' }) },
    })
    expect(result.allow).toBe(true)
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.reason).toBe(FINAL_REASON.SOFT_UNAVAILABLE)
    expect(result.evaluations[0].amount_minor).toBeNull()
  })

  it('does not echo sensitive client fields in the decision output', () => {
    const result = resolveFinalCostSafety({
      clientClaim: {
        api_key: 'sk-secret',
        audio: 'x',
        gps: '1,2',
        image: 'y',
        password: 'p',
        prompt: 'secret prompt',
        response: 'secret response',
        token: 't',
      },
      featureId: FEATURE,
      selectedThresholds: [HARD],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: 1 }) },
    })
    const blob = JSON.stringify(result)
    expect(blob).not.toMatch(/sk-secret|secret prompt|secret response|"audio"|"password"|"api_key"/i)
  })

  it('does not write usage, quota, thresholds, or call a provider during evaluation', async () => {
    const repository = createInMemoryUsageRepository()
    const insert = vi.spyOn(repository, 'insert')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true })
    await collectCostThresholdSummaries({
      featureId: FEATURE,
      repository,
      thresholds: [enabledThreshold()],
    }).then((pairing) => resolveFinalCostSafety({
      featureId: FEATURE,
      selectedThresholds: pairing.selectedThresholds,
      summariesByKey: pairing.summariesByKey,
    }))
    expect(insert).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('calls aggregation at most 4 times for the full relevant matrix', async () => {
    const getCostSummaryFn = vi.fn(async ({ period, scope }) => summary({ period, scope }))
    const modes = ['SOFT_ALERT', 'HARD_STOP']
    const periods = ['DAILY', 'MONTHLY']
    const thresholds = []
    for (const period of periods) {
      for (const limit_mode of modes) {
        thresholds.push(enabledThreshold({
          limit_mode,
          period,
          scope: 'GLOBAL',
          threshold_id: `g-${period}-${limit_mode}`,
        }))
        thresholds.push(enabledThreshold({
          feature_id: FEATURE,
          limit_mode,
          period,
          scope: 'FEATURE',
          threshold_id: `f-${period}-${limit_mode}`,
        }))
      }
    }
    await collectCostThresholdSummaries({ featureId: FEATURE, getCostSummaryFn, thresholds })
    expect(getCostSummaryFn).toHaveBeenCalledTimes(MAX_UNIQUE_SUMMARIES)
  })

  it('fail-safes unknown features', () => {
    expect(() => selectApplicableCostThresholds({ featureId: 'not.a.feature', thresholds: [] }))
      .toThrow(/unknown_feature/)
    expect(() => resolveFinalCostSafety({ featureId: 'not.a.feature' })).toThrow(/unknown_feature/)
  })

  it('ignores unrelated external thresholds for canonical LOCAL_FREE', () => {
    const selected = selectApplicableCostThresholds({
      featureId: 'friend_chat',
      thresholds: [enabledThreshold(), enabledThreshold({ feature_id: FEATURE, scope: 'FEATURE' })],
    })
    expect(selected.reason).toBe(COST_THRESHOLD_SELECTION.NO_APPLICABLE_COST_THRESHOLD)
    expect(selected.selectedThresholds).toHaveLength(0)
  })

  it('does not treat PARTIAL + UNAVAILABLE as COST_SAFE', () => {
    const result = resolveCostSafety({
      costSummary: summary({ classification: 'UNAVAILABLE' }),
      feature: 'tts.request',
      threshold: HARD,
    })
    expect(result.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(result.allow).toBe(false)
  })

  it('accepts 4C2b1 limit_mode rows as the threshold identity for the final decision', () => {
    const result = resolveFinalCostSafety({
      featureId: FEATURE,
      selectedThresholds: [{
        amount_minor: 100,
        currency: 'SEK',
        feature_id: null,
        limit_mode: 'HARD_STOP',
        period: 'DAILY',
        scope: 'GLOBAL',
        threshold_id: 'from-selection',
      }],
      summariesByKey: { 'GLOBAL::DAILY': summary({ amount_minor: 100 }) },
    })
    expect(result.result).toBe(COST_SAFETY.COST_HARD_STOP)
  })

  it('rejects unbounded usage reads', async () => {
    const repository = createInMemoryUsageRepository()
    await expect(repository.listInPeriod({})).rejects.toMatchObject({ code: 'unbounded_usage_query' })
    const empty = await getCostSummary({
      period: 'DAILY',
      repository,
      scope: 'GLOBAL',
      now: new Date('2026-04-02T12:00:00.000Z'),
    })
    expect(empty.classification).toBe('MEASURED')
    expect(empty.amount_minor).toBe(0)
  })
})
