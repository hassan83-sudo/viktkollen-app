import { setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { requireBillingAdmin } from '../../_shared/billing/admin.js'
import { readSumUpConfig } from '../../_shared/billing/providers/sumup.js'

export const SUMUP_SANDBOX_VERIFY_BRANCH = 'test/sumup-sandbox-verify-20261024'
const SUMUP_API = 'https://api.sumup.com'

export function sumupSandboxVerifyAvailable(env = process.env) {
  return env.VERCEL_ENV === 'preview'
    && env.VERCEL_GIT_COMMIT_REF === SUMUP_SANDBOX_VERIFY_BRANCH
    && env.SUMUP_RENEWAL_STAGING_ENABLED !== 'true'
}

function statusFor(code) {
  if (code === 'SANDBOX_IDENTITY_VERIFIED') return 200
  if (code === 'NOT_AVAILABLE') return 404
  if (code === 'SANDBOX_NOT_CONFIGURED' || code === 'SANDBOX_IDENTITY_UNAVAILABLE') return 503
  if (code === 'SANDBOX_KEY_REJECTED' || code === 'SANDBOX_NOT_CONFIRMED') return 403
  return 403
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function readSumUpSandboxStatus({ apiKey, merchantCode, fetchImpl = globalThis.fetch } = {}) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}` }
  let me
  let merchant
  try {
    me = await fetchImpl(`${SUMUP_API}/v0.1/me`, { headers, method: 'GET', redirect: 'manual' })
    merchant = await fetchImpl(`${SUMUP_API}/v1/merchants/${encodeURIComponent(merchantCode)}`, { headers, method: 'GET', redirect: 'manual' })
  } catch {
    return 'SANDBOX_IDENTITY_UNAVAILABLE'
  }
  if (me.status === 401 || merchant.status === 401) return 'SANDBOX_KEY_REJECTED'
  if (!me.ok || !merchant.ok || me.status !== 200 || merchant.status !== 200) return 'SANDBOX_IDENTITY_UNAVAILABLE'
  const meBody = await readJson(me)
  const merchantBody = await readJson(merchant)
  const meCode = meBody?.merchant_profile?.merchant_code || meBody?.merchant_code
  if (meCode !== merchantCode || merchantBody?.merchant_code !== merchantCode || merchantBody?.sandbox !== true) {
    return 'SANDBOX_NOT_CONFIRMED'
  }
  return 'SANDBOX_IDENTITY_VERIFIED'
}

export default async function handler(request, response) {
  setNoStoreHeaders(response)
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ ok: false, code: 'NOT_AVAILABLE' })
  }
  if (!sumupSandboxVerifyAvailable()) {
    return response.status(404).json({ ok: false, code: 'NOT_AVAILABLE' })
  }
  const admin = await requireBillingAdmin(request)
  if (!admin.ok) {
    return response.status(admin.status).json({ ok: false, code: admin.error?.code || 'FORBIDDEN' })
  }
  const config = readSumUpConfig(process.env)
  if (!config) return response.status(503).json({ ok: false, code: 'SANDBOX_NOT_CONFIGURED' })
  const code = await readSumUpSandboxStatus({ apiKey: config.apiKey, merchantCode: config.merchantCode })
  return response.status(statusFor(code)).json({ ok: code === 'SANDBOX_IDENTITY_VERIFIED', code })
}
