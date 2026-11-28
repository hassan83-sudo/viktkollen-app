/* @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFeatureAccess } from './useFeatureAccess.js'

const auth = vi.hoisted(() => ({ callback: null }))
vi.mock('../supabaseClient.js', () => ({ supabase: { auth: { onAuthStateChange: callback => {
  auth.callback = callback
  return { data: { subscription: { unsubscribe() {} } } }
} } } }))
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-28T12:00:00Z')) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('subscription access lifecycle', () => {
  it('locks at the exact server expiry and leaves saved information intact', async () => {
    localStorage.setItem('saved-wardrobe', 'preserve')
    const load = vi.fn(async () => ({ state: 'allowed', expiresAt: Date.now() + 1000 }))
    const { result } = renderHook(() => useFeatureAccess('wardrobe', { load, recheckMs: 0 }))
    expect(result.current.state).toBe('checking')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.state).toBe('allowed')
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(result.current.state).toBe('locked')
    expect(localStorage.getItem('saved-wardrobe')).toBe('preserve')
  })
  it('discards an old account response after an auth change', async () => {
    const pending = Promise.withResolvers()
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce('locked')
    const { result } = renderHook(() => useFeatureAccess('wardrobe', { load, recheckMs: 0 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { auth.callback('SIGNED_OUT') })
    expect(result.current.state).toBe('locked')
    await act(async () => { pending.resolve({ state: 'allowed', expiresAt: Date.now() + 100000 }) })
    expect(result.current.state).toBe('locked')
  })
  it('fails closed on unavailable, malformed or expired access', async () => {
    const load = vi.fn(async () => ({ state: 'allowed', expiresAt: Date.now() }))
    const { result } = renderHook(() => useFeatureAccess('wardrobe', { load, recheckMs: 0 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.state).toBe('locked')
  })
})
