import { describe, expect, it } from 'vitest'
import { assertWardrobeStagingConfig, isWardrobePreview, isWardrobeStagingUrl } from './wardrobeStagingGuard.js'

const staging = 'https://armtslzspuebmlysnooq.supabase.co'
const base = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'feature/ai-eye-wardrobe-link-20261022',
  VITE_SUPABASE_URL: staging,
  SUPABASE_URL: staging,
  VITE_SUPABASE_ANON_KEY: 'test-public',
  SUPABASE_ANON_KEY: 'test-public',
  WARDROBE_STAGING_SERVICE_ROLE_KEY: 'test-server',
  WARDROBE_STAGING_AI_DISABLED: 'true',
}

describe('wardrobe Preview staging target guard', () => {
  it('only targets the wardrobe Preview branch', () => {
    expect(isWardrobePreview(base)).toBe(true)
    expect(isWardrobePreview({ ...base, VERCEL_ENV: 'production' })).toBe(false)
    expect(isWardrobePreview({ ...base, VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false)
  })
  it('requires exact staging host and HTTPS', () => {
    expect(isWardrobeStagingUrl(staging)).toBe(true)
    for (const url of ['', 'https://example.supabase.co', 'http://armtslzspuebmlysnooq.supabase.co', 'https://armtslzspuebmlysnooq.supabase.co.evil.test', 'https://armtslzspuebmlysnooq.supabase.co/rest/v1']) {
      expect(isWardrobeStagingUrl(url)).toBe(false)
    }
  })
  it('rejects missing and Production-targeted Supabase URLs', () => {
    for (const key of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
      expect(() => assertWardrobeStagingConfig({ ...base, [key]: '' })).toThrow('wardrobe_staging_target_invalid')
      expect(() => assertWardrobeStagingConfig({ ...base, [key]: 'https://production.supabase.co' })).toThrow('wardrobe_staging_target_invalid')
    }
  })
  it('rejects missing credentials and foreign cost ledger', () => {
    expect(() => assertWardrobeStagingConfig({ ...base, WARDROBE_STAGING_SERVICE_ROLE_KEY: '' })).toThrow('wardrobe_staging_credentials_missing')
    expect(() => assertWardrobeStagingConfig({ ...base, AI_HELP_COST_SUPABASE_URL: 'https://production.supabase.co' })).toThrow('wardrobe_staging_cost_target_invalid')
  })
  it('accepts target config without network calls', () => {
    expect(assertWardrobeStagingConfig(base)).toBeUndefined()
  })
})
