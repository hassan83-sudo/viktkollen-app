import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { formatStagingValidation, validateStagingEnvironment } from './stagingEnvironmentValidator.js'
import { formatPhotoRoutePreflight, verifyPhotoRoute } from './photoRoutePreflight.js'
import { formatCoachRoutePreflight, verifyCoachRoute } from './coachRoutePreflight.js'
import { formatPreviewVerification, verifyPreviewDeployment } from './previewVerifier.js'

function fakeFiles(existing = [], contents = {}) {
  return {
    exists: (path) => existing.includes(path),
    read: (path) => contents[path] || '',
  }
}

describe('staging environment validator', () => {
  const requiredFiles = [
    'api/adaptive-coach/index.js',
    'api/ai/index.js',
    'api/account-deletion/index.js',
    'api/body-analysis/index.js',
    'api/entitlements/index.js',
    'api/meal-analysis/index.js',
    'api/_shared/entitlementMapper.js',
    'api/_shared/aiRateLimiter.js',
    'api/_shared/aiRequestDeduper.js',
    'api/_shared/aiRouteErrors.js',
    'api/_shared/supabaseServer.js',
    'api/_shared/verifySupabaseUser.js',
    'api/nutrition-photo-analysis/index.js',
    'src/services/accountDeletionClient.js',
    'src/services/accountDeletionReadiness.js',
    'src/services/entitlements.js',
    'src/services/coachMemory/coachContextSelector.js',
    'docs/supabase-staging-runbook.md',
    'docs/vercel-staging-env-runbook.md',
    'docs/staging-test-user-ab-acceptance.md',
    'src/services/coachMemory/coachMemoryBuilder.js',
    'src/services/coachMemory/coachMemoryModel.js',
    'public/manifest.webmanifest',
    'public/sw.js',
    'public/pwa-icon-192.png',
    'public/pwa-icon-512.png',
    'public/pwa-maskable-512.png',
    '.env.example',
  ]

  it('passes with configured safe client variables and server-only OpenAI key', () => {
    const contents = {
      '.env.example': 'OPENAI_API_KEY=\nVITE_SUPABASE_URL=\n',
      'api/account-deletion/index.js': 'verifySupabaseUser createSupabaseAdminClient deleteAuthUser',
      'api/adaptive-coach/index.js': 'verifySupabaseUser setNoStoreHeaders hasBlockedFields userId checkAiRouteRateLimit',
      'api/ai/index.js': 'verifySupabaseUser setNoStoreHeaders sendSafeAiError checkAiRouteRateLimit',
      'api/body-analysis/index.js': 'verifySupabaseUser setNoStoreHeaders sendSafeAiError checkAiRouteRateLimit',
      'api/entitlements/index.js': 'verifySupabaseUser setNoStoreHeaders mapEntitlementRowToSnapshot',
      'api/meal-analysis/index.js': 'verifySupabaseUser setNoStoreHeaders sendSafeAiError checkAiRouteRateLimit',
      'api/nutrition-photo-analysis/index.js': 'verifySupabaseUser checkAiRouteRateLimit setNoStoreHeaders',
      'src/services/entitlements.js': '/api/entitlements Authorization import.meta.env.DEV',
      'src/services/aiApiService.js': 'getCurrentAiAuthorization Authorization',
      'src/services/bodyAnalysisService.js': 'getCurrentAiAuthorization Authorization',
      'src/services/mealAnalysisService.js': 'getCurrentAiAuthorization Authorization',
      'src/services/ai/remoteCoachService.js': 'getCurrentAiAuthorization Authorization',
      'src/services/nutritionPhotoAnalysisProvider.js': 'getCurrentAiAuthorization Authorization',
    }
    const result = validateStagingEnvironment({
      env: {
        OPENAI_API_KEY: 'configured-server-value',
        SUPABASE_SERVICE_ROLE_KEY: 'configured-service-role',
        VITE_SUPABASE_ANON_KEY: 'configured-anon-key',
        VITE_SUPABASE_URL: 'https://project.supabase.co',
      },
      files: fakeFiles([
        ...requiredFiles,
        'src/services/aiApiService.js',
        'src/services/bodyAnalysisService.js',
        'src/services/mealAnalysisService.js',
        'src/services/ai/remoteCoachService.js',
        'src/services/nutritionPhotoAnalysisProvider.js',
      ], contents),
    })

    expect(result.ok).toBe(true)
    expect(result.summary.fail).toBe(0)
  })

  it('fails missing variables placeholder values and VITE server key exposure', () => {
    const result = validateStagingEnvironment({
      env: {
        OPENAI_API_KEY: 'placeholder',
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'client-admin-secret',
        VITE_OPENAI_API_KEY: 'client-secret',
        VITE_SUPABASE_ANON_KEY: 'todo',
        VITE_SUPABASE_URL: 'not-a-url',
      },
      files: fakeFiles(requiredFiles, { '.env.example': 'VITE_OPENAI_API_KEY=\n' }),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.some((check) => check.id === 'VITE_OPENAI_API_KEY' && check.status === 'FAIL')).toBe(true)
    expect(result.checks.some((check) => check.id === 'VITE_SUPABASE_SERVICE_ROLE_KEY' && check.status === 'FAIL')).toBe(true)
  })

  it('does not print variable values', () => {
    const secret = 'super-secret-test-value'
    const result = validateStagingEnvironment({
      env: {
        OPENAI_API_KEY: secret,
        VITE_SUPABASE_ANON_KEY: secret,
        VITE_SUPABASE_URL: 'https://project.supabase.co',
      },
      files: fakeFiles(requiredFiles, { '.env.example': 'OPENAI_API_KEY=\n' }),
    })

    expect(formatStagingValidation(result)).not.toContain(secret)
  })
})

describe('photo route preflight', () => {
  it('skips remote checks without url and never requires paid provider by default', async () => {
    const result = await verifyPhotoRoute({ env: {}, cwd: process.cwd() })

    expect(result.checks.some((check) => check.id === 'remote-contract' && check.status === 'SKIP')).toBe(true)
    expect(result.checks.some((check) => check.id === 'provider-config' && check.status === 'SKIP')).toBe(true)
  })

  it('accepts safe missing-image errors and rejects secret-like responses', async () => {
    const result = await verifyPhotoRoute({
      baseUrl: 'https://preview.example',
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: 'AUTH_REQUIRED', requestId: 'req', safeMessage: 'Logga in' },
        ok: false,
      }), {
        headers: { 'Cache-Control': 'no-store' },
        status: 401,
      }),
    })

    expect(result.ok).toBe(true)
    expect(formatPhotoRoutePreflight(result)).not.toMatch(/Bearer|sk-/)
  })
})

describe('coach route preflight', () => {
  it('checks missing auth without provider traffic', async () => {
    const result = await verifyCoachRoute({
      baseUrl: 'https://preview.example',
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: 'AUTH_REQUIRED', requestId: 'req', safeMessage: 'Logga in' },
        ok: false,
      }), {
        headers: { 'Cache-Control': 'no-store' },
        status: 401,
      }),
    })

    expect(result.ok).toBe(true)
    expect(formatCoachRoutePreflight(result)).not.toMatch(/Bearer|sk-/)
  })
})

describe('preview verifier', () => {
  it('requires HTTPS preview URLs', async () => {
    const result = await verifyPreviewDeployment({ url: 'http://preview.example' })

    expect(result.ok).toBe(false)
    expect(result.checks.find((check) => check.id === 'https')?.status).toBe('FAIL')
  })

  it('checks manifest service worker icons API route and forbidden preloads', async () => {
    const calls = []
    const result = await verifyPreviewDeployment({
      fetchImpl: async (url) => {
        calls.push(String(url))
        return new Response(String(url).includes('index') ? '<html></html>' : '{}', { status: 200 })
      },
      url: 'https://preview.example/index',
    })

    expect(result.ok).toBe(true)
    expect(calls.some((call) => call.includes('/manifest.webmanifest'))).toBe(true)
    expect(calls.some((call) => call.includes('/sw.js'))).toBe(true)
    expect(formatPreviewVerification(result)).not.toMatch(/OPENAI_API_KEY|service_role/)
  })

  it('fails when a forbidden lazy chunk is preloaded in index', async () => {
    const result = await verifyPreviewDeployment({
      fetchImpl: async () => new Response('<link rel="modulepreload" href="/SocialCenter.js">', { status: 200 }),
      url: 'https://preview.example',
    })

    expect(result.checks.find((check) => check.id === 'modulepreload')?.status).toBe('FAIL')
  })
})
