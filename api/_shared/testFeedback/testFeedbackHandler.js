import { setNoStoreHeaders } from '../aiRouteErrors.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { requireBillingAdmin } from '../billing/admin.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import {
  CATEGORY_IDS,
  FEATURE_IDS,
  RATING_IDS,
  STATUS_IDS,
  TEST_FEEDBACK_ADMIN_NOTE_MAX,
  TEST_FEEDBACK_COMMENT_MAX,
} from '../../../src/features/testFeedback/testFeedbackOptions.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ERROR_STATUS = { CONFLICT: 409, FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMITED: 429 }

function isAdminRequest(request) {
  if (request.query?.resource === 'admin') return true
  return new URL(String(request.url || '/'), 'http://local').searchParams.get('resource') === 'admin'
}

// Testfeedback. Användar-ID kommer alltid från den verifierade sessionen och
// adminrätt från billing-admin; klienten kan inte ange någon av dem.
export function buildCustomerCommand(body) {
  const features = Array.isArray(body.features) ? [...new Set(body.features)] : []
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  const rating = body.rating == null || body.rating === '' ? null : body.rating
  if (!UUID.test(body.requestId || '')) return null
  if (features.length < 1 || features.length > FEATURE_IDS.size || !features.every((id) => FEATURE_IDS.has(id))) return null
  if (!CATEGORY_IDS.has(body.category)) return null
  if (rating !== null && !RATING_IDS.has(rating)) return null
  if (comment.length > TEST_FEEDBACK_COMMENT_MAX) return null
  return {
    appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 40) : '',
    category: body.category,
    comment,
    features,
    rating,
    requestId: body.requestId,
  }
}

export function buildAdminCommand(body) {
  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim() : ''
  if (!UUID.test(body.reportId || '')) return null
  if (!STATUS_IDS.has(body.status)) return null
  if (!Number.isInteger(body.version) || body.version < 1) return null
  if (adminNote.length > TEST_FEEDBACK_ADMIN_NOTE_MAX) return null
  return { adminNote, reportId: body.reportId, status: body.status, version: body.version }
}

export default async function testFeedbackHandler(request, response, {
  createClient = createSupabaseAdminClient,
  requireAdmin = requireBillingAdmin,
  verifyUser = verifySupabaseUser,
} = {}) {
  setNoStoreHeaders(response)
  const fail = (status, code) => response.status(status).json({ ok: false, error: { code } })
  const isAdmin = isAdminRequest(request)
  const allowed = isAdmin ? ['GET', 'POST'] : ['POST']
  if (!allowed.includes(request.method)) {
    response.setHeader('Allow', allowed.join(', '))
    return fail(405, 'INVALID_REQUEST')
  }
  const auth = await (isAdmin ? requireAdmin(request) : verifyUser(request)).catch(() => null)
  if (!auth) return fail(503, 'AUTH_UNAVAILABLE')
  if (!(isAdmin ? auth.ok : auth.authenticated)) return fail(auth.status || 401, auth.error?.code || 'AUTH_REQUIRED')

  let body = {}
  if (request.method === 'POST') {
    try {
      const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {})
      if (raw.length > 12000) return fail(413, 'REQUEST_TOO_LARGE')
      body = JSON.parse(raw)
    } catch {
      return fail(400, 'INVALID_REQUEST')
    }
    if (!body || Array.isArray(body) || typeof body !== 'object') return fail(400, 'INVALID_REQUEST')
  }

  const action = request.method === 'GET' ? 'list' : (isAdmin ? 'update' : 'create')
  const command = action === 'list' ? {} : (isAdmin ? buildAdminCommand(body) : buildCustomerCommand(body))
  if (!command) return fail(400, 'INVALID_REQUEST')

  try {
    const client = createClient()
    if (!client) return fail(503, 'FEEDBACK_UNAVAILABLE')
    const { data, error } = await client.rpc(isAdmin ? 'test_feedback_admin_command' : 'test_feedback_customer_command', {
      p_action: action,
      p_actor: auth.user.id,
      p_body: command,
    })
    if (error || !data) return fail(503, 'FEEDBACK_UNAVAILABLE')
    if (!data.ok) return fail(ERROR_STATUS[data.code] || 400, data.code || 'INVALID_REQUEST')
    return response.status(action === 'create' && !data.duplicate ? 201 : 200).json(data)
  } catch {
    return fail(503, 'FEEDBACK_UNAVAILABLE')
  }
}
