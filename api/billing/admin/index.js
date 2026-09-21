import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import {
  getBillingAdminService,
  requireBillingAdmin,
  toClientSafeAdminSession,
} from '../../_shared/billing/admin.js'
import { ADMIN_AUDIT_REASONS } from '../../../src/services/billing/catalog.js'

function readBody(request) {
  if (!request.body) return {}
  if (typeof request.body === 'object') return request.body
  try {
    return JSON.parse(request.body)
  } catch {
    return {}
  }
}

export default async function handler(request, response) {
  const requestId = `bill-admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast GET och POST stöds.',
      status: 405,
    })
  }

  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) {
    return response.status(admin.status).json({
      error: admin.error,
      ok: false,
      requestId,
    })
  }

  if (request.method === 'GET') {
    return response.status(200).json({
      ok: true,
      requestId,
      session: toClientSafeAdminSession(admin),
    })
  }

  const body = readBody(request)
  const action = String(body.action || '').trim()
  const targetUserId = String(body.target_user_id || '').trim()
  const reasonCode = ADMIN_AUDIT_REASONS.includes(body.reason_code) ? body.reason_code : 'MANUAL_ADMIN'
  void request.query
  void body.admin_user_id
  void body.isAdmin
  void body.role
  void body.billing_admin

  const service = getBillingAdminService()
  try {
    if (action === 'grant') {
      const result = await service.grant({
        actorUserId: admin.user.id,
        clientClaim: body,
        reasonCode,
        targetUserId,
      })
      return response.status(200).json({
        ok: true,
        permission: result.permission.status,
        requestId,
      })
    }
    if (action === 'revoke') {
      const result = await service.revoke({
        actorUserId: admin.user.id,
        clientClaim: body,
        reasonCode: reasonCode === 'MANUAL_ADMIN' ? 'SECURITY' : reasonCode,
        targetUserId,
      })
      return response.status(200).json({
        ok: true,
        permission: result.permission.status,
        requestId,
      })
    }
  } catch {
    return response.status(400).json({
      error: { code: 'INVALID_ADMIN_REQUEST' },
      ok: false,
      requestId,
    })
  }

  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.INVALID_REQUEST,
    requestId,
    safeMessage: 'Ogiltig adminåtgärd.',
    status: 400,
  })
}
