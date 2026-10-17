import { requireBillingAdmin } from '../_shared/billing/admin.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { createSupabaseAdminClient } from '../_shared/supabaseServer.js'

export default async function handler(request, response) {
  const requestId = 'security-center-' + Date.now().toString(36)
  setNoStoreHeaders(response)
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendSafeAiError(response, { code: aiRouteErrorCodes.INVALID_REQUEST, requestId, status: 405 })
  }
  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) {
    return sendSafeAiError(response, { code: admin.error?.code || aiRouteErrorCodes.AUTH_REQUIRED, requestId, status: admin.status || 401 })
  }
  const client = createSupabaseAdminClient()
  if (!client) return response.status(503).json({ ok: false, error: { code: 'SECURITY_STORE_UNAVAILABLE' }, requestId })
  try {
    const { data, error } = await client.rpc('security_center_recent_events', { p_limit: 50 })
    if (error) throw error
    return response.status(200).json({ ok: true, events: Array.isArray(data) ? data : [], requestId })
  } catch {
    return response.status(503).json({ ok: false, error: { code: 'SECURITY_STORE_UNAVAILABLE' }, requestId })
  }
}
