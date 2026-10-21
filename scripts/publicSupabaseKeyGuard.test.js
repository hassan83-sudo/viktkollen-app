import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { assertPublicSupabaseKey } from './publicSupabaseKeyGuard.js'
const key = (role, ref = 'stage') => `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.test`
describe('public Supabase build configuration', () => {
  it('blocks server JWTs and secret keys without printing them', () => {
    for (const value of [key('service_role'), 'sb_secret_DO_NOT_PRINT']) {
      try { assertPublicSupabaseKey({ VITE_SUPABASE_ANON_KEY: value }); throw new Error('not blocked') }
      catch (error) { expect(error.message).toContain('Unsafe Supabase client'); expect(error.message).not.toContain(value) }
    }
  })
  it('allows public keys and local test placeholders, but blocks cross-project JWT configuration', () => {
    expect(() => assertPublicSupabaseKey({ VITE_SUPABASE_URL: 'https://stage.supabase.co', VITE_SUPABASE_ANON_KEY: key('anon') })).not.toThrow()
    expect(() => assertPublicSupabaseKey({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_public' })).not.toThrow()
    expect(() => assertPublicSupabaseKey({ VITE_SUPABASE_ANON_KEY: 'local-ai-help-check' })).not.toThrow()
    expect(() => assertPublicSupabaseKey({ VITE_SUPABASE_URL: 'https://other.supabase.co', VITE_SUPABASE_ANON_KEY: key('anon') })).toThrow('project mismatch')
  })
})
