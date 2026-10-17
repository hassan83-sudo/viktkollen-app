import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySecurityEvent, summarizeSecurityEvents, SECURITY_EVENT_TYPES } from './securityEvents.js'

test('rejects unknown events and does not trust client severity', () => {
  assert.equal(classifySecurityEvent({ type: 'CUSTOM' }), null)
  const result = classifySecurityEvent({ type: SECURITY_EVENT_TYPES.CROSS_USER_ACCESS_DENIED, severity: 'low', token: 'secret', email: 'x@y.com' })
  assert.equal(result.severity, 'critical')
  assert.equal(Object.hasOwn(result, 'token'), false)
  assert.equal(Object.hasOwn(result, 'email'), false)
})
test('counts only known security events', () => {
  assert.deepEqual(summarizeSecurityEvents([{ type: SECURITY_EVENT_TYPES.QUOTA_BYPASS_ATTEMPT }, { type: 'CUSTOM' }]), { critical: 0, high: 1, medium: 0, total: 1 })
})
