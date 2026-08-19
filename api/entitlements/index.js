import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { mapEntitlementRowToSnapshot } from '../_shared/entitlementMapper.js'
import { createSupabaseAdminClient } from '../_shared/supabaseServer.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

const entitlementColumns = [
  'user_id',
  'plan',
  'status',
  'provider',
  'provider_customer_id',
  'provider_subscription_id',
  'current_period_start',
  'current_period_end',
  'cancel_at_period_end',
  'updated_at',
].join(',')

async function fetchEntitlementRow(client, userId) {
  if (!client) {
    return {
      row: null,
      verification: 'admin_client_unconfigured',
    }
  }

  const { data, error } = await client
    .from('user_entitlements')
    .select(entitlementColumns)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return {
      row: null,
      verification: 'read_failed_safe_free',
    }
  }

  return {
    row: data || null,
    verification: data ? 'server_verified' : 'missing_row_default_free',
  }
}

export default async function handler(request, response) {
  const requestId = `ent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast GET stöds.',
      status: 405,
    })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  const result = await fetchEntitlementRow(createSupabaseAdminClient(), auth.user.id)
  const entitlement = mapEntitlementRowToSnapshot(result.row, {
    source: 'server-verified',
    userId: auth.user.id,
  })

  return response.status(200).json({
    entitlement,
    ok: true,
    requestId,
    verification: result.verification,
  })
}

export const entitlementRouteInternals = {
  fetchEntitlementRow,
}
