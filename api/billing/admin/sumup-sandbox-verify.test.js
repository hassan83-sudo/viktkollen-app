import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { readSumUpSandboxStatus, sumupSandboxVerifyAvailable } from './sumup-sandbox-verify.js'
import { setBillingAdminControlsForTests, setBillingAdminServiceForTests } from '../../_shared/billing/admin.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const KEY = 'sandbox-key-not-for-logs'
const MERCHANT = 'MTEST01'

function responseDouble() {
  const headers = {}
  return {
    headers,
    body: null,
    statusCode: null,
    setHeader(name, value) { headers[name] = value },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function jsonResult(body, status = 200) {
  return { ok: status === 200, status, json: async () => body }
}

function previewEnv() {
  return {
    SUMUP_API_KEY: KEY,
    SUMUP_MERCHANT_CODE: MERCHANT,
    SUMUP_RENEWAL_STAGING_ENABLED: undefined,
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'test/sumup-sandbox-verify-20261024',
  }
}

describe('temporary SumUp sandbox verification', () => {
  afterEach(() => {
    setSupabaseAuthVerifierForTests(null)
    setBillingAdminControlsForTests(undefined)
    setBillingAdminServiceForTests(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays closed outside the isolated preview branch', () => {
    expect(sumupSandboxVerifyAvailable({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'test/sumup-sandbox-verify-20261024' })).toBe(false)
    expect(sumupSandboxVerifyAvailable({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'fix/sumup-recurring-production-wiring' })).toBe(false)
    expect(sumupSandboxVerifyAvailable({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'main', SUMUP_RENEWAL_STAGING_ENABLED: 'true' })).toBe(false)
  })

  it('rejects an unauthenticated caller before any provider call', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const previous = { ...process.env }
    Object.assign(process.env, previewEnv())
    const response = responseDouble()
    await handler({ headers: {}, method: 'GET' }, response)
    Object.assign(process.env, previous)
    expect(response.statusCode).toBe(401)
    expect(response.body).toEqual({ ok: false, code: 'AUTH_REQUIRED' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an authenticated non-admin', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: ADMIN_ID } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => false })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const previous = { ...process.env }
    Object.assign(process.env, previewEnv())
    const response = responseDouble()
    await handler({ headers: { authorization: 'Bearer session' }, method: 'GET' }, response)
    Object.assign(process.env, previous)
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ ok: false, code: 'FORBIDDEN' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns only a verified status for an unambiguous sandbox merchant', async () => {
    const code = await readSumUpSandboxStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: vi.fn(async (url) => {
        if (String(url).endsWith('/v0.1/me')) {
          return jsonResult({ merchant_profile: { merchant_code: MERCHANT, email: 'owner@example.com' } })
        }
        return jsonResult({ company_name: 'Private', merchant_code: MERCHANT, sandbox: true })
      }),
    })
    expect(code).toBe('SANDBOX_IDENTITY_VERIFIED')
  })

  it('aborts when the account is not unambiguously sandbox or the merchant differs', async () => {
    await expect(readSumUpSandboxStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: async (url) => String(url).endsWith('/v0.1/me')
        ? jsonResult({ merchant_profile: { merchant_code: MERCHANT } })
        : jsonResult({ merchant_code: MERCHANT, sandbox: false }),
    })).resolves.toBe('SANDBOX_NOT_CONFIRMED')
    await expect(readSumUpSandboxStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: async () => jsonResult({ merchant_code: 'MOTHER1', sandbox: true }),
    })).resolves.toBe('SANDBOX_NOT_CONFIRMED')
  })

  it('does not return secrets or personal data from the admin response', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: ADMIN_ID, email: 'owner@example.com' } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('supabase')) return jsonResult({ user: { id: ADMIN_ID } })
      if (String(url).endsWith('/v0.1/me')) return jsonResult({ merchant_profile: { merchant_code: MERCHANT, email: 'owner@example.com' } })
      return jsonResult({ company_name: 'Private', merchant_code: MERCHANT, sandbox: true })
    }))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const previous = { ...process.env }
    Object.assign(process.env, previewEnv())
    const response = responseDouble()
    await handler({ headers: { authorization: 'Bearer session' }, method: 'GET' }, response)
    Object.assign(process.env, previous)
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ ok: true, code: 'SANDBOX_IDENTITY_VERIFIED' })
    expect(JSON.stringify(response.body)).not.toMatch(/sandbox-key-not-for-logs|owner@example.com|Private|MTEST01/)
    expect(error).not.toHaveBeenCalled()
  })
})
