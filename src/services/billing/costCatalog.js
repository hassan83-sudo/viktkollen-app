import { CATALOG_STATUS, SUPPORTED_CURRENCIES } from './catalog.js'
import { assertCurrency } from './money.js'

function parseTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isCatalogEntryActive(entry, at = new Date()) {
  if (!entry) return false
  const when = at instanceof Date ? at : new Date(at)
  const from = parseTime(entry.effective_from)
  const to = parseTime(entry.effective_to)
  if (from && when < from) return false
  if (to && when >= to) return false
  return true
}

export function findCostCatalogEntry(catalog = [], query = {}, at = new Date()) {
  const matches = (catalog || []).filter((entry) => (
    entry.provider === query.provider
    && entry.service === query.service
    && entry.model === query.model
    && entry.unit === query.unit
    && isCatalogEntryActive(entry, at)
  ))

  matches.sort((first, second) => String(second.effective_from || '').localeCompare(String(first.effective_from || '')))
  return matches[0] || null
}

export function createUnconfiguredCatalogEntry({
  model,
  provider,
  service,
  unit,
} = {}) {
  return {
    currency: 'SEK',
    effective_from: null,
    effective_to: null,
    model,
    per_quantity: 1,
    price_minor: null,
    provider,
    service,
    status: CATALOG_STATUS[0],
    unit,
  }
}

export function validateCatalogEntry(entry = {}) {
  if (!SUPPORTED_CURRENCIES.includes(String(entry.currency || '').toUpperCase())) {
    const error = new Error('unsupported_currency')
    error.code = 'unsupported_currency'
    throw error
  }
  assertCurrency(entry.currency)

  if (entry.status === 'CONFIGURED') {
    if (!Number.isInteger(entry.price_minor) || entry.price_minor < 0) {
      const error = new Error('invalid_price')
      error.code = 'invalid_price'
      throw error
    }
    if (!Number.isInteger(entry.per_quantity) || entry.per_quantity <= 0) {
      const error = new Error('invalid_price_scale')
      error.code = 'invalid_price_scale'
      throw error
    }
  }

  return {
    ...entry,
    currency: String(entry.currency).toUpperCase(),
    status: entry.status || (entry.price_minor == null ? 'UNCONFIGURED' : 'CONFIGURED'),
  }
}

/** Production default: known services, no invented prices. */
export const defaultCostCatalog = Object.freeze([
  createUnconfiguredCatalogEntry({ model: 'gpt-4.1-mini', provider: 'openai', service: 'ai.text.request', unit: 'requests' }),
  createUnconfiguredCatalogEntry({ model: 'gpt-4.1-mini', provider: 'openai', service: 'ai.text.request', unit: 'tokens' }),
  createUnconfiguredCatalogEntry({ model: 'gpt-4.1-mini', provider: 'openai', service: 'food.scan', unit: 'requests' }),
  createUnconfiguredCatalogEntry({ model: 'gpt-4.1-mini', provider: 'openai', service: 'ai.eye.analysis', unit: 'requests' }),
  createUnconfiguredCatalogEntry({ model: 'gpt-4o-mini-realtime-preview', provider: 'openai', service: 'ai.voice.session', unit: 'sessions' }),
  createUnconfiguredCatalogEntry({ model: 'gpt-5.6-luna', provider: 'openai', service: 'ai.text.request', unit: 'requests' }),
])
