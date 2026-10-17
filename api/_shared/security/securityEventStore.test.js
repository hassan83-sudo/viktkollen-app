import { describe, expect, it, vi } from 'vitest'
import { recordSecurityEvent } from './securityEventStore.js'

describe('security event persistence', () => {
  it('writes only trusted classified fields', async () => {
    const rpc = vi.fn(async () => ({ data: 7, error: null }))
    const client = { rpc }
    expect(await recordSecurityEvent({ type: 'API_RATE_LIMITED', severity: 'critical', feature: 'food-scan', password: 'private' }, { client })).toBe(true)
    expect(client.rpc).toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('security_center_record_event', {
      p_type: 'API_RATE_LIMITED', p_severity: 'medium', p_feature: 'food-scan',
    })
  })
  it('rejects unsupported events and unavailable database', async () => {
    const rpc = vi.fn()
    const client = { rpc }
    expect(await recordSecurityEvent({ type: 'UNKNOWN' }, { client })).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(await recordSecurityEvent({ type: 'API_RATE_LIMITED' }, { client: null })).toBe(false)
  })
})
