/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BodyAnalysisVideoScanner from './BodyAnalysisVideoScanner.jsx'
import { BODY_SCAN_SESSION_CLASS } from '../services/bodyScanSessionChrome.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createStream() {
  const stop = vi.fn()
  const track = {
    enabled: true,
    getCapabilities: () => ({}),
    kind: 'video',
    muted: false,
    readyState: 'live',
    stop,
  }
  return {
    active: true,
    getTracks: () => [track],
    getVideoTracks: () => [track],
    stop,
  }
}

const mounted = []

function renderScanner(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <BodyAnalysisVideoScanner
        analysisError=""
        disabledReason=""
        hasApprovedAnalysis
        isFreeLimitReached={false}
        isAnalyzing={false}
        photos={{}}
        onAnalyze={props.onAnalyze || (() => {})}
        onPhotoChange={props.onPhotoChange || (() => {})}
      />,
    )
  })
  const entry = {
    container,
    root,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
  mounted.push(entry)
  return entry
}

describe('BodyAnalysisVideoScanner runtime', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue()
    navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(createStream()),
    }
  })

  afterEach(() => {
    mounted.splice(0).forEach((entry) => entry.unmount())
    document.getElementById('vk-body-scan-portal')?.remove()
    document.documentElement.classList.remove(BODY_SCAN_SESSION_CLASS)
    document.body.classList.remove(BODY_SCAN_SESSION_CLASS)
    vi.restoreAllMocks()
  })

  function findButton(scope, text) {
    return [...scope.querySelectorAll('button')].find((button) => button.textContent.trim() === text)
  }

  /** Opens the consent step (step 1) without touching the camera. */
  async function openSetup(container) {
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Starta videoscanning'))
    await act(async () => {
      start.click()
      await Promise.resolve()
    })
  }

  /** Walks steps 1-3 (consent -> instructions) and starts the camera at step 4. */
  async function startScan(container) {
    await openSetup(container)

    const consentBox = document.querySelector('.body-scan-consent-check input')
    await act(async () => {
      consentBox.click()
      await Promise.resolve()
    })
    await act(async () => {
      findButton(document, 'Fortsätt').click()
      await Promise.resolve()
    })
    await act(async () => {
      findButton(document, 'Starta kameran').click()
      await Promise.resolve()
    })
  }

  async function waitFor(assertion) {
    let lastError
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        assertion()
        return
      } catch (error) {
        lastError = error
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
      }
    }
    throw lastError
  }

  it('opens active scan in a stable portal, hides nav via session class, and can cancel then start again', async () => {
    const { container } = renderScanner()
    await startScan(container)

    const overlay = document.querySelector('.body-scan-active-overlay')
    expect(overlay).not.toBeNull()
    expect(document.getElementById('vk-body-scan-portal')?.contains(overlay)).toBe(true)
    expect(document.documentElement.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(true)
    expect(document.body.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(true)
    expect(overlay.textContent).toContain('AUTO')
    expect(overlay.textContent).toContain('MANUELL')
    expect(overlay.querySelector('[aria-label="Röstguide"]')).not.toBeNull()

    const auto = [...overlay.querySelectorAll('button')].find((button) => button.textContent === 'AUTO')
    const manual = [...overlay.querySelectorAll('button')].find((button) => button.textContent === 'MANUELL')
    await act(async () => {
      auto.click()
      manual.click()
    })
    expect([...overlay.querySelectorAll('button')].some((button) => button.textContent === 'Jag står rätt i ramen')).toBe(true)

    await act(async () => {
      [...overlay.querySelectorAll('button')].find((button) => button.textContent.includes('Avbryt')).click()
    })
    expect(document.querySelector('.body-scan-active-overlay')).toBeNull()
    expect(document.documentElement.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(false)

    await startScan(container)
    const overlayAgain = document.querySelector('.body-scan-active-overlay')
    expect(overlayAgain).not.toBeNull()
    expect(document.getElementById('vk-body-scan-portal')?.contains(overlayAgain)).toBe(true)
    await act(async () => {
      [...overlayAgain.querySelectorAll('button')].find((button) => button.textContent.includes('Avbryt')).click()
    })
    expect(document.querySelector('.body-scan-active-overlay')).toBeNull()
  })

  it('connects the MediaStream to the portal video with iPhone-safe playback attributes', async () => {
    const stream = createStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream)
    const { container } = renderScanner()
    await startScan(container)

    await waitFor(() => {
      const video = document.querySelector('.body-scan-video-frame video')
      expect(video).not.toBeNull()
      expect(video.srcObject).toBe(stream)
      expect(video.autoplay).toBe(true)
      expect(video.playsInline).toBe(true)
      expect(video.muted).toBe(true)
    })
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
  })

  it('does not stop an active stream during ordinary active-scan re-renders', async () => {
    const stream = createStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream)
    const { container } = renderScanner()
    await startScan(container)
    await waitFor(() => expect(document.querySelector('.body-scan-video-frame video')?.srcObject).toBe(stream))

    const overlay = document.querySelector('.body-scan-active-overlay')
    await act(async () => {
      overlay.querySelector('[aria-label="Röstguide"]').click()
      await Promise.resolve()
    })

    expect(stream.stop).not.toHaveBeenCalled()
    expect(stream.getVideoTracks()[0].stop).not.toHaveBeenCalled()
    expect(document.querySelector('.body-scan-video-frame video')?.srcObject).toBe(stream)
  })

  it('shows a retry fallback when video playback is rejected without logging image data', async () => {
    HTMLMediaElement.prototype.play = vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    const { container } = renderScanner()
    await startScan(container)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Kameran startade men förhandsvisningen kunde inte visas.')
      expect([...document.querySelectorAll('.body-scan-preview-error button')].map((button) => button.textContent)).toEqual([
        'Försök igen',
        'Vänd kamera',
        'Avbryt',
      ])
    })
  })

  it('switches camera by binding the new stream before stopping the previous stream', async () => {
    const firstStream = createStream()
    const secondStream = createStream()
    navigator.mediaDevices.getUserMedia = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream)
    const { container } = renderScanner()
    await startScan(container)
    await waitFor(() => expect(document.querySelector('.body-scan-video-frame video')?.srcObject).toBe(firstStream))

    await act(async () => {
      [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Kamera')).click()
      await Promise.resolve()
    })

    await waitFor(() => expect(document.querySelector('.body-scan-video-frame video')?.srcObject).toBe(secondStream))
    expect(firstStream.stop).toHaveBeenCalled()
    expect(secondStream.stop).not.toHaveBeenCalled()
  })

  it('does not touch the camera until consent is given in step 1', async () => {
    const { container } = renderScanner()
    await openSetup(container)

    // Step 1 is on screen and getUserMedia has not been called at all.
    expect(document.querySelector('.body-scan-setup')).not.toBeNull()
    expect(document.body.textContent).toContain('Samtycke och integritet')
    expect(document.body.textContent).toContain('Mikrofonen används aldrig')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()

    // Continue stays disabled until the checkbox is ticked.
    const proceed = findButton(document, 'Fortsätt')
    expect(proceed.disabled).toBe(true)
    await act(async () => {
      proceed.click()
      await Promise.resolve()
    })
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()

    await act(async () => {
      document.querySelector('.body-scan-consent-check input').click()
      await Promise.resolve()
    })
    await act(async () => {
      findButton(document, 'Fortsätt').click()
      await Promise.resolve()
    })

    // Step 3 shows the preparation guidance, still without opening the camera.
    expect(document.body.textContent).toContain('Så förbereder du rummet')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()

    await act(async () => {
      findButton(document, 'Starta kameran').click()
      await Promise.resolve()
    })
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
  })

  it('always requests the camera without a microphone', async () => {
    const { container } = renderScanner()
    await startScan(container)

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    navigator.mediaDevices.getUserMedia.mock.calls.forEach(([constraints]) => {
      expect(constraints.audio).toBe(false)
    })
  })

  it('aborting the consent step never opens the camera and reports it', async () => {
    const { container } = renderScanner()
    await openSetup(container)
    await act(async () => {
      findButton(document, '← Avbryt').click()
      await Promise.resolve()
    })

    expect(document.querySelector('.body-scan-setup')).toBeNull()
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Kameran startades aldrig')
  })

  it('shows an off-state camera indicator before a scan starts', () => {
    const { container } = renderScanner()
    const indicator = container.querySelector('.body-scan-camera-indicator')
    expect(indicator).not.toBeNull()
    expect(indicator.className).toContain('is-off')
    expect(indicator.textContent).toContain('Kameran är avstängd')
  })

  it('offers pause, cancel-countdown and delete controls during an active scan', async () => {
    const { container } = renderScanner()
    await startScan(container)

    const overlay = document.querySelector('.body-scan-active-overlay')
    const labels = [...overlay.querySelectorAll('.body-scan-flow-controls button')]
      .map((button) => button.textContent.trim())
    expect(labels).toContain('Pausa')
    expect(labels).toContain('Ta om vyn')
    expect(labels).toContain('Radera allt')
  })

  it('stops every camera track when the scan is cancelled', async () => {
    const stream = createStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream)
    const { container } = renderScanner()
    await startScan(container)
    await waitFor(() => expect(document.querySelector('.body-scan-video-frame video')?.srcObject).toBe(stream))

    await act(async () => {
      findButton(document, '← Avbryt').click()
      await Promise.resolve()
    })

    expect(stream.getVideoTracks()[0].stop).toHaveBeenCalled()
    expect(container.textContent).toContain('Kameran är avstängd')
  })

  it('cleans session chrome and does not leave intervals after unmount', async () => {
    const { container, unmount } = renderScanner()
    await startScan(container)
    expect(document.documentElement.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(true)
    unmount()
    expect(document.documentElement.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(false)
    expect(document.body.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(false)
  })
})
