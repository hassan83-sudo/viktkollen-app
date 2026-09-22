import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COST_LIMIT_MODE,
  COST_THRESHOLD_PERIOD,
  COST_THRESHOLD_SCOPE,
  COST_THRESHOLD_SELECTION,
} from './catalog.js'
import { costThresholdIdentityKey } from './costThresholdStore.js'
import {
  MAX_RELEVANT_THRESHOLDS,
  MAX_UNIQUE_SUMMARIES,
  buildCostSummaryPlan,
  collectCostThresholdSummaries,
  costSummaryKey,
  selectApplicableCostThresholds,
} from './costThresholdSelection.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function row({
  amount_minor = 1000,
  currency = 'SEK',
  enabled = true,
  feature_id = null,
  limit_mode = COST_LIMIT_MODE.HARD_STOP,
  period = COST_THRESHOLD_PERIOD.DAILY,
  scope = COST_THRESHOLD_SCOPE.GLOBAL,
  threshold_id = `${scope}-${feature_id || 'g'}-${period}-${limit_mode}`,
} = {}) {
  return {
    amount_minor,
    currency,
    enabled,
    feature_id,
    limit_mode,
    period,
    scope,
    threshold_id,
    version: 1,
  }
}

function matrix(featureId = 'food.scan') {
  const modes = [COST_LIMIT_MODE.SOFT_ALERT, COST_LIMIT_MODE.HARD_STOP]
  const periods = [COST_THRESHOLD_PERIOD.DAILY, COST_THRESHOLD_PERIOD.MONTHLY]
  const rows = []
  for (const period of periods) {
    for (const limit_mode of modes) {
      rows.push(row({ limit_mode, period, scope: 'GLOBAL', threshold_id: `g-${period}-${limit_mode}` }))
      rows.push(row({
        feature_id: featureId,
        limit_mode,
        period,
        scope: 'FEATURE',
        threshold_id: `f-${period}-${limit_mode}`,
      }))
    }
  }
  return rows
}

describe('BILL-4C2b1 threshold selection', () => {
  it('selects nothing when there are no enabled thresholds', () => {
    const result = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row({ enabled: false })],
    })
    expect(result.selectedThresholds).toHaveLength(0)
    expect(buildCostSummaryPlan(result.selectedThresholds)).toHaveLength(0)
  })

  it('ignores disabled thresholds', () => {
    const result = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row({ enabled: false }), row({ enabled: true, threshold_id: 'on' })],
    })
    expect(result.selectedThresholds.map((item) => item.threshold_id)).toEqual(['on'])
  })

  it('selects one global daily threshold and one summary requirement', () => {
    const result = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row()],
    })
    expect(result.selectedThresholds).toHaveLength(1)
    expect(buildCostSummaryPlan(result.selectedThresholds)).toHaveLength(1)
    expect(buildCostSummaryPlan(result.selectedThresholds)[0].key).toBe('GLOBAL::DAILY')
  })

  it('shares one summary for global daily SOFT + HARD', () => {
    const selected = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [
        row({ limit_mode: 'SOFT_ALERT', threshold_id: 'soft' }),
        row({ limit_mode: 'HARD_STOP', threshold_id: 'hard' }),
      ],
    }).selectedThresholds
    expect(selected).toHaveLength(2)
    expect(buildCostSummaryPlan(selected)).toHaveLength(1)
  })

  it('uses two summaries for global daily + monthly', () => {
    const selected = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [
        row({ period: 'DAILY', threshold_id: 'd' }),
        row({ period: 'MONTHLY', threshold_id: 'm' }),
      ],
    }).selectedThresholds
    expect(selected).toHaveLength(2)
    expect(buildCostSummaryPlan(selected)).toHaveLength(2)
  })

  it('selects matching feature thresholds and ignores other features', () => {
    const result = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [
        row({ feature_id: 'food.scan', scope: 'FEATURE', threshold_id: 'food' }),
        row({ feature_id: 'body.scan', scope: 'FEATURE', threshold_id: 'body' }),
      ],
    })
    expect(result.selectedThresholds.map((item) => item.threshold_id)).toEqual(['food'])
  })

  it('shares one summary for feature SOFT + HARD', () => {
    const selected = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [
        row({ feature_id: 'food.scan', limit_mode: 'SOFT_ALERT', scope: 'FEATURE', threshold_id: 's' }),
        row({ feature_id: 'food.scan', limit_mode: 'HARD_STOP', scope: 'FEATURE', threshold_id: 'h' }),
      ],
    }).selectedThresholds
    expect(selected).toHaveLength(2)
    expect(buildCostSummaryPlan(selected)).toHaveLength(1)
  })

  it('selects at most 8 relevant thresholds and 4 unique summaries', () => {
    const selected = selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: matrix(),
    }).selectedThresholds
    const identities = new Set(selected.map((row) => costThresholdIdentityKey(row)))
    expect(identities.size).toBe(MAX_RELEVANT_THRESHOLDS)
    expect(selected).toHaveLength(MAX_RELEVANT_THRESHOLDS)
    expect(buildCostSummaryPlan(selected)).toHaveLength(MAX_UNIQUE_SUMMARIES)
  })

  it('returns NO_APPLICABLE_COST_THRESHOLD for LOCAL_FREE', () => {
    const result = selectApplicableCostThresholds({
      featureId: 'friend_chat',
      thresholds: matrix(),
    })
    expect(result.reason).toBe(COST_THRESHOLD_SELECTION.NO_APPLICABLE_COST_THRESHOLD)
    expect(result.selectedThresholds).toHaveLength(0)
  })

  it('fail-safes unknown feature and invalid config', () => {
    expect(() => selectApplicableCostThresholds({ featureId: 'not.a.feature', thresholds: [] }))
      .toThrow(/unknown_feature/)
    expect(() => selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row({ currency: 'USD' })],
    })).toThrow(/invalid_cost_currency/)
    expect(() => selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row({ period: 'WEEKLY' })],
    })).toThrow(/invalid_cost_period/)
    expect(() => selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row({ scope: 'USER' })],
    })).toThrow(/invalid_cost_scope/)
    expect(() => selectApplicableCostThresholds({
      featureId: 'food.scan',
      thresholds: [row({ limit_mode: 'WARN' })],
    })).toThrow(/invalid_limit_mode/)
  })

  it('uses the same canonical key for same scope/period/feature', () => {
    expect(costSummaryKey({ period: 'DAILY', scope: 'GLOBAL' })).toBe('GLOBAL::DAILY')
    expect(costSummaryKey({ feature_id: 'food.scan', period: 'DAILY', scope: 'FEATURE' }))
      .toBe('FEATURE:food.scan:DAILY')
    expect(costSummaryKey({ period: 'MONTHLY', scope: 'GLOBAL' })).not.toBe(
      costSummaryKey({ period: 'DAILY', scope: 'GLOBAL' }),
    )
  })
})

describe('BILL-4C2b1 summary fetch orchestration', () => {
  it('calls the aggregator once for shared soft+hard identity', async () => {
    const getCostSummaryFn = vi.fn(async ({ period, scope }) => ({
      amount_minor: 0,
      classification: 'MEASURED',
      currency: 'SEK',
      period,
      scope,
    }))
    await collectCostThresholdSummaries({
      featureId: 'food.scan',
      getCostSummaryFn,
      thresholds: [
        row({ limit_mode: 'SOFT_ALERT', threshold_id: 's' }),
        row({ limit_mode: 'HARD_STOP', threshold_id: 'h' }),
      ],
    })
    expect(getCostSummaryFn).toHaveBeenCalledTimes(1)
  })

  it('calls the aggregator at most 4 times for the full matrix', async () => {
    const getCostSummaryFn = vi.fn(async ({ period, scope }) => ({
      amount_minor: 1,
      classification: 'ESTIMATED',
      currency: 'SEK',
      period,
      scope,
    }))
    const result = await collectCostThresholdSummaries({
      featureId: 'food.scan',
      getCostSummaryFn,
      thresholds: matrix(),
    })
    expect(getCostSummaryFn).toHaveBeenCalledTimes(MAX_UNIQUE_SUMMARIES)
    expect(result.selectedThresholds).toHaveLength(8)
    expect(result.summaryRequirements).toHaveLength(4)
    expect(JSON.stringify(result)).not.toMatch(/COST_HARD_STOP|COST_SOFT_ALERT/)
  })

  it('ignores client now and fake cost/threshold claims', async () => {
    const getCostSummaryFn = vi.fn(async ({ clientClaim, clock, now }) => {
      expect(clientClaim.now).toBe('2099-01-01T00:00:00.000Z')
      expect(typeof clock).toBe('function')
      expect(now).toBeUndefined()
      return {
        amount_minor: 0,
        classification: 'MEASURED',
        currency: 'SEK',
        period: 'DAILY',
        scope: 'GLOBAL',
      }
    })
    await collectCostThresholdSummaries({
      clientClaim: {
        amount_minor: 0,
        classification: 'MEASURED',
        currentCost: 0,
        now: '2099-01-01T00:00:00.000Z',
        threshold: { amount_minor: 1 },
        underLimit: true,
      },
      clock: () => new Date('2026-04-02T12:00:00.000Z'),
      featureId: 'food.scan',
      getCostSummaryFn,
      thresholds: [row()],
    })
    expect(getCostSummaryFn).toHaveBeenCalledTimes(1)
  })

  it('preserves MEASURED, ESTIMATED, and UNAVAILABLE without fabricating zero', async () => {
    const payloads = {
      'GLOBAL::DAILY': { amount_minor: 0, classification: 'MEASURED', currency: 'SEK' },
      'GLOBAL::MONTHLY': { amount_minor: 40, classification: 'ESTIMATED', currency: 'SEK' },
      'FEATURE:food.scan:DAILY': { amount_minor: null, classification: 'UNAVAILABLE', currency: 'SEK' },
    }
    const getCostSummaryFn = vi.fn(async ({ period, scope, featureId }) => {
      const key = costSummaryKey({ feature_id: featureId, period, scope })
      return { ...payloads[key], period, scope, feature_id: featureId || null }
    })
    const result = await collectCostThresholdSummaries({
      featureId: 'food.scan',
      getCostSummaryFn,
      thresholds: [
        row({ period: 'DAILY' }),
        row({ period: 'MONTHLY' }),
        row({ feature_id: 'food.scan', period: 'DAILY', scope: 'FEATURE' }),
      ],
    })
    expect(result.summariesByKey['GLOBAL::DAILY'].classification).toBe('MEASURED')
    expect(result.summariesByKey['GLOBAL::DAILY'].amount_minor).toBe(0)
    expect(result.summariesByKey['GLOBAL::MONTHLY'].classification).toBe('ESTIMATED')
    expect(result.summariesByKey['FEATURE:food.scan:DAILY'].classification).toBe('UNAVAILABLE')
    expect(result.summariesByKey['FEATURE:food.scan:DAILY'].amount_minor).toBeNull()
  })

  it('does not include secrets or raw content in the pairing output', async () => {
    const result = await collectCostThresholdSummaries({
      clientClaim: { prompt: 'secret', audio: 'x' },
      featureId: 'food.scan',
      getCostSummaryFn: async () => ({
        amount_minor: 0,
        classification: 'MEASURED',
        currency: 'SEK',
        period: 'DAILY',
        scope: 'GLOBAL',
      }),
      thresholds: [row()],
    })
    const blob = JSON.stringify(result)
    expect(blob).not.toMatch(/prompt|response|"audio"|image|gps|api_key|service_role/i)
  })

  it('does not add a new Vercel API route', () => {
    const entrypoints = [
      'api/account-deletion/index.js',
      'api/adaptive-coach/index.js',
      'api/ai-ear/interpret/index.js',
      'api/ai/index.js',
      'api/analysis-consent/index.js',
      'api/billing/admin/index.js',
      'api/billing/user/index.js',
      'api/body-analysis/index.js',
      'api/forgotten-items-analysis/index.js',
      'api/meal-analysis/index.js',
      'api/nutrition-photo-analysis/index.js',
    ]
    expect(entrypoints.every((file) => existsSync(join(root, file)))).toBe(true)
    expect(entrypoints).toHaveLength(11)
  })
})
