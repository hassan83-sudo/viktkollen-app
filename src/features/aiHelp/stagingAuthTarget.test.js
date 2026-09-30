import { describe, expect, it } from 'vitest'
import { stagingAuthTargetFromEnv } from './stagingAuthTarget.js'

const stagingEnv = {
  BILLING_TEST_PRODUCTION_PROJECT_REF: 'prodproj',
  BILLING_TEST_STAGING_PROJECT_REF: 'stageproj',
  BILLING_TEST_SUPABASE_ANON_KEY: 'staging-anon',
  BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY: 'staging-service',
  BILLING_TEST_SUPABASE_URL: 'https://stageproj.supabase.co',
  BILLING_TEST_TARGET: 'staging',
}

describe('staging auth target', () => {
  it('points the client and the server at the same staging project', () => {
    const target = stagingAuthTargetFromEnv(stagingEnv)
    expect(target.sameProject).toBe(true)
    expect(target.clientEnv.VITE_SUPABASE_URL).toBe(target.clientEnv.SUPABASE_URL)
    expect(target.clientEnv.VITE_SUPABASE_ANON_KEY).toBe(target.clientEnv.SUPABASE_ANON_KEY)
    expect(target.clientEnv.SUPABASE_URL).toBe('https://stageproj.supabase.co')
    expect(JSON.stringify(target.clientEnv)).not.toContain('staging-service')
    expect(JSON.stringify(target.clientEnv)).not.toContain('prodproj')
  })

  it('rejects a production project url', () => {
    expect(() => stagingAuthTargetFromEnv({
      ...stagingEnv,
      BILLING_TEST_SUPABASE_URL: 'https://prodproj.supabase.co',
    })).toThrow(/staging_target_invalid|staging_ref_mismatch|production_target_blocked|staging_auth_target_rejected/)
  })
})
