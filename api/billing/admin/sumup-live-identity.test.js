import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { readSumUpLiveStatus, sumupLiveIdentityAvailable } from './sumup-live-identity.js'
import { setBillingAdminControlsForTests } from '../../_shared/billing/admin.js'
import { setSupabaseAuthVerifierForTests } from '../../_shared/verifySupabaseUser.js'

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const KEY = 'live-key-not-for-logs'
const MERCHANT = 'MLIVE01'

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

function productionEnv() {
  return {
    SUMUP_API_KEY: KEY,
    SUMUP_MERCHANT_CODE: MERCHANT,
    VERCEL_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'chore/sumup-live-identity-20261025',
  }
}

async function withEnv(env, run) {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]))
  for (const [key, value] of Object.entries(env)) {
    if (value == null) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await run()
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('temporary SumUp live identity check', () => {
  afterEach(() => {
    setSupabaseAuthVerifierForTests(null)
    setBillingAdminControlsForTests(undefined)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays closed outside the temporary production branch', () => {
    expect(sumupLiveIdentityAvailable({
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'main',
    })).toBe(false)
    expect(sumupLiveIdentityAvailable({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'chore/sumup-live-identity-20261025',
    })).toBe(false)
    expect(sumupLiveIdentityAvailable({
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'chore/sumup-live-identity-20261025',
    })).toBe(true)
  })

  it('hides the route and makes no provider call when it is unavailable', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = responseDouble()
    await withEnv({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }, () => (
      handler({ headers: { authorization: 'Bearer session' }, method: 'GET' }, response)
    ))
    expect(response.statusCode).toBe(404)
    expect(response.body).toEqual({ ok: false, code: 'NOT_AVAILABLE' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller before any provider call', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = responseDouble()
    await withEnv(productionEnv(), () => handler({ headers: {}, method: 'GET' }, response))
    expect(response.statusCode).toBe(401)
    expect(response.body).toEqual({ ok: false, code: 'AUTH_REQUIRED' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an authenticated non-admin before any provider call', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: ADMIN_ID } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => false })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = responseDouble()
    await withEnv(productionEnv(), () => (
      handler({ headers: { authorization: 'Bearer session' }, method: 'GET' }, response)
    ))
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ ok: false, code: 'FORBIDDEN' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts only two read-only identity requests for a live merchant', async () => {
    const calls = []
    const code = await readSumUpLiveStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: async (url, options) => {
        calls.push({ method: options.method, url: String(url) })
        if (String(url).endsWith('/v0.1/me')) {
          return jsonResult({ merchant_profile: { merchant_code: MERCHANT, email: 'owner@example.com' } })
        }
        return jsonResult({ company_name: 'Private', merchant_code: MERCHANT, sandbox: false })
      },
    })
    expect(code).toBe('LIVE_IDENTITY_VERIFIED')
    expect(calls).toEqual([
      { method: 'GET', url: 'https://api.sumup.com/v0.1/me' },
      { method: 'GET', url: `https://api.sumup.com/v1/merchants/${MERCHANT}` },
    ])
  })

  it('rejects sandbox, a missing live flag, and a different merchant', async () => {
    await expect(readSumUpLiveStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: async (url) => String(url).endsWith('/v0.1/me')
        ? jsonResult({ merchant_profile: { merchant_code: MERCHANT } })
        : jsonResult({ merchant_code: MERCHANT, sandbox: true }),
    })).resolves.toBe('NOT_LIVE')
    await expect(readSumUpLiveStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: async (url) => String(url).endsWith('/v0.1/me')
        ? jsonResult({ merchant_profile: { merchant_code: MERCHANT } })
        : jsonResult({ merchant_code: MERCHANT }),
    })).resolves.toBe('NOT_LIVE')
    await expect(readSumUpLiveStatus({
      apiKey: KEY,
      merchantCode: MERCHANT,
      fetchImpl: async () => jsonResult({ merchant_code: 'MOTHER1', sandbox: false }),
    })).resolves.toBe('MERCHANT_MISMATCH')
  })

  it('returns only pass or fail and never echoes secrets or provider payloads', async () => {
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: ADMIN_ID, email: 'owner@example.com' } }))
    setBillingAdminControlsForTests({ hasBillingAdmin: async () => true })
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('supabase')) return jsonResult({ user: { id: ADMIN_ID } })
      if (String(url).endsWith('/v0.1/me')) {
        return jsonResult({ merchant_profile: { merchant_code: MERCHANT, email: 'owner@example.com' } })
      }
      return jsonResult({ company_name: 'Private', merchant_code: MERCHANT, sandbox: false })
    }))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = responseDouble()
    await withEnv(productionEnv(), () => (
      handler({ headers: { authorization: 'Bearer session' }, method: 'GET' }, response)
    ))
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ ok: true, code: 'LIVE_IDENTITY_VERIFIED' })
    expect(JSON.stringify(response.body)).not.toMatch(/live-key-not-for-logs|owner@example.com|Private|MLIVE01|company_name|merchant_code/)
    expect(error).not.toHaveBeenCalled()
  })

  it('does not contain a checkout or payment call', () => {
    const source = readFileSync(new URL('./sumup-live-identity.js', import.meta.url), 'utf8')
    expect(source).not.toMatch(/checkouts|createCheckout|processCheckout|createCustomer|payment-instruments|method:\s*'POST'|method:\s*'PUT'/i)
  })
})
