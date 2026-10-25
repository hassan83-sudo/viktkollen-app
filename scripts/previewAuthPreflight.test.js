import { describe, expect, it, vi } from 'vitest'
import {
  checkAuthServiceReachable,
  checkPreviewAuthEnvironment,
  checkProtectedPreviewAccess,
  checkStagingTestLogin,
  inspectPreviewClientBundle,
  runPreviewAuthDeploymentPreflight,
} from './previewAuthPreflight.js'

const STAGING = 'armtslzspuebmlysnooq'
const PRODUCTION = 'bxmdlckrlwzdtcxnsqqr'

function jwt(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `eyJhbGciOiJub25lIn0.${body}.signature`
}

const valid = {
  VERCEL_ENV: 'preview',
  VITE_SUPABASE_URL: `https://${STAGING}.supabase.co`,
  SUPABASE_URL: `https://${STAGING}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: 'test-public-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role',
}

describe('Preview auth environment preflight', () => {
  it('accepts matching staging configuration', () => {
    expect(checkPreviewAuthEnvironment(valid).ok).toBe(true)
  })

  it('rejects the production project on the client or server', () => {
    expect(checkPreviewAuthEnvironment({ ...valid, VITE_SUPABASE_URL: `https://${PRODUCTION}.supabase.co` }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, SUPABASE_URL: `https://${PRODUCTION}.supabase.co` }).ok).toBe(false)
  })

  it('rejects a production anon key even when the URLs say staging', () => {
    const result = checkPreviewAuthEnvironment({
      ...valid,
      VITE_SUPABASE_ANON_KEY: jwt({ ref: PRODUCTION, role: 'anon' }),
    })
    expect(result.ok).toBe(false)
    expect(result.checks.find((check) => check.id === 'production-blocked').status).toBe('FAIL')
  })

  it('rejects mismatched projects and missing variables', () => {
    expect(checkPreviewAuthEnvironment({ ...valid, SUPABASE_URL: 'https://otherproject.supabase.co' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: '' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, SUPABASE_URL: '' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, SUPABASE_SERVICE_ROLE_KEY: '' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, VERCEL_ENV: 'production' }).ok).toBe(false)
  })

  it('rejects a service role exposed to the client', () => {
    const result = checkPreviewAuthEnvironment({
      ...valid,
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'visible-service-role',
    })
    expect(result.checks.find((check) => check.id === 'server-key-not-public').status).toBe('FAIL')
  })

  it('never includes credentials in the output', () => {
    const secret = 'DO_NOT_PRINT_THIS_KEY'
    const result = checkPreviewAuthEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: secret, SUPABASE_SERVICE_ROLE_KEY: secret })
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})

describe('Preview client bundle', () => {
  it('accepts a staging bundle and rejects production, a foreign project, or a service role', () => {
    expect(inspectPreviewClientBundle(`https://${STAGING}.supabase.co ${jwt({ ref: STAGING, role: 'anon' })}`).ok).toBe(true)
    expect(inspectPreviewClientBundle('').ok).toBe(false)
    expect(inspectPreviewClientBundle(`https://${PRODUCTION}.supabase.co`).ok).toBe(false)
    expect(inspectPreviewClientBundle(`https://${STAGING}.supabase.co https://otherproject.supabase.co`).ok).toBe(false)
    expect(inspectPreviewClientBundle(`${jwt({ ref: STAGING, role: 'service_role' })}`).checks.find((check) => check.id === 'client-secrets-hidden').status).toBe('FAIL')
  })
})

describe('Preview auth runtime checks', () => {
  it('does not call Auth when the test account is missing', async () => {
    const fetchImpl = vi.fn()
    const result = await checkStagingTestLogin({
      fetchImpl,
      supabaseUrl: valid.SUPABASE_URL,
      anonKey: valid.VITE_SUPABASE_ANON_KEY,
    })
    expect(result.attempted).toBe(false)
    expect(result.checks[0].id).toBe('staging-test-account')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not send credentials when the target is production', async () => {
    const fetchImpl = vi.fn()
    const result = await checkStagingTestLogin({
      fetchImpl,
      supabaseUrl: `https://${PRODUCTION}.supabase.co`,
      anonKey: jwt({ ref: PRODUCTION, role: 'anon' }),
      email: 'preview-test@example.test',
      password: 'staging-password',
    })
    expect(result.attempted).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('staging-password')
  })

  it('reports failed authentication without echoing the password or token', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error_description: 'Invalid login credentials', access_token: 'secret-token' }),
    }))
    const result = await checkStagingTestLogin({
      fetchImpl,
      supabaseUrl: valid.SUPABASE_URL,
      anonKey: valid.VITE_SUPABASE_ANON_KEY,
      email: 'preview-test@example.test',
      password: 'staging-password',
    })
    expect(result.ok).toBe(false)
    expect(result.accessToken).toBe('')
    expect(JSON.stringify(result.checks)).not.toContain('staging-password')
    expect(JSON.stringify(result.checks)).not.toContain('secret-token')
  })

  it('reports an unavailable auth service', async () => {
    const down = await checkAuthServiceReachable({
      fetchImpl: vi.fn(async () => ({ status: 503 })),
      supabaseUrl: valid.SUPABASE_URL,
    })
    expect(down.ok).toBe(false)
    const thrown = await checkStagingTestLogin({
      fetchImpl: vi.fn(async () => { throw new Error('offline') }),
      supabaseUrl: valid.SUPABASE_URL,
      anonKey: valid.VITE_SUPABASE_ANON_KEY,
      email: 'preview-test@example.test',
      password: 'staging-password',
    })
    expect(thrown.checks[0].detail).toBe('Staging Auth is unavailable')
  })

  it('blocks anonymous access and keeps a normal test user out of billing admin', async () => {
    const anonymous = await checkProtectedPreviewAccess({
      deploymentUrl: 'https://preview.example.test',
      fetchImpl: vi.fn(async () => ({ status: 401, json: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED' } }) })),
    })
    expect(anonymous.checks.find((check) => check.id === 'unauthorized-blocked').status).toBe('PASS')

    const user = await checkProtectedPreviewAccess({
      deploymentUrl: 'https://preview.example.test',
      accessToken: 'user-token',
      fetchImpl: vi.fn(async () => ({ status: 403, json: async () => ({ ok: false, error: { code: 'FORBIDDEN' } }) })),
    })
    expect(user.checks.find((check) => check.id === 'test-user-not-admin').status).toBe('PASS')
    expect(JSON.stringify(user)).not.toContain('user-token')
  })

  it('fails when the billing admin capability is missing and passes when the server grants it', async () => {
    const missing = await checkProtectedPreviewAccess({
      deploymentUrl: 'https://preview.example.test',
      accessToken: 'admin-token',
      expectAdmin: true,
      fetchImpl: vi.fn(async () => ({ status: 403, json: async () => ({ ok: false, error: { code: 'FORBIDDEN' } }) })),
    })
    expect(missing.checks.find((check) => check.id === 'billing-admin').status).toBe('FAIL')

    const verified = await checkProtectedPreviewAccess({
      deploymentUrl: 'https://preview.example.test',
      accessToken: 'admin-token',
      expectAdmin: true,
      fetchImpl: vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, session: { authorized: true, permissions: ['billing.admin'] } }) })),
    })
    expect(verified.ok).toBe(true)
  })

  it('does not attempt login when the real environment points at production', async () => {
    const fetchImpl = vi.fn()
    const code = await runPreviewAuthDeploymentPreflight({
      deploymentUrl: 'https://preview.example.test',
      env: {
        ...valid,
        VITE_SUPABASE_URL: `https://${PRODUCTION}.supabase.co`,
        SUPABASE_URL: `https://${PRODUCTION}.supabase.co`,
        PREVIEW_AUTH_TEST_EMAIL: 'preview-test@example.test',
        PREVIEW_AUTH_TEST_PASSWORD: 'staging-password',
      },
      fetchImpl,
    })
    expect(code).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
