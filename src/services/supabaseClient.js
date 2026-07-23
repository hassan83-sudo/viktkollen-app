import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseStatus() {
  if (!supabaseUrl && !supabaseAnonKey) {
    return {
      configured: false,
      reason: 'Supabase environment variables are missing',
    }
  }

  if (!supabaseUrl) {
    return {
      configured: false,
      reason: 'VITE_SUPABASE_URL is missing',
    }
  }

  if (!supabaseAnonKey) {
    return {
      configured: false,
      reason: 'VITE_SUPABASE_ANON_KEY is missing',
    }
  }

  return {
    configured: true,
    reason: 'Supabase client is configured',
  }
}

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
