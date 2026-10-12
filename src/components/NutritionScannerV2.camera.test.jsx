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

  it('releases the preview before the iPhone camera opens and does not restart it meanwhile', async () => {
    const first = createStream()
    const getUserMedia = vi.fn(async () => first)
    mount(getUserMedia)
    await act(async () => {})
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    const input = container.querySelector('#nutrition-scanner-photo-camera-input')
    await act(async () => input.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(first.track.stop).toHaveBeenCalledTimes(1)
    expect(container.querySelector('video.scanner-live-camera').srcObject).toBeNull()

    // Sidan blir synlig igen medan iPhones kamera är öppen: ingen ny start.
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {})
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('starts the preview again once when the iPhone camera is cancelled', async () => {
    const streams = [createStream(), createStream()]
    const getUserMedia = vi.fn(async () => streams[getUserMedia.mock.calls.length - 1])
    mount(getUserMedia)
    await act(async () => {})

    const input = container.querySelector('#nutrition-scanner-photo-camera-input')
    await act(async () => input.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => input.dispatchEvent(new Event('cancel')))
    await act(async () => {})

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(container.querySelector('video.scanner-live-camera').srcObject).toBe(streams[1])
    expect(streams[1].track.stop).not.toHaveBeenCalled()
  })
})
