import { afterEach, describe, expect, it } from 'vitest'
import { COST_LIMIT_MODE, COST_SAFETY, COST_THRESHOLD_PERIOD, COST_THRESHOLD_SCOPE } from './catalog.js'
import { costPeriodBounds, getCostSummary } from './costAggregation.js'
import { COST_AGGREGATION_SQL } from './costAggregationPostgres.js'
import { resolveCostSafety } from './costSafety.js'
import { createUsageEvent } from './usageEvent.js'
import { createInMemoryUsageRepository, setUsageRepositoryForTests } from './usageRepository.js'

const CATALOG = [
  {
    currency: 'SEK',
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_to: null,
    model: 'gpt-4.1-mini',
    per_quantity: 1,
    price_minor: 25,
    provider: 'openai',
    service: 'food.scan',
    status: 'CONFIGURED',
    unit: 'requests',
  },
  {
    currency: 'SEK',
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_to: '2026-06-01T00:00:00.000Z',
    model: 'gpt-4.1-mini',
    per_quantity: 1,
    price_minor: 40,
    provider: 'openai',
    service: 'ai.text.request',
    status: 'CONFIGURED',
    unit: 'requests',
  },
  {
    currency: 'SEK',
    effective_from: '2026-06-01T00:00:00.000Z',
    effective_to: null,
    model: 'gpt-4.1-mini',
    per_quantity: 1,
    price_minor: 80,
    provider: 'openai',
    service: 'ai.text.request',
    status: 'CONFIGURED',
    unit: 'requests',
  },
  {
    currency: 'SEK',
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_to: null,
    model: 'gpt-4.1-mini',
    per_quantity: 1,
    price_minor: 10,
    provider: 'openai',
    service: 'body.scan',
    status: 'CONFIGURED',
    unit: 'requests',
  },
]

function event(overrides) {
  return createUsageEvent({
    event_id: overrides.event_id || `evt-${Math.random().toString(36).slice(2, 10)}`,
    event_type: 'food.scan',
    feature: 'food.scan',
    model: 'gpt-4.1-mini',
    occurred_at: '2026-04-02T12:00:00.000Z',
    provider: 'openai',
    quantity: 1,
    unit: 'requests',
    user_id: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  })
}

async function seed(repo, events) {
  for (const row of events) {
    await repo.insert(row)
  }
}

describe('BILL-4C2a cost aggregation', () => {
  afterEach(() => {
    setUsageRepositoryForTests(createInMemoryUsageRepository())
  })

  it('uses inclusive start and exclusive end for DAILY UTC bounds', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({ event_id: 'before', occurred_at: '2026-04-01T23:59:59.999Z', quantity: 1 }),
      event({ event_id: 'start', occurred_at: '2026-04-02T00:00:00.000Z', quantity: 1 }),
      event({ event_id: 'before-end', occurred_at: '2026-04-02T23:59:59.999Z', quantity: 1 }),
      event({ event_id: 'end', occurred_at: '2026-04-03T00:00:00.000Z', quantity: 1 }),
    ])
    const bounds = costPeriodBounds('DAILY', '2026-04-02T15:00:00.000Z')
    expect(bounds.period_start).toBe('2026-04-02T00:00:00.000Z')
    expect(bounds.period_end).toBe('2026-04-03T00:00:00.000Z')
    const summary = await getCostSummary({
      catalog: CATALOG,
      now: '2026-04-02T15:00:00.000Z',
      period: COST_THRESHOLD_PERIOD.DAILY,
      repository: repo,
      scope: COST_THRESHOLD_SCOPE.FEATURE,
      featureId: 'food.scan',
    })
    expect(summary.amount_minor).toBe(50)
    expect(summary.classification).toBe('ESTIMATED')
    expect(summary.period_start).toBe(bounds.period_start)
    expect(summary.period_end).toBe(bounds.period_end)
  })

  it('uses calendar-month UTC bounds, not a rolling 30-day window', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({ event_id: 'jan', occurred_at: '2026-01-31T23:59:59.999Z' }),
      event({ event_id: 'feb-start', occurred_at: '2026-02-01T00:00:00.000Z' }),
      event({ event_id: 'feb-28', occurred_at: '2026-02-28T23:59:59.999Z' }),
      event({ event_id: 'mar', occurred_at: '2026-03-01T00:00:00.000Z' }),
    ])
    const feb = costPeriodBounds('MONTHLY', '2026-02-15T12:00:00.000Z')
    expect(feb.period_start).toBe('2026-02-01T00:00:00.000Z')
    expect(feb.period_end).toBe('2026-03-01T00:00:00.000Z')
    const summary = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-02-15T12:00:00.000Z',
      period: COST_THRESHOLD_PERIOD.MONTHLY,
      repository: repo,
      scope: COST_THRESHOLD_SCOPE.FEATURE,
    })
    expect(summary.amount_minor).toBe(50)
    const leap = costPeriodBounds('MONTHLY', '2024-02-15T00:00:00.000Z')
    expect(leap.period_start).toBe('2024-02-01T00:00:00.000Z')
    expect(leap.period_end).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sums GLOBAL across canonical features and isolates FEATURE', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({ event_id: 'food', event_type: 'food.scan', feature: 'food.scan', quantity: 2 }),
      event({
        event_id: 'text',
        event_type: 'ai.text.request',
        feature: 'ai.text.request',
        quantity: 1,
      }),
      event({
        event_id: 'body',
        event_type: 'body.scan',
        feature: 'body.scan',
        quantity: 1,
      }),
    ])
    const global = await getCostSummary({
      catalog: CATALOG,
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'GLOBAL',
    })
    expect(global.amount_minor).toBe(2 * 25 + 40 + 10)
    expect(global.feature_id).toBeNull()
    expect(global.scope).toBe('GLOBAL')
    const feature = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(feature.amount_minor).toBe(50)
    expect(feature.feature_id).toBe('food.scan')
  })

  it('blocks unknown feature ids', async () => {
    await expect(getCostSummary({
      catalog: CATALOG,
      featureId: 'not.a.feature',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      scope: 'FEATURE',
    })).rejects.toMatchObject({ code: 'unknown_feature' })
  })

  it('keeps catalog-priced totals ESTIMATED even when usage_basis is MEASURED', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({
        event_id: 'measured-qty',
        metadata: { usage_basis: 'MEASURED', input_tokens: 11 },
        quantity: 3,
      }),
    ])
    const summary = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(summary.classification).toBe('ESTIMATED')
    expect(summary.amount_minor).toBe(75)
    expect(Number.isInteger(summary.amount_minor)).toBe(true)
  })

  it('does not upgrade mixed estimated money to MEASURED', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({ event_id: 'a', quantity: 1 }),
      event({ event_id: 'b', quantity: 2 }),
    ])
    const summary = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(summary.classification).toBe('ESTIMATED')
    expect(summary.classification).not.toBe('MEASURED')
    expect(summary.amount_minor).toBe(75)
  })

  it('returns UNAVAILABLE (not 0) when any component lacks a cost', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({ event_id: 'priced', quantity: 1 }),
      event({
        event_id: 'unknown',
        event_type: 'ai.ear.interpret',
        feature: 'ai.ear.interpret',
        model: 'perch',
        provider: 'google.cloud_run.ai_ear',
      }),
    ])
    const summary = await getCostSummary({
      catalog: CATALOG,
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'GLOBAL',
    })
    expect(summary.classification).toBe('UNAVAILABLE')
    expect(summary.amount_minor).toBeNull()
  })

  it('treats known coverage with no events as measured zero, not UNAVAILABLE', async () => {
    const repo = createInMemoryUsageRepository()
    const summary = await getCostSummary({
      catalog: CATALOG,
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'GLOBAL',
    })
    expect(summary.classification).toBe('MEASURED')
    expect(summary.amount_minor).toBe(0)
  })

  it('returns UNAVAILABLE for unconfigured catalog prices', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [event({ event_id: 'no-price', model: 'unknown-model' })])
    const summary = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(summary.classification).toBe('UNAVAILABLE')
    expect(summary.amount_minor).toBeNull()
  })

  it('fail-safes invalid units and negative quantities to UNAVAILABLE', async () => {
    const repo = createInMemoryUsageRepository()
    await repo.insert({
      cost_basis: 'UNAVAILABLE',
      event_id: 'bad-unit',
      event_type: 'food.scan',
      feature: 'food.scan',
      metadata: {},
      model: 'gpt-4.1-mini',
      occurred_at: '2026-04-02T12:00:00.000Z',
      provider: 'openai',
      quantity: 1,
      reference_id: 'bad-unit',
      unit: 'bananas',
      user_id: '',
    })
    const unitSummary = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(unitSummary.classification).toBe('UNAVAILABLE')
    const repo2 = createInMemoryUsageRepository()
    await repo2.insert({
      cost_basis: 'UNAVAILABLE',
      event_id: 'neg',
      event_type: 'food.scan',
      feature: 'food.scan',
      metadata: {},
      model: 'gpt-4.1-mini',
      occurred_at: '2026-04-02T12:00:00.000Z',
      provider: 'openai',
      quantity: -3,
      reference_id: 'neg',
      unit: 'requests',
      user_id: '',
    })
    const neg = await getCostSummary({
      catalog: CATALOG,
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo2,
      scope: 'FEATURE',
    })
    expect(neg.classification).toBe('UNAVAILABLE')
    expect(neg.amount_minor).toBeNull()
  })

  it('ignores client cost spoof fields', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [event({ event_id: 'real', quantity: 2 })])
    const summary = await getCostSummary({
      catalog: CATALOG,
      clientClaim: {
        clientNow: '2099-01-01T00:00:00.000Z',
        costMinor: 0,
        currentCost: 0,
        estimatedCost: 0,
        now: '2099-01-01T00:00:00.000Z',
        totalCost: 0,
        underLimit: true,
      },
      featureId: 'food.scan',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(summary.amount_minor).toBe(50)
    expect(summary.period_start).toBe('2026-04-02T00:00:00.000Z')
  })

  it('uses injected test clock and not client now as production authority', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [event({ event_id: 'april', occurred_at: '2026-04-02T01:00:00.000Z' })])
    let clockNow = new Date('2026-05-02T12:00:00.000Z')
    const summary = await getCostSummary({
      catalog: CATALOG,
      clientClaim: { now: '2026-04-02T12:00:00.000Z' },
      clock: () => clockNow,
      featureId: 'food.scan',
      period: 'MONTHLY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(summary.amount_minor).toBe(0)
    expect(summary.period_start).toBe('2026-05-01T00:00:00.000Z')
  })

  it('prices historical events with the catalog window at occurred_at, not now', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [
      event({
        event_id: 'winter-text',
        event_type: 'ai.text.request',
        feature: 'ai.text.request',
        occurred_at: '2026-04-02T12:00:00.000Z',
      }),
    ])
    const summary = await getCostSummary({
      catalog: CATALOG,
      featureId: 'ai.text.request',
      now: '2026-07-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(summary.amount_minor).toBe(0)
    const april = await getCostSummary({
      catalog: CATALOG,
      featureId: 'ai.text.request',
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'FEATURE',
    })
    expect(april.amount_minor).toBe(40)
  })

  it('hands MEASURED-empty and ESTIMATED totals to resolveCostSafety without returning HARD_STOP itself', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [event({ event_id: 'over', quantity: 4 })])
    const summary = await getCostSummary({
      catalog: CATALOG,
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'GLOBAL',
    })
    expect(summary).not.toHaveProperty('result')
    expect(JSON.stringify(summary)).not.toMatch(/HARD_STOP|SOFT_ALERT/)
    const decision = resolveCostSafety({
      costSummary: summary,
      feature: 'food.scan',
      threshold: {
        amount_minor: 50,
        currency: 'SEK',
        mode: COST_LIMIT_MODE.HARD_STOP,
        period: 'DAILY',
        scope: 'GLOBAL',
      },
    })
    expect(decision.result).toBe(COST_SAFETY.COST_HARD_STOP)
    expect(summary.amount_minor).toBe(100)
  })

  it('hands UNAVAILABLE summaries to HARD cost-safety as COST_UNAVAILABLE deny', async () => {
    const repo = createInMemoryUsageRepository()
    await seed(repo, [event({ event_id: 'nope', model: 'missing' })])
    const summary = await getCostSummary({
      catalog: CATALOG,
      now: '2026-04-02T12:00:00.000Z',
      period: 'DAILY',
      repository: repo,
      scope: 'GLOBAL',
    })
    expect(summary.classification).toBe('UNAVAILABLE')
    const decision = resolveCostSafety({
      costSummary: summary,
      feature: 'food.scan',
      threshold: {
        amount_minor: 1,
        currency: 'SEK',
        mode: COST_LIMIT_MODE.HARD_STOP,
        period: 'DAILY',
        scope: 'GLOBAL',
      },
    })
    expect(decision.result).toBe(COST_SAFETY.COST_UNAVAILABLE)
    expect(decision.allow).toBe(false)
    expect(decision.amount_minor).toBeNull()
  })

  it('documents a bounded event_type + occurred_at query without content columns', () => {
    expect(COST_AGGREGATION_SQL).toMatch(/occurred_at >= \$1/)
    expect(COST_AGGREGATION_SQL).toMatch(/occurred_at < \$2/)
    expect(COST_AGGREGATION_SQL).toMatch(/event_type = any/)
    expect(COST_AGGREGATION_SQL).not.toMatch(/prompt|response|audio|image|gps|password|api_key/i)
  })
})
