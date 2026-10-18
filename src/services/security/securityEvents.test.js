import { describe, expect, it } from 'vitest'
import { classifySecurityEvent, summarizeSecurityEvents, SECURITY_EVENT_TYPES } from './securityEvents.js'

describe('security event classification', () => {
  it('rejects unknown events and does not trust client severity', () => {
    expect(classifySecurityEvent({ type: 'CUSTOM' })).toBeNull()
    const result = classifySecurityEvent({ type: SECURITY_EVENT_TYPES.CROSS_USER_ACCESS_DENIED, severity: 'low', token: 'secret', email: 'x@y.com' })
    expect(result.severity).toBe('critical')
    expect(Object.hasOwn(result, 'token')).toBe(false)
    expect(Object.hasOwn(result, 'email')).toBe(false)
  })

  it('counts only known security events', () => {
    expect(summarizeSecurityEvents([{ type: SECURITY_EVENT_TYPES.QUOTA_BYPASS_ATTEMPT }, { type: 'CUSTOM' }])).toEqual({ critical: 0, high: 1, medium: 0, total: 1 })
  })
})
