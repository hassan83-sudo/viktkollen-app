import { describe, expect, it, vi } from 'vitest'
import { safeLogger, sanitizeLogValue } from './safeLogger.js'

describe('safeLogger', () => {
  it('masks forbidden fields and sensitive strings', () => {
    const sanitized = sanitizeLogValue({
      email: 'user@example.com',
      nested: { ok: true },
      lastMessage: 'hemlig chatt',
      password: 'secret',
      text: 'Bearer abc123',
      token: 'abc',
    })

    expect(sanitized.email).toBe('[doldes]')
    expect(sanitized.password).toBe('[doldes]')
    expect(sanitized.lastMessage).toBe('[doldes]')
    expect(sanitized.token).toBe('[doldes]')
    expect(sanitized.text).not.toContain('abc123')
    expect(sanitized.nested.ok).toBe(true)
  })

  it('does not throw when logging errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => safeLogger.error('fel token=abc', { session: { access_token: 'abc' } })).not.toThrow()
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('masks image payloads', () => {
    expect(sanitizeLogValue('data:image/png;base64,abcdef')).toBe('[bild doldes]')
  })
})
