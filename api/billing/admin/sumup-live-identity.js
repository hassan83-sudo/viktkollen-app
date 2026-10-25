import { setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { requireBillingAdmin } from '../../_shared/billing/admin.js'
import { readSumUpConfig } from '../../_shared/billing/providers/sumup.js'

export const SUMUP_LIVE_IDENTITY_REF = 'chore/sumup-live-identity-20261025'
const SUMUP_API = 'https://api.sumup.com'

/**
 * Temporary read-only Production check. It stays closed on every other
 * branch, including main, and makes no checkout or payment request.
 * Remove this route after the live identity result is recorded.
 */
export function sumupLiveIdentityAvailable(env = process.env) {
  return env.VERCEL_ENV === 'production'
    && env.VERCEL_GIT_COMMIT_REF === SUMUP_LIVE_IDENTITY_REF
}

function statusFor(code) {
  if (code === 'LIVE_IDENTITY_VERIFIED') return 200
  if (code === 'NOT_AVAILABLE') return 404
  if (code === 'NOT_CONFIGURED' || code === 'IDENTITY_UNAVAILABLE') return 503
  return 403
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function readSumUpLiveStatus({ apiKey, merchantCode, fetchImpl = globalThis.fetch } = {}) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}` }
  let me
  let merchant
  try {
    me = await fetchImpl(`${SUMUP_API}/v0.1/me`, { headers, method: 'GET', redirect: 'manual' })
    merchant = await fetchImpl(`${SUMUP_API}/v1/merchants/${encodeURIComponent(merchantCode)}`, {
      headers,
      method: 'GET',
      redirect: 'manual',
    })
  } catch {
    return 'IDENTITY_UNAVAILABLE'
  }
  if (me?.status === 401 || merchant?.status === 401) return 'KEY_REJECTED'
  if (!me?.ok || !merchant?.ok || me.status !== 200 || merchant.status !== 200) return 'IDENTITY_UNAVAILABLE'
  const meBody = await readJson(me)
  const merchantBody = await readJson(merchant)
  const meCode = meBody?.merchant_profile?.merchant_code || meBody?.merchant_code
  if (meCode !== merchantCode || merchantBody?.merchant_code !== merchantCode) return 'MERCHANT_MISMATCH'
  if (merchantBody?.sandbox !== false) return 'NOT_LIVE'
  return 'LIVE_IDENTITY_VERIFIED'
}

export default async function handler(request, response) {
  setNoStoreHeaders(response)
  if (!sumupLiveIdentityAvailable()) {
    return response.status(404).json({ ok: false, code: 'NOT_AVAILABLE' })
  }
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ ok: false, code: 'NOT_AVAILABLE' })
  }
  const admin = await requireBillingAdmin(request)
  if (!admin.ok) {
    return response.status(admin.status).json({ ok: false, code: admin.error?.code || 'FORBIDDEN' })
  }
  const config = readSumUpConfig(process.env)
  if (!config) return response.status(503).json({ ok: false, code: 'NOT_CONFIGURED' })
  const code = await readSumUpLiveStatus({ apiKey: config.apiKey, merchantCode: config.merchantCode })
  return response.status(statusFor(code)).json({ ok: code === 'LIVE_IDENTITY_VERIFIED', code })
}
