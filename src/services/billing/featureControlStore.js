import { BILLING_FEATURES, resolveFeatureId } from './features.js'

export function createInMemoryFeatureControlStore() {
  const byId = new Map()

  return {
    async get(featureId) {
      return byId.get(featureId) || null
    },
    /**
     * Synchronous compare-and-set. In-memory is not the production boundary;
     * SQL uses UPDATE ... WHERE version = expected / unique insert.
     */
    compareAndSet({ expectedVersion, featureId, row }) {
      const current = byId.get(featureId) || null
      const currentVersion = current ? current.version : 0
      if (currentVersion !== expectedVersion) {
        return { conflict: true, row: current }
      }
      if (current && expectedVersion === 0) {
        return { conflict: true, row: current }
      }
      const stored = Object.freeze({ ...row })
      byId.set(featureId, stored)
      return { conflict: false, row: stored }
    },
    async list() {
      return [...byId.values()]
    },
    reset() {
      byId.clear()
    },
    remove(featureId) {
      byId.delete(featureId)
    },
  }
}

export function assertCanonicalFeatureId(value) {
  const canonical = resolveFeatureId(value)
  const raw = String(value || '').trim()
  if (!canonical || canonical !== raw || !BILLING_FEATURES[canonical]) {
    const error = new Error('unknown_feature')
    error.code = 'unknown_feature'
    throw error
  }
  return canonical
}
