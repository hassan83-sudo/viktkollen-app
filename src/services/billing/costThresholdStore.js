export function costThresholdIdentityKey({ feature_id, limit_mode, period, scope }) {
  return `${scope}|${feature_id || ''}|${period}|${limit_mode}`
}

/**
 * In-memory CAS is not production authority.
 * Production uses INSERT unique identity / UPDATE ... WHERE version = expected.
 */
export function createInMemoryCostThresholdStore() {
  const byId = new Map()
  const byIdentity = new Map()

  return {
    get(thresholdId) {
      return byId.get(thresholdId) || null
    },
    getByIdentity(identity) {
      return byIdentity.get(costThresholdIdentityKey(identity)) || null
    },
    insertIfAbsent(row) {
      const key = costThresholdIdentityKey(row)
      const existing = byIdentity.get(key)
      if (existing) return { conflict: true, row: existing }
      const stored = Object.freeze({ ...row })
      byId.set(stored.threshold_id, stored)
      byIdentity.set(key, stored)
      return { conflict: false, row: stored }
    },
    compareAndSet({ expectedVersion, row, thresholdId }) {
      const current = byId.get(thresholdId) || null
      if (!current || current.version !== expectedVersion) {
        return { conflict: true, row: current }
      }
      if (costThresholdIdentityKey(current) !== costThresholdIdentityKey(row)) {
        const error = new Error('identity_immutable')
        error.code = 'identity_immutable'
        throw error
      }
      const stored = Object.freeze({ ...row })
      byId.set(thresholdId, stored)
      byIdentity.set(costThresholdIdentityKey(stored), stored)
      return { conflict: false, row: stored }
    },
    list() {
      return [...byId.values()]
    },
    listActive() {
      return [...byId.values()].filter((row) => row.enabled === true)
    },
    reset() {
      byId.clear()
      byIdentity.clear()
    },
    remove(thresholdId) {
      const current = byId.get(thresholdId)
      if (!current) return
      byId.delete(thresholdId)
      byIdentity.delete(costThresholdIdentityKey(current))
    },
  }
}

export function toResolverThreshold(row) {
  if (!row) return null
  return Object.freeze({
    amount_minor: row.amount_minor,
    currency: row.currency,
    feature_id: row.feature_id || null,
    mode: row.limit_mode,
    period: row.period,
    scope: row.scope,
  })
}
