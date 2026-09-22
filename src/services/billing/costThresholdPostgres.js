/**
 * Trusted-server adapter. Call only after JWT + billing_admin.
 * Production CAS is billing.create_cost_threshold / billing.update_cost_threshold.
 * Does not aggregate usage events.
 */
export function createPostgresCostThresholdBackend(query) {
  return {
    async create({
      actorUserId,
      amountMinor,
      currency,
      enabled,
      featureId,
      limitMode,
      period,
      scope,
    }) {
      const rows = await query(
        'select * from billing.create_cost_threshold($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          actorUserId,
          scope,
          featureId,
          period,
          limitMode,
          amountMinor,
          currency,
          enabled,
        ],
      )
      return rows[0]
    },
    async listActive() {
      return query(
        'select * from billing.cost_thresholds where enabled = true',
      )
    },
    async update({ actorUserId, amountMinor, enabled, expectedVersion, thresholdId }) {
      const rows = await query(
        'select * from billing.update_cost_threshold($1, $2, $3, $4, $5)',
        [actorUserId, thresholdId, expectedVersion, amountMinor, enabled],
      )
      return rows[0]
    },
  }
}
