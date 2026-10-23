import { afterEach, describe, expect, it, vi } from 'vitest'
import { logSumUpSandboxFailure } from './index.js'

describe('SumUp sandbox failure diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs lowercase activation codes and replaces unsafe values', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const previousKey = process.env.SUMUP_API_KEY
    process.env.SUMUP_API_KEY = 'sk-test-secret-value'
    try {
      logSumUpSandboxFailure({
        action: 'verify',
        code: 'duplicate_open_subscription',
        requestId: 'bill-user-abc',
        status: 409,
        step: 'atomic-activation',
      })
      const logged = error.mock.calls[0]
      expect(logged).toHaveLength(1)
      expect(typeof logged[0]).toBe('string')
      expect(JSON.parse(logged[0])).toMatchObject({
        action: 'verify',
        code: 'duplicate_open_subscription',
        event: 'sumup_sandbox_failed',
        status: 409,
        step: 'atomic-activation',
      })
      expect(logged[0]).not.toContain('sk-test-secret-value')

      error.mockClear()
      logSumUpSandboxFailure({
        action: 'verify',
        code: 'not a code',
        requestId: 'bill-user-abc',
        status: 409,
        step: 'atomic-activation',
      })
      expect(JSON.parse(error.mock.calls[0][0]).code).toBe('UNKNOWN')

      error.mockClear()
      logSumUpSandboxFailure({
        action: 'verify',
        code: 'a'.repeat(65),
        requestId: 'bill-user-abc',
        status: 409,
        step: 'atomic-activation',
      })
      expect(JSON.parse(error.mock.calls[0][0]).code).toBe('UNKNOWN')

      error.mockClear()
      logSumUpSandboxFailure({
        action: 'verify',
        code: { message: 'Bearer secret-token', card: '4111111111111111' },
        requestId: 'bill-user-abc',
        status: 409,
        step: 'atomic-activation',
      })
      const unsafe = error.mock.calls[0][0]
      expect(JSON.parse(unsafe).code).toBe('UNKNOWN')
      expect(unsafe).not.toContain('4111111111111111')
      expect(unsafe).not.toContain('secret-token')
      expect(unsafe).not.toContain('Bearer')
    } finally {
      if (previousKey === undefined) delete process.env.SUMUP_API_KEY
      else process.env.SUMUP_API_KEY = previousKey
    }
  })
})
