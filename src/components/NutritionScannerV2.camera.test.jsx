/** @vitest-environment jsdom */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NutritionScannerV2 from './NutritionScannerV2.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createStream() {
  const track = { readyState: 'live', stop: vi.fn(function stop() { this.readyState = 'ended' }) }
  return { getTracks: () => [track], getVideoTracks: () => [track], track }
}

describe('NutritionScannerV2 live preview', () => {
  let container
  let root

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    vi.unstubAllGlobals()
  })

  function mount(getUserMedia) {
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { this.callback = callback }
      observe() { this.callback([{ isIntersecting: true }]) }
      disconnect() {}
    })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    HTMLMediaElement.prototype.play = vi.fn(async () => {})
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(NutritionScannerV2, {
        analysisDate: '2026-10-10',
        meals: [],
        onMealsChange: () => {},
        selectedMealDate: '2026-10-10',
      }))
    })
  }

  it('shows the meal preview when the camera starts', async () => {
    const stream = createStream()
    mount(vi.fn(async () => stream))

    await act(async () => {})

    const video = container.querySelector('video.scanner-live-camera')
    expect(video).not.toBeNull()
    expect(video.srcObject).toBe(stream)
    expect(stream.track.stop).not.toHaveBeenCalled()
  })

  it('does not keep a meal preview that resolves after the page hides', async () => {
    let resolveStream
    const stream = createStream()
    mount(vi.fn(() => new Promise((resolve) => { resolveStream = resolve })))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    resolveStream(stream)
    await act(async () => {})

    const video = container.querySelector('video.scanner-live-camera')
    expect(video.srcObject).toBeNull()
    expect(stream.track.stop).toHaveBeenCalled()
  })
})
