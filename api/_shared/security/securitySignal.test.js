import { describe, expect, it } from 'vitest'
import { securitySignalFromOutcome } from './securitySignal.js'

describe('trusted security outcomes', () => {
  it('does not treat ordinary authentication and quota denials as attacks', () => {
    expect(securitySignalFromOutcome({ status: 401, code: 'AUTH_REQUIRED' })).toBeNull()
    expect(securitySignalFromOutcome({ status: 403, code: 'FORBIDDEN' })).toBeNull()
    expect(securitySignalFromOutcome({ status: 429, code: 'MONTHLY_QUOTA_REACHED' })).toBeNull()
  })
  it('classifies trusted rate limiting without leaking input', () => {
    const signal = securitySignalFromOutcome({ status: 429, code: 'RATE_LIMITED', feature: 'food-scan', token: 'private' })
    expect(signal).toMatchObject({ type: 'API_RATE_LIMITED', severity: 'medium', feature: 'food-scan' })
    expect(JSON.stringify(signal)).not.toContain('private')
  })
  it('rejects invalid status and unsupported signals', () => {
    expect(securitySignalFromOutcome({ status: '429', code: 'RATE_LIMITED' })).toBeNull()
    expect(securitySignalFromOutcome({ status: 200, code: 'RATE_LIMITED' })).toBeNull()
  })
})
