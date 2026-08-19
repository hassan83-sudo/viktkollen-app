import { createClient } from '@supabase/supabase-js'

let adminClientOverride = undefined

export function getSupabaseAdminConfig(env = process.env) {
  return {
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || '',
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
  }
}

export function createSupabaseAdminClient(env = process.env) {
  if (adminClientOverride !== undefined) return adminClientOverride

  const config = getSupabaseAdminConfig(env)
  if (!config.url || !config.serviceRoleKey) return null

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function setSupabaseAdminClientForTests(client) {
  adminClientOverride = client
}

export function clearSupabaseAdminClientForTests() {
  adminClientOverride = undefined
}
