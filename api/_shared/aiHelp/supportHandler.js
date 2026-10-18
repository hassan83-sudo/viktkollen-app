import { setNoStoreHeaders } from '../aiRouteErrors.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { requireBillingAdmin } from '../billing/admin.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { SECURITY_EVENT_TYPES } from '../../../src/services/security/securityEvents.js'
import { queueSecurityEvent } from '../security/securityEventStore.js'

// The customer view lists only the user's own tickets, so replying to a ticket
// the database cannot find for this user means another user's (or a guessed)
// ticket id. Admin NOT_FOUND is an ordinary stale view and is not recorded.
function noteSupportDenial({ action, code, isAdmin }) {
  let type = null
  if (code === 'RATE_LIMITED') type = SECURITY_EVENT_TYPES.API_RATE_LIMITED
  else if (!isAdmin && code === 'PAID_SUPPORT_REQUIRED') type = SECURITY_EVENT_TYPES.PREMIUM_ACCESS_DENIED
  else if (!isAdmin && action === 'reply' && code === 'NOT_FOUND') type = SECURITY_EVENT_TYPES.CROSS_USER_ACCESS_DENIED
  if (type) queueSecurityEvent({ feature: isAdmin ? 'support-admin' : 'support', type })
}

// Reuses the existing AI dispatcher and billing-admin authority; never accepts identity or plan claims.
export default async function supportHandler(request, response) {
  setNoStoreHeaders(response)
  const fail = (status, code) => response.status(status).json({ ok: false, error: { code } })
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST')
    return fail(405, 'INVALID_REQUEST')
  }
  const isAdmin = request.query?.resource === 'admin' || new URL(String(request.url || '/'), 'http://local').searchParams.get('resource') === 'admin'
  const auth = await (isAdmin ? requireBillingAdmin(request, { securityFeature: 'support-admin' }) : verifySupabaseUser(request)).catch(() => null)
  if (!auth) return fail(503, 'AUTH_UNAVAILABLE')
  if (!(isAdmin ? auth.ok : auth.authenticated)) return fail(auth.status || 401, auth.error?.code || 'AUTH_REQUIRED')
  let body = {}
  try {
    if (request.method === 'POST') {
      const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {})
      if (raw.length > 6000) return fail(413, 'REQUEST_TOO_LARGE')
      body = JSON.parse(raw)
      if (!body || Array.isArray(body) || typeof body !== 'object') return fail(400, 'INVALID_REQUEST')
    }
  } catch { return fail(400, 'INVALID_REQUEST') }
  const action = request.method === 'GET' ? 'list' : body.action
  if (!(isAdmin ? ['list', 'update', 'reply'] : ['list', 'create', 'reply']).includes(action)) return fail(400, 'INVALID_REQUEST')
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (['create', 'reply'].includes(action) && (!message || message.length > 2000)) return fail(400, 'INVALID_REQUEST')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (['update', 'reply'].includes(action) && !uuid.test(body.ticketId || '')) return fail(400, 'INVALID_REQUEST')
  if (['update', 'reply'].includes(action) && (!Number.isInteger(body.version) || body.version < 1)) return fail(400, 'INVALID_REQUEST')
  if (action === 'create' && !uuid.test(body.requestId || '')) return fail(400, 'INVALID_REQUEST')
  const command = {
    category: ['billing', 'technical', 'account', 'other'].includes(body.category) ? body.category : 'other',
    message, requestId: body.requestId, ticketId: body.ticketId,
    priority: body.priority, status: body.status, version: body.version,
  }
  try {
    const client = createSupabaseAdminClient()
    if (!client) return fail(503, 'SUPPORT_UNAVAILABLE')
    const { data, error } = await client.schema('support').rpc(isAdmin ? 'admin_command' : 'customer_command', {
      p_actor: auth.user.id, p_action: action, p_body: command,
    })
    if (error || !data) return fail(503, 'SUPPORT_UNAVAILABLE')
    if (!data.ok) noteSupportDenial({ action, code: data.code, isAdmin })
    if (!data.ok) return fail(({ PAID_SUPPORT_REQUIRED: 403, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429 })[data.code] || 400, data.code || 'INVALID_REQUEST')
    return response.status(action === 'create' ? 201 : 200).json(data)
  } catch { return fail(503, 'SUPPORT_UNAVAILABLE') }
}
