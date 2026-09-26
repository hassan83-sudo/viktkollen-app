import { describe, expect, it, vi } from 'vitest'

import { interpretBodyScanQuota, loadBodyScanQuota, unavailableBodyScanQuota } from './bodyScanQuota.js'

const auth = async () => ({ authorizationHeader: 'Bearer session', ok: true, userScope: 'user-a' })

function quotaResponse(quota, ok = true) {
  return new Response(JSON.stringify({ ok, quota }), { status: ok ? 200 : 503 })
}

describe('body.scan quota client', () => {
  it('uses the authoritative free quota response instead of a local limit of 3', () => {
    expect(interpretBodyScanQuota({
      limit: 3,
      remaining: 3,
      status: 'ALLOWED',
      used: 0,
    })).toEqual({
      allowed: true,
      limit: 3,
      remaining: 3,
      status: 'ALLOWED',
      used: 0,
    })
  })

  it('allows a paid allowance above the legacy local limit of 3', () => {
    const quota = interpretBodyScanQuota({
      limit: 15,
      remaining: 12,
      status: 'ALLOWED',
      used: 3,
    })
    expect(quota.allowed).toBe(true)
    expect(quota.limit).toBe(15)
    expect(quota.remaining).toBe(12)
  })

  it('blocks remote analysis when remaining is 0', () => {
    expect(interpretBodyScanQuota({
      limit: 3,
      remaining: 0,
      status: 'ALLOWED',
      used: 3,
    }).allowed).toBe(false)
  })

  it('does not grant access from an unlimited or unknown quota state', () => {
    expect(interpretBodyScanQuota({ limit: null, remaining: null, status: 'UNLIMITED', used: 0 }).allowed).toBe(false)
    expect(interpretBodyScanQuota({ limit: 99, remaining: 99, status: 'DENIED_DISABLED', used: 0 }).allowed).toBe(false)
    expect(unavailableBodyScanQuota.allowed).toBe(false)
  })

  it('does not grant access when quota inspection fails', async () => {
    const failed = await loadBodyScanQuota({
      fetchImpl: vi.fn(async () => { throw new Error('offline') }),
      getAuthorization: auth,
    })
    const denied = await loadBodyScanQuota({
      fetchImpl: vi.fn(async () => quotaResponse(null, false)),
      getAuthorization: auth,
    })

    expect(failed.ok).toBe(false)
    expect(failed.quota.allowed).toBe(false)
    expect(denied.quota).toEqual(unavailableBodyScanQuota)
  })

  it('ignores client plan claims and reads body.scan from the quota endpoint', async () => {
    const fetchImpl = vi.fn(async () => quotaResponse({
      limit: 4,
      plan: 'premium',
      remaining: 4,
      status: 'ALLOWED',
      used: 0,
    }))
    const result = await loadBodyScanQuota({ fetchImpl, getAuthorization: auth })

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/billing/quota?feature=body.scan&unit=requests',
      expect.objectContaining({ headers: { Authorization: 'Bearer session' } }),
    )
    expect(result.quota.allowed).toBe(true)
    expect(result.quota.limit).toBe(4)
    expect(result.quota).not.toHaveProperty('plan')
  })
})
