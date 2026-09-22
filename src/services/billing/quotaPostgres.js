/**
 * Trusted-server adapter. Call only after JWT verification.
 * Does not accept client user_id as authority — pass auth.user.id.
 * EXECUTE on these RPCs is service_role only (see migration).
 * inspect uses existing billing.reserve_quota quantity-0 snapshot (no extra schema).
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
    async inspect({ feature, unit, userId } = {}) {
      const inspectId = `inspect:${String(userId || '').slice(0, 36)}:${String(feature || '').slice(0, 40)}`
      const rows = await query(
        'select billing.reserve_quota($1, $2, $3, $4, $5) as result',
        [userId, feature, unit || null, 0, inspectId],
      )
      return rows[0]?.result || { status: 'DENIED_UNKNOWN_PLAN' }
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

async function billingRpc(client, fn, args) {
  const { data, error } = await client.schema('billing').rpc(fn, args)
  if (error) {
    const wrapped = new Error(error.message || 'billing_rpc_failed')
    wrapped.code = error.code || 'billing_rpc_failed'
    throw wrapped
  }
  return data
}

export function createSupabaseBillingRpcQuery(client) {
  if (!client || typeof client.schema !== 'function') {
    const error = new Error('quota_backend_unavailable')
    error.code = 'quota_backend_unavailable'
    throw error
  }
  return async function query(sql, params = []) {
    const text = String(sql || '').toLowerCase()
    if (text.includes('rollback_quota')) {
      return [{ result: await billingRpc(client, 'rollback_quota', { p_reservation_id: params[0] }) }]
    }
    if (text.includes('commit_quota')) {
      return [{ result: await billingRpc(client, 'commit_quota', {
        p_actual_quantity: params[1],
        p_reservation_id: params[0],
      }) }]
    }
    if (text.includes('reserve_quota')) {
      return [{ result: await billingRpc(client, 'reserve_quota', {
        p_feature: params[1],
        p_quantity: params[3],
        p_reservation_id: params[4],
        p_unit: params[2],
        p_user_id: params[0],
      }) }]
    }
    const error = new Error('unsupported_billing_sql')
    error.code = 'unsupported_billing_sql'
    throw error
  }
}
