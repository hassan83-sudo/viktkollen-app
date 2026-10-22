/** @vitest-environment jsdom */
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useProactiveCoachRequest } from './useProactiveCoachRequest.js'

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const reply = (nextBestAction) => ({ nextBestAction, source: 'openai' })

describe('automatic proactive coach request lifecycle', () => {
  it('makes one attempt through StrictMode replay, rerender and navigation-style refresh', async () => {
    const pending = deferred()
    const request = vi.fn(() => pending.promise)
    const props = { userId: 'A', enabled: true, requestKey: 'same-input', request }
    const { result, rerender } = renderHook((input) => useProactiveCoachRequest(input), {
      initialProps: props,
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })
    rerender({ ...props, request: (...args) => request(...args) })
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(reply('One proactive reply')))
    expect(result.current.insights.nextBestAction).toBe('One proactive reply')
    rerender({ ...props, request })
    expect(result.current.insights.nextBestAction).toBe('One proactive reply')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps the failed response after 429 and does not retry on rerender', async () => {
    const request = vi.fn(async () => ({ dailyRisk: 'Lokal', source: 'mock' }))
    const props = { userId: 'A', enabled: true, requestKey: 'same-input', request }
    const { result, rerender } = renderHook((input) => useProactiveCoachRequest(input), { initialProps: props })
    await waitFor(() => expect(result.current?.insights.source).toBe('mock'))
    rerender({ ...props, request: (...args) => request(...args) })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('waits for hydration and sends one request when the input then stays unchanged', async () => {
    const request = vi.fn(async () => reply('After hydration'))
    const props = { userId: 'A', enabled: false, requestKey: 'starter', request }
    const { result, rerender } = renderHook((input) => useProactiveCoachRequest(input), { initialProps: props })
    rerender({ ...props, enabled: true, requestKey: 'hydrated' })
    await waitFor(() => expect(result.current?.insights.nextBestAction).toBe('After hydration'))
    rerender({ ...props, enabled: true, requestKey: 'hydrated', request: (...args) => request(...args) })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('requests again only when the input key changes and ignores the older reply', async () => {
    const first = deferred()
    const second = deferred()
    const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const props = { userId: 'A', enabled: true, requestKey: 'morning', request }
    const { result, rerender } = renderHook((input) => useProactiveCoachRequest(input), { initialProps: props })
    rerender({ ...props, requestKey: 'evening' })
    await act(async () => second.resolve(reply('Evening')))
    await act(async () => first.resolve(reply('Morning')))
    expect(result.current.insights.nextBestAction).toBe('Evening')
    rerender({ ...props, requestKey: 'morning' })
    expect(result.current.insights.nextBestAction).toBe('Morning')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('hides another account and does not apply an old request after A → B → A', async () => {
    const old = deferred()
    const request = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(reply('Current'))
    const props = { userId: 'A', enabled: true, requestKey: 'same-input', request }
    const { result, rerender } = renderHook((input) => useProactiveCoachRequest(input), { initialProps: props })
    const oldIsCurrent = request.mock.calls[0][0]
    rerender({ ...props, userId: 'B' })
    await waitFor(() => expect(result.current?.userId).toBe('B'))
    rerender(props)
    await waitFor(() => expect(result.current?.userId).toBe('A'))
    expect(oldIsCurrent()).toBe(false)
    await act(async () => old.resolve(reply('STALE_PRIVATE_REPLY')))
    expect(result.current.insights.nextBestAction).toBe('Current')
  })

  it('does not request while signed out and invalidates an in-flight call on unmount', async () => {
    const pending = deferred()
    const request = vi.fn(() => pending.promise)
    const props = { userId: null, enabled: true, requestKey: 'same-input', request }
    const { rerender, unmount } = renderHook((input) => useProactiveCoachRequest(input), { initialProps: props })
    rerender({ ...props, userId: 'A', enabled: false })
    expect(request).not.toHaveBeenCalled()
    rerender({ ...props, userId: 'A', enabled: true })
    const isCurrent = request.mock.calls[0][0]
    unmount()
    expect(isCurrent()).toBe(false)
    await act(async () => pending.resolve(reply('Never displayed')))
  })
})
