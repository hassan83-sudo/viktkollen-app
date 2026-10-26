import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completePasswordRecovery, signInWithEmail, signOut, signOutAllSessions } from './authService.js'

const { auth } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(async () => ({ data: { session: { user: { id: 'user' } } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ data: { user: { id: 'user' } }, error: null })),
  },
}))

vi.mock('./supabaseClient.js', () => ({
  getSupabaseStatus: () => ({ authEnabled: true, configured: true }),
  isSupabaseConfigured: () => true,
  supabase: { auth },
}))

describe('auth session scope', () => {
  beforeEach(() => {
    auth.signInWithPassword.mockClear()
    auth.signOut.mockClear()
    auth.updateUser.mockClear()
  })

  it('sends the password to Supabase unchanged', async () => {
    const password = ' secret \u200b'
    await signInWithEmail({ email: 'owner@example.com', password })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password,
    })
  })

  it('signs out only the current device', async () => {
    await signOut()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('keeps an ordinary sign-out local when a wider scope is requested', async () => {
    await signOut({ scope: 'global' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('revokes every session after account deletion', async () => {
    await signOutAllSessions()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('revokes every session after a password change', async () => {
    await completePasswordRecovery('new-secret')
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-secret' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })
})
