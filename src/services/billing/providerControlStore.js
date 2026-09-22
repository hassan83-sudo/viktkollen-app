import { BILLING_PROVIDERS, resolveProviderId } from './providers.js'

export function createInMemoryProviderControlStore() {
  const byId = new Map()

  return {
    async get(providerId) {
      return byId.get(providerId) || null
    },
    /**
     * Synchronous compare-and-set. In-memory is not the production boundary;
     * SQL uses UPDATE ... WHERE version = expected / unique insert.
     */
    compareAndSet({ expectedVersion, providerId, row }) {
      const current = byId.get(providerId) || null
      const currentVersion = current ? current.version : 0
      if (currentVersion !== expectedVersion) {
        return { conflict: true, row: current }
      }
      if (current && expectedVersion === 0) {
        return { conflict: true, row: current }
      }
      const stored = Object.freeze({ ...row })
      byId.set(providerId, stored)
      return { conflict: false, row: stored }
    },
    async list() {
      return [...byId.values()]
    },
    reset() {
      byId.clear()
    },
    remove(providerId) {
      byId.delete(providerId)
    },
  }
}

export function assertCanonicalProviderId(value) {
  const canonical = resolveProviderId(value)
  const raw = String(value || '').trim()
  if (!canonical || canonical !== raw || !BILLING_PROVIDERS[canonical]) {
    const error = new Error('unknown_provider')
    error.code = 'unknown_provider'
    throw error
  }
  return canonical
}
