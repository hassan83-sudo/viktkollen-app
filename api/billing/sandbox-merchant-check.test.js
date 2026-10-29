import { afterEach, describe, expect, it } from 'vitest'
import handler from './sandbox-merchant-check.js'
import { setBillingAdminServiceForTests } from '../_shared/billing/admin.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const BRANCH = 'feature/sumup-hosted-4sek-one-time'
const PREVIEW = 'https://viktkollen-app-git-feature-sumup-705353-appsonthego-s-projects.vercel.app'
const KEY = 'sandbox-test-key'

function previewEnv(overrides = {}) {
  return {
    BILLING_PUBLIC_BASE_URL: PREVIEW,
    BILLING_SUMUP_LIVE_ENABLED: '',
    SUMUP_API_KEY: KEY,
    SUMUP_MERCHANT_CODE: 'M8JNKD73',
    SUPABASE_URL: 'https://armtslzspuebmlysnooq.supabase.co',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: BRANCH,
    VITE_SUPABASE_URL: 'https://armtslzspuebmlysnooq.supabase.co',
    ...overrides,
  }
}

function createResponse() {
  const response = {
    body: null,
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader() {},
    status(statusCode) {
      response.statusCode = statusCode
      return response
    },
  }
  return response
}

function fetchSpy() {
  const calls = []
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ method: init?.method, url })
      return {
        json: async () => ({ merchant_code: 'M8JNKD73', sandbox: true, secret: KEY }),
        status: 200,
      }
    },
  }
}

async function call({ env = previewEnv(), fetch = fetchSpy(), token = 'valid-token', userId = ADMIN, admin = true } = {}) {
  setSupabaseAuthVerifierForTests(async () => ({ user: { id: userId } }))
  setBillingAdminServiceForTests({
    hasBillingAdmin: async (id) => admin === true && id === ADMIN,
  })
  const response = createResponse()
  await handler({
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method: 'GET',
    url: '/api/billing/sandbox-merchant-check',
  }, response, { env, fetchImpl: fetch.impl })
  return { calls: fetch.calls, response }
}

describe('sandbox merchant diagnostic', () => {
  afterEach(() => {
    setSupabaseAuthVerifierForTests(null)
    setBillingAdminServiceForTests(null)
  })

  it('refuses the wrong environment before SumUp', async () => {
    const { calls, response } = await call({ env: previewEnv({ VERCEL_ENV: 'development' }) })
    expect(response.statusCode).toBe(404)
    expect(response.body).toEqual({ code: 'ENV_NOT_PREVIEW', ok: false })
    expect(calls).toEqual([])
  })

  it('refuses the wrong git branch before SumUp', async () => {
    const { calls, response } = await call({ env: previewEnv({ VERCEL_GIT_COMMIT_REF: 'main' }) })
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ code: 'GIT_BRANCH_MISMATCH', ok: false })
    expect(calls).toEqual([])
  })

  it('refuses the wrong Supabase project before SumUp', async () => {
    const { calls, response } = await call({
      env: previewEnv({
        SUPABASE_URL: 'https://bxmdlckrlwzdtcxnsqqr.supabase.co',
        VITE_SUPABASE_URL: 'https://bxmdlckrlwzdtcxnsqqr.supabase.co',
      }),
    })
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ code: 'SUPABASE_NOT_STAGING', ok: false })
    expect(calls).toEqual([])
  })

  it('refuses the wrong merchant id before SumUp', async () => {
    const { calls, response } = await call({ env: previewEnv({ SUMUP_MERCHANT_CODE: 'MB8SGFBR' }) })
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ code: 'MERCHANT_NOT_SANDBOX', ok: false })
    expect(calls).toEqual([])
  })

  it('refuses an enabled live flag before SumUp', async () => {
    const { calls, response } = await call({ env: previewEnv({ BILLING_SUMUP_LIVE_ENABLED: 'true' }) })
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ code: 'LIVE_FLAG_ON', ok: false })
    expect(calls).toEqual([])
  })

  it('refuses a missing api key before SumUp', async () => {
    const missing = await call({ env: previewEnv({ SUMUP_API_KEY: '' }) })
    expect(missing.response.statusCode).toBe(403)
    expect(missing.response.body).toEqual({ code: 'KEY_UNREADABLE', ok: false })
    expect(missing.calls).toEqual([])

    const placeholder = await call({ env: previewEnv({ SUMUP_API_KEY: '[SENSITIVE]' }) })
    expect(placeholder.response.body).toEqual({ code: 'KEY_UNREADABLE', ok: false })
    expect(placeholder.calls).toEqual([])
  })

  it('refuses a user who is not billing admin before SumUp', async () => {
    const { calls, response } = await call({ admin: false, userId: OTHER })
    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ code: 'FORBIDDEN', ok: false })
    expect(calls).toEqual([])
  })

  it('reports an unusable SumUp response without the payload', async () => {
    const fetch = fetchSpy()
    fetch.impl = async (url, init) => {
      fetch.calls.push({ method: init?.method, url })
      return { json: async () => { throw new Error('invalid json') }, status: 200 }
    }
    const { calls, response } = await call({ fetch })
    expect(calls).toEqual([{
      method: 'GET',
      url: 'https://api.sumup.com/v1/merchants/M8JNKD73',
    }])
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      httpStatus: 200,
      merchant: 'MISMATCH',
      sandbox: 'SANDBOX_UNSPECIFIED',
    })
  })

  it('reports a verified sandbox merchant without secrets', async () => {
    const { calls, response } = await call()
    expect(calls).toEqual([{
      method: 'GET',
      url: 'https://api.sumup.com/v1/merchants/M8JNKD73',
    }])
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      httpStatus: 200,
      merchant: 'MATCH',
      sandbox: 'SANDBOX_TRUE',
    })
    expect(JSON.stringify(response.body).includes(KEY)).toBe(false)
  })

  it('refuses production before SumUp', async () => {
    const { calls, response } = await call({ env: previewEnv({ VERCEL_ENV: 'production' }) })
    expect(response.statusCode).toBe(404)
    expect(response.body).toEqual({ code: 'PRODUCTION_REFUSED', ok: false })
    expect(calls).toEqual([])
  })
})
