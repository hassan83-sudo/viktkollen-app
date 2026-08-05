import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAiRequestFingerprint,
  resetAiRequestDeduperForTests,
  runDedupedAiRequest,
} from './aiRequestDeduper.js'

describe('aiRequestDeduper', () => {
  afterEach(() => {
    resetAiRequestDeduperForTests()
  })

  it('deduplicates identical in-flight requests for the same user and route', async () => {
    const producer = vi.fn(async () => ({ ok: true }))
    const fingerprint = createAiRequestFingerprint({ a: 1 })
    const first = runDedupedAiRequest({ fingerprint, route: 'coach', userId: 'user-a' }, producer)
    const second = runDedupedAiRequest({ fingerprint, route: 'coach', userId: 'user-a' }, producer)

    expect(second.deduped).toBe(true)
    await Promise.all([first.promise, second.promise])
    expect(producer).toHaveBeenCalledTimes(1)
  })

  it('keeps different users and routes isolated', async () => {
    const producer = vi.fn(async () => ({ ok: true }))
    const fingerprint = createAiRequestFingerprint({ a: 1 })
    await Promise.all([
      runDedupedAiRequest({ fingerprint, route: 'coach', userId: 'user-a' }, producer).promise,
      runDedupedAiRequest({ fingerprint, route: 'coach', userId: 'user-b' }, producer).promise,
      runDedupedAiRequest({ fingerprint, route: 'photo', userId: 'user-a' }, producer).promise,
    ])

    expect(producer).toHaveBeenCalledTimes(3)
  })
})
