/**
 * Trusted-server adapter. Call only after JWT verification.
 * Does not accept client user_id as authority — pass auth.user.id.
 * EXECUTE on these RPCs is service_role only (see migration).
 */
export function createPostgresQuotaBackend(query) {
  return {
    async commit({ actual_quantity, reservation_id }) {
      const rows = await query(
        'select billing.commit_quota($1, $2) as result',
        [reservation_id, actual_quantity == null ? null : actual_quantity],
      )
      return rows[0].result
    },
    async inspect() {
      const error = new Error('postgres_inspect_use_reserve_snapshot')
      error.code = 'postgres_inspect_use_reserve_snapshot'
      throw error
    },
    async rollback({ reservation_id }) {
      const rows = await query('select billing.rollback_quota($1) as result', [reservation_id])
      return rows[0].result
    },
    async reserve({ feature, quantity, reservation_id, unit, userId }) {
      const rows = await query(
        'select billing.reserve_quota($1, $2, $3, $4, $5) as result',
        [userId, feature, unit || null, quantity, reservation_id],
      )
      return rows[0].result
    },
  }
}
