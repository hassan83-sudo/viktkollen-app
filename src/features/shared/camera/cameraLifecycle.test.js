/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentCameraEpoch,
  releaseAllCameraStreams,
  releaseCameraStream,
  retainCameraStream,
} from './cameraLifecycle.js'

function createStream() {
  const track = { readyState: 'live', stop: vi.fn(function stop() { this.readyState = 'ended' }) }
  return { getTracks: () => [track], track }
}

describe('cameraLifecycle', () => {
  afterEach(() => {
    releaseAllCameraStreams()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('stops a stream that arrives after the camera was released', () => {
    const epoch = currentCameraEpoch()
    releaseAllCameraStreams()
    const stream = createStream()

    expect(retainCameraStream(stream, epoch)).toBeNull()
    expect(stream.track.stop).toHaveBeenCalledTimes(1)
  })

  it('stops a stream when the page is already hidden', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    const stream = createStream()

    expect(retainCameraStream(stream, currentCameraEpoch())).toBeNull()
    expect(stream.track.stop).toHaveBeenCalledTimes(1)
  })

  it('keeps one live stream and stops an older one', () => {
    const first = createStream()
    const second = createStream()
    const epoch = currentCameraEpoch()

    expect(retainCameraStream(first, epoch)).toBe(first)
    expect(retainCameraStream(second, epoch)).toBe(second)
    expect(first.track.stop).toHaveBeenCalledTimes(1)
    expect(second.track.stop).not.toHaveBeenCalled()

    releaseCameraStream(second)
    expect(second.track.stop).toHaveBeenCalledTimes(1)
  })

  it('releases every retained stream when the page hides', () => {
    const stream = createStream()
    retainCameraStream(stream, currentCameraEpoch())

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(stream.track.stop).toHaveBeenCalled()
  })
})
