/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return { ...actual, createPortal: (node) => node }
})

import SmartCameraStage from './components/SmartCameraStage.jsx'
import { createCameraSession, detachStreamFromVideo } from '../shared/camera/cameraSession.js'
import { getFeatureFlags } from '../featureRegistry.js'
import {
  applyFaceProtectionToCanvas,
  getFaceProtectionOutcome,
  shouldBlockAnalysisForFaceProtection,
} from '../../services/bodyAnalysisVideoScan.js'

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

function mountStage(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(<SmartCameraStage featureFlags={getFeatureFlags()} onClose={() => {}} {...props} />)
  })
  return {
    container,
    click(text) {
      const button = [...container.querySelectorAll('button')].find((node) => node.textContent.includes(text))
      if (!button) throw new Error(`Button not found: ${text}`)
      act(() => button.click())
      return button
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('Smart Camera security', () => {
  let getUserMedia
  let fetchSpy

  beforeEach(() => {
    getUserMedia = vi.fn(async () => createFakeStream())
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    fetchSpy = vi.fn(async () => ({ json: async () => ({}), ok: true }))
    vi.stubGlobal('fetch', fetchSpy)
    globalThis.HTMLMediaElement.prototype.play = vi.fn(async () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('does not touch camera, microphone or network when the hub opens', () => {
    const stage = mountStage()

    expect(getUserMedia).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(stage.container.querySelector('video')).toBeNull()
    stage.unmount()
  })

  it('requires an explicit user action before the camera starts', () => {
    const stage = mountStage()

    stage.click('Kolla mig')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(stage.container.textContent).toContain('Kameran är avstängd')

    stage.click('Starta kamera')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'user' } } })
    stage.unmount()
  })

  it('never asks for the microphone together with the camera', () => {
    const stage = mountStage()
    stage.click('Kolla mig')
    stage.click('Starta kamera')

    getUserMedia.mock.calls.forEach(([constraints]) => {
      expect(constraints.audio).toBe(false)
    })
    stage.unmount()
  })

  it('an open camera never triggers an AI request or upload', async () => {
    const stage = mountStage()
    stage.click('Kolla mig')
    stage.click('Starta kamera')
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    stage.unmount()
  })

  it('stops tracks and clears srcObject when the mode changes back to the hub', async () => {
    const stage = mountStage()
    stage.click('Kolla mig')
    stage.click('Starta kamera')
    await act(async () => {})

    const stream = await getUserMedia.mock.results[0].value
    const video = stage.container.querySelector('video')
    expect(video).not.toBeNull()

    stage.click('Hubb')
    expect(stream.track.stop).toHaveBeenCalled()
    expect(video.srcObject).toBeNull()
    stage.unmount()
  })

  it('stops tracks on unmount and on the explicit stop control', async () => {
    const stage = mountStage()
    stage.click('Kolla mig')
    stage.click('Starta kamera')
    await act(async () => {})
    const stream = await getUserMedia.mock.results[0].value

    stage.click('Stäng kamera')
    expect(stream.track.stop).toHaveBeenCalled()

    stage.click('Starta kamera')
    await act(async () => {})
    const second = await getUserMedia.mock.results[1].value
    stage.unmount()
    expect(second.track.stop).toHaveBeenCalled()
  })

  it('cleans up countdown timers so no timer survives close', async () => {
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const stage = mountStage()
    stage.click('Kolla mig')
    stage.click('Starta kamera')
    await act(async () => {})
    stage.click('Starta 3')

    stage.unmount()
    expect(clearInterval).toHaveBeenCalled()
    clearInterval.mockRestore()
  })

  it('surfaces a readable message when camera permission is denied', async () => {
    const denied = new Error('denied')
    denied.name = 'NotAllowedError'
    getUserMedia.mockRejectedValueOnce(denied)

    const stage = mountStage()
    stage.click('Kolla mig')
    stage.click('Starta kamera')
    await act(async () => {})

    expect(stage.container.textContent).toContain('Kamerabehörighet nekades')
    stage.unmount()
  })

  it('shows the camera indicator only when a session is really running', async () => {
    const stage = mountStage()
    stage.click('Kolla mig')
    expect(stage.container.textContent).not.toContain('● Kamera aktiv')

    stage.click('Starta kamera')
    await act(async () => {})
    expect(stage.container.textContent).toContain('● Kamera aktiv')

    stage.click('Stäng kamera')
    expect(stage.container.textContent).not.toContain('● Kamera aktiv')
    stage.unmount()
  })

  it('shows the microphone indicator only from real voice state', async () => {
    const off = mountStage()
    expect(off.container.textContent).not.toContain('● Mikrofon aktiv')
    off.unmount()

    const on = mountStage({ isMicrophoneActive: true })
    expect(on.container.textContent).toContain('● Mikrofon aktiv')
    on.unmount()
  })

  it('does not claim "Lokalt" for AI when the voice mode can send audio away', () => {
    const stage = mountStage()
    expect(stage.container.textContent).toContain('AI får ingen kamerabild')
    expect(stage.container.textContent).not.toContain('skickas ljudet till vår AI-leverantör')

    stage.click('Fråga AI')
    expect(stage.container.textContent).toContain('skickas ljudet till vår AI-leverantör')
    stage.unmount()
  })

  it('starts nothing for disabled features and hides Family Safety', () => {
    const stage = mountStage({
      featureFlags: getFeatureFlags({ eyes: false, familySafety: false, memory: false, mouth: false }),
    })

    expect(stage.container.textContent).not.toContain('Ögon')
    expect(stage.container.textContent).not.toContain('Family')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    stage.unmount()
  })

  it('renders nothing at all when smartCamera is off', () => {
    const stage = mountStage({ featureFlags: getFeatureFlags({ smartCamera: false }) })

    expect(stage.container.textContent).toBe('')
    expect(getUserMedia).not.toHaveBeenCalled()
    stage.unmount()
  })
})

describe('shared cameraSession teardown', () => {
  it('stops tracks and detaches the video element on stop', async () => {
    const stream = createFakeStream()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    const video = document.createElement('video')
    video.play = vi.fn(async () => {})

    const session = createCameraSession()
    await session.start(video)
    expect(video.srcObject).toBe(stream)
    expect(session.isActive()).toBe(true)

    session.stop()
    expect(stream.track.stop).toHaveBeenCalled()
    expect(video.srcObject).toBeNull()
    expect(session.isActive()).toBe(false)
  })

  it('detaches a video element that never had a stream without throwing', () => {
    const video = document.createElement('video')
    expect(detachStreamFromVideo(video)).toBe(true)
    expect(detachStreamFromVideo(null)).toBe(false)
  })
})

describe('face protection before upload', () => {
  it('does not report protection when automatic masking fails', () => {
    const outcome = getFaceProtectionOutcome('auto', [])

    expect(outcome.applied).toBe(false)
    expect(outcome.bakedIntoPixels).toBe(false)
    expect(outcome.status).toBe('unavailable')
    expect(outcome.label).not.toContain('✓')
    expect(shouldBlockAnalysisForFaceProtection('auto', outcome.status)).toBe(true)
  })

  it('bakes the mask into canvas pixels so the upload uses the masked frame', () => {
    const drawImage = vi.fn()
    const canvas = {
      getContext: () => ({
        beginPath: vi.fn(),
        canvas: { height: 200, width: 100 },
        drawImage,
        ellipse: vi.fn(),
        fill: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
      }),
      height: 200,
      width: 100,
    }

    const outcome = applyFaceProtectionToCanvas(canvas, {
      faces: [{ boundingBox: { height: 40, width: 40, x: 20, y: 10 } }],
      mode: 'blur',
    })

    expect(outcome.bakedIntoPixels).toBe(true)
    expect(drawImage).toHaveBeenCalled()
  })

  it('leaves pixels untouched when the user picked no mask', () => {
    const drawImage = vi.fn()
    const canvas = { getContext: () => ({ drawImage }), height: 200, width: 100 }

    const outcome = applyFaceProtectionToCanvas(canvas, { faces: [], mode: 'none' })

    expect(outcome.applied).toBe(false)
    expect(drawImage).not.toHaveBeenCalled()
  })
})

describe('no hidden capture paths in Smart Camera source', () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

  it('never records video or uploads frames from the Smart Camera feature', () => {
    const files = [
      'src/features/smart-camera/components/SmartCameraStage.jsx',
      'src/features/smart-camera/components/SmartCameraLiveView.jsx',
      'src/features/smart-camera/components/SmartCameraModeViews.jsx',
      'src/features/smart-camera/components/ForgottenItemsCheck.jsx',
      'src/features/smart-camera/forgottenCheckGuide.js',
      'src/features/shared/camera/cameraSession.js',
    ]

    files.forEach((file) => {
      const source = read(file)
      expect(source).not.toMatch(/MediaRecorder/)
      expect(source).not.toMatch(/fetch\(/)
      expect(source).not.toMatch(/FormData/)
      expect(source).not.toMatch(/toDataURL|toBlob/)
      expect(source).not.toMatch(/geolocation/)
      expect(source).not.toMatch(/audio:\s*true/)
      expect(source).not.toMatch(/console\.(log|info|warn|error|debug)/)
    })
  })

  it('keeps Family Safety and walkie-talkie inert while disabled', () => {
    const family = read('src/features/family-safety/familySafetyFeature.js')
    const walkie = read('src/features/walkie/walkieFeature.js')

    ;[family, walkie].forEach((source) => {
      expect(source).not.toMatch(/getUserMedia|geolocation|watchPosition|fetch\(|WebSocket/)
    })
    expect(family).toContain('enabledByDefault: false')
    expect(walkie).toContain('enabledByDefault: false')
  })
})
