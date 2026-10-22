import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertNoPublicServerKeys, assertWardrobeStagingConfig, isWardrobePreview, isWardrobeStagingUrl, isWardrobePublicKey, WARDROBE_BRANCH, WARDROBE_STAGING_REF } from './wardrobeStagingGuard.js'
import { wardrobeIsolationFixtures as base } from '../../scripts/wardrobeIsolationFixtures.mjs'
import { isWardrobeLocalTest, wardrobeBuildIsolation } from '../../scripts/wardrobeBuildIsolation.mjs'
import { readFileSync } from 'node:fs'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const jwt = (role, ref) => `header.${btoa(JSON.stringify({ role, ref }))}.synthetic_signature`

describe('wardrobe fail-closed identity and build boundary', () => {
  it('pins the Git-triggered Vercel build and output to the guarded package script', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(config.buildCommand).toBe('npm run build')
    expect(config.outputDirectory).toBe('dist')
    expect(pkg.scripts.build).toBe('vite build')
    expect(config.builds).toBeUndefined()
  })
  it('permits only explicit local test fixtures, never an actual build or an arbitrary --mode test server', () => {
    expect(isWardrobeLocalTest({ command: 'serve', mode: 'test', VITEST: 'true' })).toBe(true)
    expect(isWardrobeLocalTest({ command: 'serve', mode: 'test' })).toBe(false)
    const fixture = { command: 'serve', WARDROBE_LOCAL_A11Y_FIXTURE: 'true', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'local-a11y-check' }
    expect(isWardrobeLocalTest(fixture)).toBe(true)
    expect(isWardrobeLocalTest({ ...fixture, VITE_SUPABASE_ANON_KEY: 'local-ai-help-check' })).toBe(true)
    expect(isWardrobeLocalTest({ ...fixture, VITE_SUPABASE_ANON_KEY: 'inherited-production-key' })).toBe(false)
    expect(isWardrobeLocalTest({ ...fixture, VITE_SUPABASE_URL: 'https://production.invalid' })).toBe(false)
    expect(isWardrobeLocalTest({ ...fixture, command: 'build', mode: 'test', VITEST: 'true' })).toBe(false)
  })
  it('denies ambiguous runtime environments and contradictory markers', () => {
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ' ' }, { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: true }, { VERCEL_GIT_COMMIT_REF: WARDROBE_BRANCH }, { ...base, VERCEL_ENV: 'production' }]) {
      expect(isWardrobePreview(env)).toBe(true)
      expect(() => assertWardrobeStagingConfig(env)).toThrow()
    }
    expect(isWardrobePreview({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false)
    expect(isWardrobePreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'another-branch' })).toBe(false)
    expect(isWardrobePreview({ VERCEL_ENV: 'development', VERCEL_GIT_COMMIT_REF: 'local-fixture', WARDROBE_LOCAL_A11Y_FIXTURE: 'true' })).toBe(true)
  })
  it.each(Object.keys(base))('rejects a missing dedicated setting or provider marker: %s', (key) => {
    expect(() => assertWardrobeStagingConfig({ ...base, [key]: undefined })).toThrow()
  })
  it.each(['', 'http://armtslzspuebmlysnooq.supabase.co', 'https://production.supabase.co', 'https://armtslzspuebmlysnooq.supabase.co.evil.test', 'https://armtslzspuebmlysnooq.supabase.co/rest/v1', 'https://armtslzspuebmlysnooq.supabase.co:5432', 'https://user:pass@armtslzspuebmlysnooq.supabase.co'])('rejects an invalid project URL: %s', (url) => {
    expect(isWardrobeStagingUrl(url)).toBe(false)
    expect(() => assertWardrobeStagingConfig({ ...base, WARDROBE_STAGING_SUPABASE_URL: url })).toThrow()
  })
  it('validates legacy key role/project and refuses server keys in any public setting', () => {
    expect(isWardrobePublicKey(jwt('anon', WARDROBE_STAGING_REF))).toBe(true)
    expect(isWardrobePublicKey(jwt('anon', 'other-project'))).toBe(false)
    expect(isWardrobePublicKey(jwt('service_role', WARDROBE_STAGING_REF))).toBe(false)
    for (const value of [base.WARDROBE_STAGING_SERVICE_ROLE_KEY, jwt('service_role', WARDROBE_STAGING_REF)]) {
      expect(() => assertNoPublicServerKeys({ VITE_SUPABASE_ANON_KEY: value })).toThrow('public_server_credential_blocked')
    }
    expect(() => assertWardrobeStagingConfig({ ...base, WARDROBE_STAGING_SERVICE_ROLE_KEY: jwt('service_role', 'other-project') })).toThrow()
    expect(() => assertWardrobeStagingConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: base.WARDROBE_STAGING_SERVICE_ROLE_KEY })).toThrow('wardrobe_staging_global_secret_reused')
  })
  it.each(['', 'false', 'TRUE', '1'])('rejects a non-exact AI-off flag: %s', (value) => {
    expect(() => assertWardrobeStagingConfig({ ...base, WARDROBE_STAGING_AI_DISABLED: value })).toThrow()
  })
  it('uses only dedicated public data, even with inherited Production settings and AI key', () => {
    const network = vi.fn(() => { throw Error('network_forbidden') }); vi.stubGlobal('fetch', network)
    const result = wardrobeBuildIsolation({ ...base, SUPABASE_URL: 'https://production.supabase.co', VITE_SUPABASE_URL: 'https://production.supabase.co', OPENAI_API_KEY: 'synthetic-inherited-provider-secret', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-inherited-global-server-secret' }, WARDROBE_BRANCH)
    expect(result.offline).toBe(true)
    expect(result.envPrefix).toEqual([])
    expect(JSON.stringify(result.define)).not.toMatch(/production|synthetic-inherited|sb_secret_/)
    expect(network).not.toHaveBeenCalled()
  })
  it('cannot bypass the build gate by deleting provider markers, changing source branch or using test mode', () => {
    expect(() => wardrobeBuildIsolation({}, WARDROBE_BRANCH)).toThrow()
    expect(() => wardrobeBuildIsolation({ ...base, VERCEL_ENV: undefined }, WARDROBE_BRANCH)).toThrow()
    expect(() => wardrobeBuildIsolation(base, '')).toThrow()
    expect(() => wardrobeBuildIsolation(base, 'main')).toThrow()
    expect(() => wardrobeBuildIsolation({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }, '')).toThrow()
    expect(wardrobeBuildIsolation({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }, 'main').offline).toBe(false)
  })
})
