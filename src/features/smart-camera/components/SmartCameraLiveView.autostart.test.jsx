/** @vitest-environment jsdom */

import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SmartCameraLiveView from './SmartCameraLiveView.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createFakeStream() {
  const track = { kind: 'video', readyState: 'live', stop: vi.fn(function stop() { this.readyState = 'ended' }) }
  return {
    getAudioTracks: () => [],
    getTracks: () => [track],
    getVideoTracks: () => [track],
    track,
  }
}

describe('SmartCameraLiveView autoStart', () => {
  let getUserMedia

  beforeEach(() => {
    getUserMedia = vi.fn()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    globalThis.HTMLMediaElement.prototype.play = vi.fn(async () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches the stream to video when autoStart mounts under StrictMode with delayed getUserMedia', async () => {
    const stream = createFakeStream()
    getUserMedia.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve(stream), 30)
    }))
    globalThis.HTMLMediaElement.prototype.play = vi.fn(() => new Promise(() => {}))

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <StrictMode>
          <SmartCameraLiveView autoStart enabled facingMode="environment" />
        </StrictMode>,
      )
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video.srcObject).toBe(stream)
    expect(container.textContent).toContain('● Kamera aktiv')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
