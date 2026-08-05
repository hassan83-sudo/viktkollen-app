import { describe, expect, it, vi } from 'vitest'
import { verifySupabaseUser, verifySupabaseUserInternals } from './verifySupabaseUser.js'

function requestWithAuth(value) {
  return {
    headers: value ? { authorization: value } : {},
  }
}

describe('verifySupabaseUser', () => {
  it('requires a Bearer authorization header', async () => {
    const missing = await verifySupabaseUser(requestWithAuth(''), { requestId: 'req-1' })
    const malformed = await verifySupabaseUser(requestWithAuth('Basic abc'), { requestId: 'req-2' })

    expect(missing.authenticated).toBe(false)
    expect(missing.status).toBe(401)
    expect(missing.error.code).toBe('AUTH_REQUIRED')
    expect(malformed.error.code).toBe('AUTH_INVALID')
  })

  it('verifies tokens with an injected Supabase-compatible adapter', async () => {
    const verifier = vi.fn(async (token) => ({ user: { id: `user-for-${token}` } }))
    const result = await verifySupabaseUser(requestWithAuth('Bearer valid-token'), { verifier })

    expect(result.authenticated).toBe(true)
    expect(result.user.id).toBe('user-for-valid-token')
    expect(verifier).toHaveBeenCalledWith('valid-token')
  })

  it('maps invalid expired unavailable and timeout failures safely', async () => {
    const invalid = await verifySupabaseUser(requestWithAuth('Bearer bad'), {
      verifier: async () => ({ error: { message: 'invalid jwt' } }),
    })
    const expired = await verifySupabaseUser(requestWithAuth('Bearer old'), {
      verifier: async () => ({ error: { message: 'JWT expired' } }),
    })
    const unavailable = await verifySupabaseUser(requestWithAuth('Bearer ok'), {
      verifier: async () => ({ error: { message: 'network fetch failed' } }),
    })
    const timeout = await verifySupabaseUser(requestWithAuth('Bearer slow'), {
      timeoutMs: 1,
      verifier: () => new Promise(() => {}),
    })

    expect(invalid.error.code).toBe('AUTH_INVALID')
    expect(expired.error.code).toBe('AUTH_EXPIRED')
    expect(unavailable.status).toBe(503)
    expect(unavailable.error.code).toBe('AUTH_UNAVAILABLE')
    expect(timeout.status).toBe(503)
    expect(timeout.error.code).toBe('AUTH_UNAVAILABLE')
    expect(JSON.stringify([invalid, expired, unavailable, timeout])).not.toMatch(/Bearer|bad|old|slow|user-/)
  })

  it('does not treat token payload parsing as a security decision', () => {
    expect(verifySupabaseUserInternals.getBearerToken(requestWithAuth('Bearer header.payload.signature')).token)
      .toBe('header.payload.signature')
  })
})
