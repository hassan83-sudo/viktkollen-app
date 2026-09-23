function unavailable(code = 'admin_store_unavailable') {
  const error = new Error(code)
  error.code = code
  throw error
}

function unwrapRpc(data) {
  if (Array.isArray(data)) return data[0] || null
  return data || null
}

function wrapRpcError(error) {
  const wrapped = new Error(error?.message || 'billing_rpc_failed')
  wrapped.code = error?.code || error?.message || 'billing_rpc_failed'
  throw wrapped
}

/**
 * BILL-4B controls via PostgREST billing schema. Production authority is
 * set_feature_control / set_provider_control, not a process Map.
 */
export function createPostgresBillingControlAdapter({ client } = {}) {
  if (!client || typeof client.schema !== 'function') unavailable()

  function billing() {
    return client.schema('billing')
  }

  async function rpc(fn, args) {
    const { data, error } = await billing().rpc(fn, args)
    if (error) wrapRpcError(error)
    return unwrapRpc(data)
  }

  return {
    authority: 'billing_controls',
    durable: true,
    async getFeatureControl(featureId) {
      const id = String(featureId || '').trim()
      if (!id) return null
      const { data, error } = await billing()
        .from('feature_controls')
        .select('feature_id,mode,reason_code,version')
        .eq('feature_id', id)
        .maybeSingle()
      if (error) wrapRpcError(error)
      return data || null
    },
    async getProviderControl(providerId) {
      const id = String(providerId || '').trim()
      if (!id) return null
      const { data, error } = await billing()
        .from('provider_controls')
        .select('provider_id,mode,reason_code,version')
        .eq('provider_id', id)
        .maybeSingle()
      if (error) wrapRpcError(error)
      return data || null
    },
    async hasBillingAdmin(userId) {
      const id = String(userId || '').trim()
      if (!id) return false
      try {
        const { data, error } = await billing().rpc('has_billing_admin', { p_user_id: id })
        if (error) return false
        return data === true
      } catch {
        return false
      }
    },
    async setFeatureControl({
      actorUserId,
      expectedVersion = 0,
      featureId,
      mode,
      reasonCode,
    } = {}) {
      return rpc('set_feature_control', {
        p_actor_user_id: actorUserId,
        p_expected_version: expectedVersion,
        p_feature_id: featureId,
        p_mode: mode,
        p_reason_code: reasonCode,
      })
    },
    async setProviderControl({
      actorUserId,
      expectedVersion = 0,
      mode,
      providerId,
      reasonCode,
    } = {}) {
      return rpc('set_provider_control', {
        p_actor_user_id: actorUserId,
        p_expected_version: expectedVersion,
        p_mode: mode,
        p_provider_id: providerId,
        p_reason_code: reasonCode,
      })
    },
  }
}
