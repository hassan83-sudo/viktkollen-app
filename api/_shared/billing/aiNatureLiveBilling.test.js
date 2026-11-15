import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectCostThresholdSummaries } from '../../../src/services/billing/costThresholdSelection.js'
import { QUOTA_PLAN_ACTION } from '../../../src/services/billing/quotaReservationPlan.js'
import { createInMemoryUsageRepository } from '../../../src/services/billing/usageRepository.js'
import { createPostgresUsageRepository } from '../../../src/services/billing/usageRepositoryPostgres.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../supabaseServer.js'
import {
  createAiNatureOperationId,
  executeAiNatureMeteredOperation,
  installAiNatureBillingTestRuntime,
  resolveAiNatureBillingRuntime,
  setAiNatureBillingRuntimeForTests,
} from './aiNatureLiveBilling.js'

const userId = '11111111-1111-4111-8111-111111111111'

describe('AI Natur: faktiska API-faktureringens kvotkedja', () => {
  afterEach(() => setAiNatureBillingRuntimeForTests(null))

  it('reserverar food.scan, dispatchar en gång och registrerar naturhändelse', async () => {
    const usageRepository = createInMemoryUsageRepository()
    const runtime = installAiNatureBillingTestRuntime({
      usageRepository,
      evaluate: async () => ({
        allowed: true,
        decision: 'ALLOW',
        quota_plan: { action: QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE },
        warnings: [],
      }),
    })
    expect(runtime.ok).toBe(true)
    const operationId = createAiNatureOperationId({ clientAttemptId: 'nature-api-integration', userId })
    const provider = vi.fn(async ({ markDispatched }) => {
      const claim = await markDispatched()
      expect(claim.result).toBe('FIRST_DISPATCH')
      return { ok: true }
    })
    const { billing } = await executeAiNatureMeteredOperation({
      executeProvider: provider, operationId, runtime, userId,
    })
    expect(billing.outcome).toBe('SUCCEEDED')
    expect(billing.quota_consumed).toBe(true)
    expect(provider).toHaveBeenCalledTimes(1)
    const food = await runtime.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId })
    const nature = await runtime.quota.inspectQuota({ feature: 'ai.nature.identification', unit: 'requests', userId })
    expect(food.used).toBe(1)
    expect(nature.used).toBe(1)
    const events = await usageRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('ai.nature.identification')
    expect(events[0].feature).toBe('ai.nature.identification')
  })
  it('nekar sjätte naturskanningen före AI-anrop när den delade kvoten är slut', async () => {
    const runtime = installAiNatureBillingTestRuntime({
      evaluate: async () => ({
        allowed: true,
        decision: 'ALLOW',
        quota_plan: { action: QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE },
        warnings: [],
      }),
    })
    for (let i = 0; i < 5; i += 1) {
      const reservation_id = `exhausted-food-${i}`
      const reserved = await runtime.quota.reserveQuota({
        feature: 'food.scan', quantity: 1, reservation_id, unit: 'requests', user: userId,
      })
      expect(reserved.status).toBe('RESERVED')
      expect((await runtime.quota.commitReservation({ reservation_id, actual_quantity: 1 })).status).toBe('COMMITTED')
    }
    const provider = vi.fn()
    const operationId = createAiNatureOperationId({ clientAttemptId: 'exhausted-nature', userId })
    const { billing } = await executeAiNatureMeteredOperation({
      executeProvider: provider, operationId, runtime, userId,
    })
    expect(billing.outcome).toBe('DENIED_RESERVE')
    expect(provider).not.toHaveBeenCalled()
  })

  it('stoppar AI-anrop när produktionskostnadsspärr saknar gränsvärden', async () => {
    const runtime = installAiNatureBillingTestRuntime()
    const provider = vi.fn()
    const operationId = createAiNatureOperationId({ clientAttemptId: 'no-cost-threshold', userId })
    const { billing } = await executeAiNatureMeteredOperation({
      executeProvider: provider, operationId, runtime, userId,
    })
    expect(billing.outcome).toBe('DENIED_EVALUATE')
    expect(provider).not.toHaveBeenCalled()
    expect((await runtime.quota.inspectQuota({
      feature: 'food.scan', unit: 'requests', userId,
    })).used).toBe(0)
  })

})

// --- Kostnadsspärr: gränsvärden från databasen och dag-/månadskostnad ---

const NATURE = 'ai.nature.identification'
const NOW = new Date('2026-11-15T12:00:00.000Z')
const VALID_FEATURE_CONTROL = { feature_id: NATURE, mode: 'ENABLED', reason_code: 'MANUAL_ADMIN', version: 1 }
const VALID_PROVIDER_CONTROLS = [{ provider_id: 'openai', mode: 'AVAILABLE', reason_code: 'MANUAL_ADMIN', version: 1 }]

function thresholdRow(overrides = {}) {
  return {
    amount_minor: 1000,
    currency: 'SEK',
    enabled: true,
    feature_id: NATURE,
    limit_mode: 'HARD_STOP',
    period: 'DAILY',
    scope: 'FEATURE',
    threshold_id: 'nature-daily-hard',
    version: 1,
    ...overrides,
  }
}

function natureEvent(id, occurredAt, overrides = {}) {
  return {
    cost_basis: 'UNAVAILABLE',
    event_id: id,
    event_type: NATURE,
    feature: NATURE,
    metadata: {},
    occurred_at: occurredAt,
    provider: 'openai',
    quantity: 1,
    unit: 'requests',
    ...overrides,
  }
}

// Minimal Supabase-klient: filtrerar rader som PostgREST skulle göra och loggar frågorna.
function fakeBillingClient({ failTables = [], tables = {} } = {}) {
  const queries = []
  const builder = (schema, table) => {
    const query = { filters: [], limit: null, schema, table }
    queries.push(query)
    const run = () => {
      if (failTables.includes(table)) return { data: null, error: { code: 'XX000', message: `${table}_failed` } }
      let rows = (tables[table] || []).slice()
      for (const [op, column, value] of query.filters) {
        if (op === 'eq') rows = rows.filter((row) => row[column] === value)
        if (op === 'in') rows = rows.filter((row) => value.includes(row[column]))
        if (op === 'gte') rows = rows.filter((row) => row[column] >= value)
        if (op === 'lt') rows = rows.filter((row) => row[column] < value)
      }
      if (query.limit != null) rows = rows.slice(0, query.limit)
      return { data: rows, error: null }
    }
    const api = {
      eq(column, value) { query.filters.push(['eq', column, value]); return api },
      gte(column, value) { query.filters.push(['gte', column, value]); return api },
      in(column, value) { query.filters.push(['in', column, value]); return api },
      limit(value) { query.limit = value; return api },
      lt(column, value) { query.filters.push(['lt', column, value]); return api },
      async maybeSingle() { const result = run(); return { data: result.data?.[0] ?? null, error: result.error } },
      order() { return api },
      select() { return api },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject) },
    }
    return api
  }
  return { queries, schema: (schema) => ({ from: (table) => builder(schema, table) }) }
}

function enabledCostRuntime({ selectedThresholds, summariesByKey }) {
  const usageRepository = createInMemoryUsageRepository()
  const runtime = installAiNatureBillingTestRuntime({
    featureControl: VALID_FEATURE_CONTROL,
    providerControls: VALID_PROVIDER_CONTROLS,
    selectedThresholds,
    summariesByKey,
    usageRepository,
  })
  return { runtime, usageRepository }
}

async function runNatureScan(runtime, attempt) {
  const provider = vi.fn(async ({ markDispatched }) => {
    await markDispatched()
    return { ok: true }
  })
  const { billing } = await executeAiNatureMeteredOperation({
    executeProvider: provider,
    operationId: createAiNatureOperationId({ clientAttemptId: attempt, userId }),
    runtime,
    userId,
  })
  return { billing, provider }
}

async function expectNothingConsumed(runtime, usageRepository) {
  const food = await runtime.quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId })
  const nature = await runtime.quota.inspectQuota({ feature: NATURE, unit: 'requests', userId })
  expect(food.used).toBe(0)
  expect(food.remaining).toBe(5)
  expect(nature.used).toBe(0)
  expect(await usageRepository.list()).toHaveLength(0)
}

describe('AI Natur: kostnadsspärr med gränsvärden från databasen', () => {
  afterEach(() => {
    setAiNatureBillingRuntimeForTests(null)
    clearSupabaseAdminClientForTests()
    vi.useRealTimers()
  })

  it('läser aktiva kostnadsgränser för AI Natur och beräknar dag- och månadsperiod', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const client = fakeBillingClient({
      tables: {
        cost_thresholds: [
          thresholdRow(),
          thresholdRow({ amount_minor: 5000, period: 'MONTHLY', threshold_id: 'nature-monthly-hard' }),
          thresholdRow({ enabled: false, threshold_id: 'nature-disabled' }),
          thresholdRow({ feature_id: 'food.scan', threshold_id: 'food-daily-hard' }),
          thresholdRow({ scope: 'GLOBAL', feature_id: null, threshold_id: 'global-daily-hard' }),
          thresholdRow({ scope: 'GLOBAL', feature_id: null, period: 'MONTHLY', threshold_id: 'global-monthly-hard' }),
        ],
        usage_events: [],
      },
    })
    setSupabaseAdminClientForTests(client)

    const runtime = await resolveAiNatureBillingRuntime()

    expect(runtime.ok).toBe(true)
    const thresholdQuery = client.queries.find((query) => query.table === 'cost_thresholds')
    expect(thresholdQuery.schema).toBe('billing')
    expect(thresholdQuery.filters).toEqual([['eq', 'enabled', true]])
    // Existing global limits must not affect AI Nature's dedicated limits.
    expect(runtime.selectedThresholds.map((row) => row.threshold_id).sort())
      .toEqual(['nature-daily-hard', 'nature-monthly-hard'])

    const daily = runtime.summariesByKey[`FEATURE:${NATURE}:DAILY`]
    const monthly = runtime.summariesByKey[`FEATURE:${NATURE}:MONTHLY`]
    expect(daily).toMatchObject({
      amount_minor: 0, classification: 'MEASURED',
      period_end: '2026-11-16T00:00:00.000Z', period_start: '2026-11-15T00:00:00.000Z',
    })
    expect(monthly).toMatchObject({
      amount_minor: 0, classification: 'MEASURED',
      period_end: '2026-12-01T00:00:00.000Z', period_start: '2026-11-01T00:00:00.000Z',
    })
    const usageQueries = client.queries.filter((query) => query.table === 'usage_events')
    expect(usageQueries.map((query) => query.filters)).toEqual(expect.arrayContaining([
      [['in', 'event_type', [NATURE]], ['gte', 'occurred_at', '2026-11-15T00:00:00.000Z'], ['lt', 'occurred_at', '2026-11-16T00:00:00.000Z']],
      [['in', 'event_type', [NATURE]], ['gte', 'occurred_at', '2026-11-01T00:00:00.000Z'], ['lt', 'occurred_at', '2026-12-01T00:00:00.000Z']],
    ]))
  })

  it('summerar AI Natur-kostnaden korrekt per dag och per månad', async () => {
    const client = fakeBillingClient({
      tables: {
        usage_events: [
          natureEvent('today-1', '2026-11-15T08:00:00.000Z'),
          natureEvent('today-2', '2026-11-15T11:30:00.000Z'),
          natureEvent('yesterday-last-second', '2026-11-14T23:59:59.000Z'),
          natureEvent('earlier-this-month', '2026-11-03T09:00:00.000Z'),
          natureEvent('last-month', '2026-10-31T23:59:59.000Z'),
          natureEvent('next-month-first-second', '2026-12-01T00:00:00.000Z'),
          natureEvent('food-today', '2026-11-15T09:00:00.000Z', { event_type: 'food.scan', feature: 'food.scan' }),
        ],
      },
    })
    const testCatalog = [{
      currency: 'SEK', effective_from: null, effective_to: null, per_quantity: 1,
      price_minor: 250, provider: 'openai', service: NATURE, status: 'CONFIGURED', unit: 'requests',
    }]

    const guard = await collectCostThresholdSummaries({
      catalog: testCatalog,
      featureId: NATURE,
      now: NOW,
      repository: createPostgresUsageRepository({ client }),
      thresholds: [
        thresholdRow(),
        thresholdRow({ amount_minor: 5000, period: 'MONTHLY', threshold_id: 'nature-monthly-hard' }),
      ],
    })

    // Dag: två skanningar i dag (2 × 250). Månad: i dag, igår och 3 nov (4 × 250).
    // Oktober, december och matskanningen räknas inte.
    expect(guard.summariesByKey[`FEATURE:${NATURE}:DAILY`]).toMatchObject({ amount_minor: 500, classification: 'ESTIMATED' })
    expect(guard.summariesByKey[`FEATURE:${NATURE}:MONTHLY`]).toMatchObject({ amount_minor: 1000, classification: 'ESTIMATED' })
  })

  it('blockerar AI-anrop utan kvotförbrukning när kostnadsdata inte kan läsas', async () => {
    setSupabaseAdminClientForTests(fakeBillingClient({
      failTables: ['usage_events'],
      tables: { cost_thresholds: [thresholdRow()] },
    }))
    const runtime = await resolveAiNatureBillingRuntime()
    expect(runtime).toEqual({ ok: false, code: 'DURABLE_STORE_UNAVAILABLE' })

    const { billing, provider } = await runNatureScan(runtime, 'cost-store-down')
    expect(billing.outcome).toBe('PERSISTENCE_FAILURE')
    expect(provider).not.toHaveBeenCalled()
  })

  it('blockerar AI-anrop utan kvot eller händelse när kostnaden inte kan beräknas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    setSupabaseAdminClientForTests(fakeBillingClient({
      tables: {
        cost_thresholds: [thresholdRow()],
        usage_events: [natureEvent('unpriced-today', '2026-11-15T08:00:00.000Z')],
      },
    }))
    const resolved = await resolveAiNatureBillingRuntime()
    expect(resolved.summariesByKey[`FEATURE:${NATURE}:DAILY`].classification).toBe('UNAVAILABLE')

    const { runtime, usageRepository } = enabledCostRuntime(resolved)
    const { billing, provider } = await runNatureScan(runtime, 'cost-unavailable')

    expect(billing.outcome).toBe('DENIED_EVALUATE')
    expect(billing.decision).toBe('DENY_COST_UNAVAILABLE')
    expect(provider).not.toHaveBeenCalled()
    await expectNothingConsumed(runtime, usageRepository)
  })

  it.each([
    ['daglig gräns nådd', 'DAILY', 1000],
    ['månadsgräns överskriden', 'MONTHLY', 5001],
  ])('blockerar AI-anrop utan kvot eller händelse när %s', async (_label, period, amount) => {
    const limit = period === 'DAILY' ? 1000 : 5000
    const summary = {
      amount_minor: amount, classification: 'MEASURED', currency: 'SEK', feature_id: NATURE,
      period, period_end: 'end', period_start: 'start', scope: 'FEATURE',
    }
    const { runtime, usageRepository } = enabledCostRuntime({
      selectedThresholds: [thresholdRow({ amount_minor: limit, period, threshold_id: `nature-${period}` })],
      summariesByKey: { [`FEATURE:${NATURE}:${period}`]: summary },
    })

    const { billing, provider } = await runNatureScan(runtime, `hard-${period}`)

    expect(billing.outcome).toBe('DENIED_EVALUATE')
    expect(billing.decision).toBe('DENY_COST_HARD_STOP')
    expect(provider).not.toHaveBeenCalled()
    await expectNothingConsumed(runtime, usageRepository)
  })

  it('släpper igenom exakt ett AI-anrop när kostnaden ligger under den hårda gränsen', async () => {
    const { runtime, usageRepository } = enabledCostRuntime({
      selectedThresholds: [thresholdRow()],
      summariesByKey: {
        [`FEATURE:${NATURE}:DAILY`]: {
          amount_minor: 999, classification: 'MEASURED', currency: 'SEK', feature_id: NATURE,
          period: 'DAILY', period_end: 'end', period_start: 'start', scope: 'FEATURE',
        },
      },
    })

    const { billing, provider } = await runNatureScan(runtime, 'under-limit')

    expect(billing.outcome).toBe('SUCCEEDED')
    expect(provider).toHaveBeenCalledTimes(1)
    expect((await usageRepository.list()).map((event) => event.event_type)).toEqual([NATURE])
  })
})
