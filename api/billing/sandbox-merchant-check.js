import { setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { requireBillingAdmin } from '../_shared/billing/admin.js'
import { readSandboxMerchantDiagnostic } from '../_shared/billing/sandboxMerchantDiagnostic.js'

const HIDDEN = new Set(['ENV_NOT_PREVIEW', 'PRODUCTION_REFUSED'])

export default async function handler(request, response, { env = process.env, fetchImpl } = {}) {
  setNoStoreHeaders(response)
  if (request?.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ code: 'GET_REQUIRED', ok: false })
  }

  const admin = await requireBillingAdmin(request, { requestId: 'sandbox-merchant-check' })
  if (!admin.ok) {
    return response.status(admin.status || 401).json({
      code: admin.status === 403 ? 'FORBIDDEN' : 'AUTH_REQUIRED',
      ok: false,
    })
  }

  const result = await readSandboxMerchantDiagnostic(env, { fetchImpl })
  if (!result.called) {
    return response.status(HIDDEN.has(result.code) ? 404 : 403).json({
      code: result.code,
      ok: false,
    })
  }

  return response.status(200).json({
    httpStatus: result.httpStatus,
    merchant: result.merchant,
    sandbox: result.sandbox,
  })
}
