import { Buffer } from 'node:buffer'

// Build/dev configuration check only. Never include credential values in errors.
export function assertPublicSupabaseKey(env) {
  const key = env.VITE_SUPABASE_ANON_KEY || ''
  let claims = null
  if (key.startsWith('eyJ')) {
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) } catch { /* Existing Auth handles invalid public keys. */ }
  }
  if (key.startsWith('sb_secret_') || (claims?.role && claims.role !== 'anon')) {
    throw new Error('Unsafe Supabase client configuration: VITE_SUPABASE_ANON_KEY must be a public anon/publishable key, never a server key.')
  }
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(env.VITE_SUPABASE_URL || '')?.[1]
  if (claims?.ref && ref && claims.ref !== ref) throw new Error('Supabase client URL/key project mismatch.')
}
