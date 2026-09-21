import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { getServerSubscription } from '../../_shared/billing/subscription.js'
import { verifySupabaseUser } from '../../_shared/verifySupabaseUser.js'

export default async function handler(request, response) {
  const requestId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

  const queryUser = typeof request.query?.user_id === 'string' ? request.query.user_id : ''
  if (queryUser && queryUser !== auth.user.id) {
    return response.status(403).json({
      error: { code: 'FORBIDDEN_USER' },
      ok: false,
      requestId,
    })
  }

  const subscription = await getServerSubscription({ user: auth.user })
  return response.status(200).json({
    ok: true,
    requestId,
    subscription,
  })
}
