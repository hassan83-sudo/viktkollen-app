/** @vitest-environment jsdom */
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDailyCoachRequest } from './useDailyCoachRequest.js'

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const reply = (summary) => ({ ok: true, data: { summary, source: 'openai' } })

describe('automatic daily coach request lifecycle', () => {
  it('makes one attempt through StrictMode replay and unrelated rerenders, retaining its reply', async () => {
    const pending = deferred()
    const request = vi.fn(() => pending.promise)
    const { result, rerender } = renderHook((props) => useDailyCoachRequest(props), {
      initialProps: { userId: 'A', day: '2026-10-20', enabled: true, request },
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })
    rerender({ userId: 'A', day: '2026-10-20', enabled: true, request: (...args) => request(...args) })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(reply('One daily reply')))
    expect(result.current.summary).toBe('One daily reply')
    rerender({ userId: 'A', day: '2026-10-20', enabled: true, request })
    expect(result.current.summary).toBe('One daily reply')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retains the local fallback after 429 without a rerender retry', async () => {
    const request = vi.fn(async () => ({ ok: false, data: { error: { code: 'RATE_LIMITED' } } }))
    const props = { userId: 'A', day: '2026-10-20', enabled: true, request }
    const { result, rerender } = renderHook((input) => useDailyCoachRequest(input), { initialProps: props })
    await waitFor(() => expect(result.current?.source).toBe('mock'))
    expect(result.current.key).toBe(props.day)
    rerender({ ...props })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('caches each selected day and does not let an older day overwrite the visible reply', async () => {
    const old = deferred(), recent = deferred()
    const request = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise)
    const props = { userId: 'A', day: '2026-10-19', enabled: true, request }
    const { result, rerender } = renderHook((input) => useDailyCoachRequest(input), { initialProps: props })
    rerender({ ...props, day: '2026-10-20' })
    await act(async () => recent.resolve(reply('Today')))
    await act(async () => old.resolve(reply('Yesterday')))
    expect(result.current.summary).toBe('Today')
    rerender(props)
    expect(result.current.summary).toBe('Yesterday')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('hides other-account replies and invalidates an old A request after A → B → A', async () => {
    const old = deferred()
    const request = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(reply('Current'))
    const props = { userId: 'A', day: '2026-10-20', enabled: true, request }
    const { result, rerender } = renderHook((input) => useDailyCoachRequest(input), { initialProps: props })
    const oldIsCurrent = request.mock.calls[0][0]
    rerender({ ...props, userId: 'B' })
    await waitFor(() => expect(result.current?.userId).toBe('B'))
    rerender(props)
    await waitFor(() => expect(result.current?.userId).toBe('A'))
    expect(oldIsCurrent()).toBe(false)
    await act(async () => old.resolve(reply('STALE_PRIVATE_REPLY')))
    expect(result.current.summary).toBe('Current')
  })

  it('does not request without auth/onboarding and invalidates work on unmount', async () => {
    const pending = deferred()
    const request = vi.fn(() => pending.promise)
    const props = { userId: null, day: '2026-10-20', enabled: true, request }
    const { rerender, unmount } = renderHook((input) => useDailyCoachRequest(input), { initialProps: props })
    rerender({ ...props, userId: 'A', enabled: false })
    expect(request).not.toHaveBeenCalled()
    rerender({ ...props, userId: 'A' })
    const isCurrent = request.mock.calls[0][0]
    unmount()
    expect(isCurrent()).toBe(false)
    await act(async () => pending.resolve(reply('Never displayed')))
  })
})
