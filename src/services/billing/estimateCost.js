import { findCostCatalogEntry, validateCatalogEntry } from './costCatalog.js'
import { convertMinorToSekOre, multiplyMinorCost } from './money.js'

export function estimateUsageCost({
  catalog = [],
  event,
  fx = null,
  occurredAt,
} = {}) {
  if (!event) {
    return { cost_basis: 'UNAVAILABLE', reason: 'missing_event', sek_ore: null }
  }

  const at = occurredAt || event.occurred_at || new Date()
  const entry = findCostCatalogEntry(catalog, {
    model: event.model,
    provider: event.provider,
    service: event.event_type,
    unit: event.unit,
  }, at)

  if (!entry || entry.status !== 'CONFIGURED' || entry.price_minor == null) {
    return { cost_basis: 'UNAVAILABLE', reason: 'unknown_price', sek_ore: null }
  }

  const validated = validateCatalogEntry(entry)
  const sourceMinor = multiplyMinorCost(event.quantity, validated.price_minor, validated.per_quantity || 1)

  if (validated.currency === 'SEK') {
    return {
      cost_basis: 'ESTIMATED',
      currency: 'SEK',
      minor: sourceMinor,
      sek_ore: sourceMinor,
      source_currency: 'SEK',
      source_minor: sourceMinor,
    }
  }

  const rate = fx?.sekOrePerMajor?.[validated.currency]
  if (!Number.isInteger(rate) || rate < 0) {
    return {
      cost_basis: 'UNAVAILABLE',
      reason: 'missing_fx',
      source_currency: validated.currency,
      source_minor: sourceMinor,
    }
  }

  return {
    cost_basis: 'ESTIMATED',
    currency: 'SEK',
    fx_effective_at: fx.effective_at || null,
    minor: convertMinorToSekOre(sourceMinor, validated.currency, rate),
    sek_ore: convertMinorToSekOre(sourceMinor, validated.currency, rate),
    source_currency: validated.currency,
    source_minor: sourceMinor,
  }
}
