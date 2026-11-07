import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { requireBillingAdmin } from '../../_shared/billing/admin.js'
import { runDueSumUpRenewal } from '../../_shared/billing/sumupRenewalRun.js'

export default async function handler(request, response) {
  const requestId = `bill-sumup-renewal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
      status: 405,
    })
  }
  void request.body?.amount
  void request.body?.current_period_end
  void request.body?.plan_id
  void request.body?.subscription_id
  void request.body?.user_id
  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) {
    return response.status(admin.status).json({
      accessGranted: false,
      error: admin.error,
      ok: false,
      requestId,
    })
  }
  const result = await runDueSumUpRenewal({ userId: admin.user.id })
  if (!result.ok) {
    return response.status(result.status).json({
      accessGranted: false,
      error: { code: result.code },
      ok: false,
      requestId,
    })
  }
  return response.status(200).json({
    accessGranted: false,
    considered: result.considered,
    ok: true,
    requestId,
    results: result.results,
  })
}
