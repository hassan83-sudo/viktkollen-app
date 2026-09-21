import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { inspectServerQuota } from '../_shared/billing/quota.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

export default async function handler(request, response) {
  const requestId = `quota-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

  const feature = typeof request.query?.feature === 'string' ? request.query.feature : ''
  const unit = typeof request.query?.unit === 'string' ? request.query.unit : undefined
  const quota = await inspectServerQuota({
    feature,
    unit,
    user: auth.user,
  })

  return response.status(200).json({
    ok: true,
    quota,
    requestId,
  })
}
