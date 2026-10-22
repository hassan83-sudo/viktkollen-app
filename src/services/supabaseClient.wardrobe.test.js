import { afterEach, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => { throw Error('client_must_not_be_constructed') }) }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks() })
it('never constructs an auth/storage/realtime client in the offline bundle, even if inherited credentials exist', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_WARDROBE_OFFLINE', 'true')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://production.invalid')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'inherited-value')
  const client = await import('./supabaseClient.js')
  expect(client.supabase).toBeNull()
  expect(client.isSupabaseConfigured()).toBe(false)
  expect(client.getSupabaseStatus().reason).toContain('offline')
  expect(createClient).not.toHaveBeenCalled()
})
