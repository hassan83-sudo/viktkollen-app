import { assertStagingTarget } from '../../services/billing/stagingLive.js'
import { extractSupabaseProjectRef } from '../../services/billing/stagingVerification.js'

export function stagingAuthTargetFromEnv(env) {
  const gate = assertStagingTarget(env)
  const url = String(env.BILLING_TEST_SUPABASE_URL || '').trim()
  const anonKey = String(env.BILLING_TEST_SUPABASE_ANON_KEY || '').trim()
  const parsed = extractSupabaseProjectRef(url)
  if (!parsed || parsed.ref !== gate.stagingRef || parsed.ref === gate.productionRef) {
    throw new Error('staging_auth_target_rejected')
  }

  return {
    anonKey,
    clientEnv: {
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: anonKey,
      VITE_SUPABASE_URL: url,
    },
    sameProject: true,
  }
}
