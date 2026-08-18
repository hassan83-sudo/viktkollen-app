import {
  isSupabaseConfigured as getIsSupabaseConfigured,
  supabase,
} from '../services/supabaseClient.js'

export const isSupabaseConfigured = getIsSupabaseConfigured()
export { supabase }
