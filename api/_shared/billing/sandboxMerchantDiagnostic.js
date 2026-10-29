import { stagingSupabaseReady } from './sumupOneTimeCheckout.js'

export const SANDBOX_DIAGNOSTIC_BRANCH = 'feature/sumup-hosted-4sek-one-time'
export const SANDBOX_MERCHANT_CODE = 'M8JNKD73'

const PRODUCTION_APP_HOSTS = new Set([
  'viktkollen-app.vercel.app',
  'viktkollen-app-appsonthego-s-projects.vercel.app',
  'viktkollen-app-git-main-appsonthego-s-projects.vercel.app',
])

export function approvedSandboxPreviewBase(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return false
  let base
  try {
    base = new URL(raw)
  } catch {
    return false
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return false
  if (base.pathname !== '/' && base.pathname !== '') return false
  const host = base.hostname.toLowerCase()
  if (PRODUCTION_APP_HOSTS.has(host)) return false
  if (!host.startsWith('viktkollen-app-') || !host.endsWith('-appsonthego-s-projects.vercel.app')) return false
  if (host.includes('git-main')) return false
  return true
}

function keyReadable(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 4096) return false
  if (/\s/.test(value) || value.includes('SENSITIVE') || value.includes('[') || value.includes(']')) return false
  return true
}

/** Every refusal here happens before the SumUp merchant request. */
export function assessSandboxMerchantDiagnostic(env = {}) {
  if (env.VERCEL_ENV === 'production') return { ok: false, code: 'PRODUCTION_REFUSED' }
  if (env.VERCEL_ENV !== 'preview') return { ok: false, code: 'ENV_NOT_PREVIEW' }
  if (env.VERCEL_GIT_COMMIT_REF !== SANDBOX_DIAGNOSTIC_BRANCH) return { ok: false, code: 'GIT_BRANCH_MISMATCH' }
  if (!stagingSupabaseReady(env)) return { ok: false, code: 'SUPABASE_NOT_STAGING' }
  const merchant = typeof env.SUMUP_MERCHANT_CODE === 'string' ? env.SUMUP_MERCHANT_CODE.trim() : ''
  if (merchant !== SANDBOX_MERCHANT_CODE) return { ok: false, code: 'MERCHANT_NOT_SANDBOX' }
  if (env.BILLING_SUMUP_LIVE_ENABLED === 'true') return { ok: false, code: 'LIVE_FLAG_ON' }
  if (!approvedSandboxPreviewBase(env.BILLING_PUBLIC_BASE_URL)) return { ok: false, code: 'PUBLIC_HOST_NOT_PREVIEW' }
  if (!keyReadable(env.SUMUP_API_KEY)) return { ok: false, code: 'KEY_UNREADABLE' }
  return { ok: true }
}

export async function readSandboxMerchantDiagnostic(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const gate = assessSandboxMerchantDiagnostic(env)
  if (!gate.ok) return { called: false, code: gate.code, ok: false }

  const key = env.SUMUP_API_KEY
  let response
  try {
    response = await fetchImpl(`https://api.sumup.com/v1/merchants/${SANDBOX_MERCHANT_CODE}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      method: 'GET',
      redirect: 'manual',
    })
  } catch {
    return {
      called: true,
      httpStatus: 0,
      merchant: 'MISMATCH',
      ok: false,
      sandbox: 'SANDBOX_UNSPECIFIED',
    }
  }

  const httpStatus = Number(response?.status) || 0
  let merchant = 'MISMATCH'
  let sandbox = 'SANDBOX_UNSPECIFIED'
  if (httpStatus === 200 && typeof response.json === 'function') {
    try {
      const body = await response.json()
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        merchant = body.merchant_code === SANDBOX_MERCHANT_CODE ? 'MATCH' : 'MISMATCH'
        if (body.sandbox === true) sandbox = 'SANDBOX_TRUE'
        else if (body.sandbox === false) sandbox = 'SANDBOX_FALSE'
      }
    } catch {
      merchant = 'MISMATCH'
      sandbox = 'SANDBOX_UNSPECIFIED'
    }
  }

  return {
    called: true,
    httpStatus,
    merchant,
    ok: httpStatus === 200 && merchant === 'MATCH' && sandbox === 'SANDBOX_TRUE',
    sandbox,
  }
}
