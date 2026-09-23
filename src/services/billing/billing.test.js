import { afterEach, describe, expect, it } from 'vitest'
import { defaultCostCatalog, findCostCatalogEntry } from './costCatalog.js'
import { estimateUsageCost } from './estimateCost.js'
import { convertMinorToSekOre, multiplyMinorCost } from './money.js'
import { extractOpenAiUsage } from './openaiUsage.js'
import { recordUsageEvent } from './recordUsage.js'
import { createUsageEvent, sanitizeUsageMetadata } from './usageEvent.js'
import { createInMemoryUsageRepository, setUsageRepositoryForTests } from './usageRepository.js'

const validEvent = {
  event_id: 'evt-1',
  event_type: 'ai.text.request',
  feature: 'ai.text.request',
  model: 'gpt-4.1-mini',
  occurred_at: '2026-04-01T12:00:00.000Z',
  provider: 'openai',
  quantity: 1,
  unit: 'requests',
  user_id: 'user-1',
}

describe('BILL-1 usage events', () => {
  afterEach(() => {
    setUsageRepositoryForTests(createInMemoryUsageRepository())
  })

  it('accepts a valid usage event', () => {
    const event = createUsageEvent(validEvent)
    expect(event.event_id).toBe('evt-1')
    expect(event.quantity).toBe(1)
    expect(event.occurred_at).toBe('2026-04-01T12:00:00.000Z')
  })

  it('rejects invalid type, unit and negative quantity', () => {
    expect(() => createUsageEvent({ ...validEvent, event_type: 'not-a-type' })).toThrow(/invalid_event_type/)
    expect(() => createUsageEvent({ ...validEvent, unit: 'bananas' })).toThrow(/invalid_unit/)
    expect(() => createUsageEvent({ ...validEvent, quantity: -1 })).toThrow(/invalid_quantity/)
  })

  it('allows zero quantity', () => {
    expect(createUsageEvent({ ...validEvent, quantity: 0 }).quantity).toBe(0)
  })

  it('drops unknown and sensitive metadata via allowlist', () => {
    const metadata = sanitizeUsageMetadata({
      audio: 'secret.wav',
      card_number: '4111111111111111',
      coordinates: '59.3,18.0',
      cvv: '123',
      extra: 'nope',
      image: 'pic',
      image_url: 'https://example.com/x.jpg',
      input_tokens: 12,
      password: 'hunter2',
      prompt: 'Visa min vikt',
      response: 'hej',
      usage_basis: 'MEASURED',
    })
    expect(metadata).toEqual({ input_tokens: 12, usage_basis: 'MEASURED' })
  })

  it('never persists sensitive fields even if nested on the input object', async () => {
    const result = await recordUsageEvent({
      ...validEvent,
      metadata: { prompt: 'hej', response: 'då', audio: 'x', image: 'y', coordinates: '1,2' },
      prompt: 'hej',
      response: 'då',
    })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result.event)).not.toMatch(/prompt|response|"audio"|coordinates|password|card_number|"cvv"/)
  })

  it('is idempotent on retry of the same event_id', async () => {
    const repo = createInMemoryUsageRepository()
    const first = await recordUsageEvent(validEvent, repo)
    const retry = await recordUsageEvent({ ...validEvent, quantity: 9 }, repo)
    expect(first.duplicate).toBe(false)
    expect(retry.duplicate).toBe(true)
    expect((await repo.list()).length).toBe(1)
    expect((await repo.getByEventId('evt-1')).quantity).toBe(1)
  })
})

describe('BILL-1 cost catalog and money', () => {
  const catalog = [
    {
      currency: 'SEK',
      effective_from: '2026-01-01T00:00:00.000Z',
      effective_to: '2026-06-01T00:00:00.000Z',
      model: 'gpt-4.1-mini',
      per_quantity: 1,
      price_minor: 25,
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
      price_minor: 40,
      provider: 'openai',
      service: 'ai.text.request',
      status: 'CONFIGURED',
      unit: 'requests',
    },
    {
      currency: 'USD',
      effective_from: '2026-01-01T00:00:00.000Z',
      effective_to: null,
      model: 'gpt-4.1-mini',
      per_quantity: 1_000_000,
      price_minor: 15,
      provider: 'openai',
      service: 'ai.text.request',
      status: 'CONFIGURED',
      unit: 'tokens',
    },
  ]

  it('looks up historical prices by effective window', () => {
    const winter = findCostCatalogEntry(catalog, {
      model: 'gpt-4.1-mini',
      provider: 'openai',
      service: 'ai.text.request',
      unit: 'requests',
    }, '2026-04-01T00:00:00.000Z')
    const summer = findCostCatalogEntry(catalog, {
      model: 'gpt-4.1-mini',
      provider: 'openai',
      service: 'ai.text.request',
      unit: 'requests',
    }, '2026-07-01T00:00:00.000Z')
    expect(winter.price_minor).toBe(25)
    expect(summer.price_minor).toBe(40)
  })

  it('treats default production catalog prices as unconfigured', () => {
    expect(defaultCostCatalog.every((entry) => entry.status === 'UNCONFIGURED' && entry.price_minor == null)).toBe(true)
  })

  it('estimates SEK cost in öre without floating money math', () => {
    const event = createUsageEvent({ ...validEvent, quantity: 3 })
    const cost = estimateUsageCost({ catalog, event, occurredAt: '2026-04-01T00:00:00.000Z' })
    expect(cost.cost_basis).toBe('ESTIMATED')
    expect(cost.sek_ore).toBe(75)
  })

  it('converts USD minor units to SEK with explicit FX fixtures', () => {
    expect(convertMinorToSekOre(100, 'USD', 1050)).toBe(1050)
    const event = createUsageEvent({ ...validEvent, quantity: 1_000_000, unit: 'tokens' })
    const cost = estimateUsageCost({
      catalog,
      event,
      fx: { effective_at: '2026-04-01T00:00:00.000Z', sekOrePerMajor: { USD: 1000 } },
    })
    expect(cost.cost_basis).toBe('ESTIMATED')
    expect(cost.source_minor).toBe(15)
    expect(cost.sek_ore).toBe(150)
  })

  it('returns UNAVAILABLE for missing price and rejects negative cost inputs', () => {
    const event = createUsageEvent({ ...validEvent, model: 'unknown-model' })
    expect(estimateUsageCost({ catalog, event }).cost_basis).toBe('UNAVAILABLE')
    expect(() => multiplyMinorCost(-1, 10, 1)).toThrow(/invalid_quantity/)
    expect(multiplyMinorCost(0, 10, 1)).toBe(0)
    expect(multiplyMinorCost(1_000_000, 15, 1_000_000)).toBe(15)
  })

  it('rejects unsupported catalog currency', () => {
    expect(() => findCostCatalogEntry && estimateUsageCost({
      catalog: [{ ...catalog[0], currency: 'GBP', status: 'CONFIGURED' }],
      event: createUsageEvent(validEvent),
    })).toThrow(/unsupported_currency/)
  })
})

describe('OpenAI usage extraction', () => {
  it('marks token counts MEASURED when the provider returns usage', () => {
    expect(extractOpenAiUsage({
      usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18, input_tokens_details: { cached_tokens: 2 } },
    })).toEqual({
      cached_tokens: 2,
      input_tokens: 11,
      output_tokens: 7,
      total_tokens: 18,
      usage_basis: 'MEASURED',
    })
  })

  it('marks usage UNAVAILABLE when the provider omits usage', () => {
    expect(extractOpenAiUsage({ output_text: '{}' }).usage_basis).toBe('UNAVAILABLE')
  })
})
