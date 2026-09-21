import { PROVIDER_CLASSIFICATION } from './catalog.js'

/**
 * Canonical providers from live code + BILL-1 inventory. No guessed vendors.
 * Metadata is operational only: never keys, tokens, or service-account JSON.
 */
export const BILLING_PROVIDERS = Object.freeze({
  openai: Object.freeze({
    classification: PROVIDER_CLASSIFICATION.EXTERNAL_API,
    provider_id: 'openai',
  }),
  'google.cloud_run.ai_ear': Object.freeze({
    classification: PROVIDER_CLASSIFICATION.EXTERNAL_COMPUTE,
    provider_id: 'google.cloud_run.ai_ear',
  }),
})

export function resolveProviderId(value) {
  const raw = String(value || '').trim()
  return BILLING_PROVIDERS[raw] ? raw : null
}

export function getProviderDefinition(value) {
  const id = resolveProviderId(value)
  return id ? BILLING_PROVIDERS[id] : null
}

export function canonicalProviderIds() {
  return Object.keys(BILLING_PROVIDERS)
}

export function createProviderRegistry(entries) {
  const byId = new Map()
  for (const entry of entries) {
    const id = String(entry?.provider_id || '').trim()
    const classification = entry?.classification
    if (!id) {
      const error = new Error('invalid_provider_id')
      error.code = 'invalid_provider_id'
      throw error
    }
    if (byId.has(id)) {
      const error = new Error('duplicate_provider_id')
      error.code = 'duplicate_provider_id'
      throw error
    }
    if (!Object.values(PROVIDER_CLASSIFICATION).includes(classification)) {
      const error = new Error('invalid_provider_classification')
      error.code = 'invalid_provider_classification'
      throw error
    }
    byId.set(id, Object.freeze({ classification, provider_id: id }))
  }
  return Object.freeze({
    get(providerId) {
      return byId.get(providerId) || null
    },
    has(providerId) {
      return byId.has(providerId)
    },
    ids() {
      return [...byId.keys()]
    },
  })
}

export const defaultProviderRegistry = createProviderRegistry(
  Object.values(BILLING_PROVIDERS).map((provider) => ({
    classification: provider.classification,
    provider_id: provider.provider_id,
  })),
)
