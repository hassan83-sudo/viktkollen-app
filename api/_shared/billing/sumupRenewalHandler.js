import { timingSafeEqual } from 'node:crypto'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { requireBillingAdmin } from './admin.js'
import { runDueSumUpRenewal, runScheduledDueSumUpRenewals } from './sumupRenewalRun.js'

function readAuthorization(request) {
  const headers = request?.headers || {}
  return String(headers.authorization || headers.Authorization || '')
}

/**
 * Scheduler auth only. Requires CRON_SECRET and a matching Bearer header.
 * Never accepts a user JWT as the cron secret.
 */
export function authorizeSumUpRenewalCron(request, env = process.env) {
  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : ''
  if (!secret || secret.length < 16) return false
  const header = readAuthorization(request)
  const expected = `Bearer ${secret}`
  if (header.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function handleSumUpRenewal(request, response, {
  env = process.env,
  runManual = runDueSumUpRenewal,
  runScheduled = runScheduledDueSumUpRenewals,
} = {}) {
  const requestId = `bill-sumup-renewal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  void request.body?.amount
  void request.body?.current_period_end
  void request.body?.plan_id
  void request.body?.subscription_id
  void request.body?.user_id

  const cronAuthorized = authorizeSumUpRenewalCron(request, env)
  if (cronAuthorized) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST')
      return sendSafeAiError(response, {
        code: aiRouteErrorCodes.INVALID_REQUEST,
        requestId,
        safeMessage: 'Endast GET och POST stöds.',
        status: 405,
      })
    }
    const result = await runScheduled({ env })
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
      scheduled: true,
    })
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
      status: 405,
    })
  }

  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) {
    return response.status(admin.status).json({
      accessGranted: false,
      error: admin.error,
      ok: false,
      requestId,
    })
  }
  const result = await runManual({ env, userId: admin.user.id })
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
