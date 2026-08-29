/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BodyScanGuidedCapture from './BodyScanGuidedCapture.jsx'
import { changeAppLanguage } from '../i18n/index.js'

function createStream(zoomCapabilities) {
  const stop = vi.fn()
  const track = {
    kind: 'video',
    stop,
    getCapabilities: zoomCapabilities ? () => ({ zoom: zoomCapabilities }) : undefined,
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  }
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }
}

function renderCapture(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const onPhotoChange = props.onPhotoChange || vi.fn()
  const onAnalyze = props.onAnalyze || vi.fn()

  act(() => {
    root.render(
      <BodyScanGuidedCapture
        canAnalyze={Boolean(props.canAnalyze)}
        currentAnalysisStatus={props.currentAnalysisStatus || ''}
        disabledReason={props.disabledReason || ''}
        photos={props.photos ?? {}}
        onAnalyze={onAnalyze}
        onPhotoChange={onPhotoChange}
      />,
    )
  })

  return {
    container,
    onAnalyze,
    onPhotoChange,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function findButton(container, text) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent.trim() === text)
}

function stubCanvasCapture(container) {
  const video = container.querySelector('video')
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 100 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 150 })
  const canvas = container.querySelector('canvas')
  canvas.getContext = () => ({ drawImage: vi.fn() })
  canvas.toDataURL = () => 'data:image/jpeg;base64,xx'
  canvas.toBlob = (callback) => callback(new Blob(['img'], { type: 'image/jpeg' }))
}

describe('BodyScanGuidedCapture', () => {
  let getUserMedia
  let stream

  beforeEach(async () => {
    await changeAppLanguage('sv')
    stream = createStream()
    getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue()
  })

  afterEach(() => {
    document.body.replaceChildren()
    document.body.classList.remove('vk-body-scan-session')
    document.documentElement.classList.remove('vk-body-scan-session')
    vi.useRealTimers()
  })

  it('never requests the camera before Starta kameran is tapped', () => {
    const { container, unmount } = renderCapture()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(container.textContent).toContain('1 av 5 · Förbered')
    expect(container.textContent).toContain('Placera mobilen stadigt')
    unmount()
  })

  it('requires an explicit tap to start the first photo, with audio:false', async () => {
    const { container, unmount } = renderCapture()

    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    expect(container.textContent).toContain('2 av 5 · Framifrån')
    expect(findButton(container, 'Starta första bilden')).toBeTruthy()
    unmount()
  })

  it('auto-advances through side and back with voice and timer, capturing all three photos', async () => {
    const onPhotoChange = vi.fn()
    const { container, unmount } = renderCapture({ onPhotoChange })

    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    stubCanvasCapture(container)

    vi.useFakeTimers()
    act(() => {
      findButton(container, 'Starta första bilden').click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(onPhotoChange).toHaveBeenCalledWith(expect.anything(), 'front', 'data:image/jpeg;base64,xx')
    expect(container.textContent).toContain('3 av 5 · Höger sida')
    expect(window.speechSynthesis.speak).toHaveBeenCalled()

    // Side auto-starts its own countdown - no extra start button needed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(onPhotoChange).toHaveBeenCalledWith(expect.anything(), 'side', 'data:image/jpeg;base64,xx')
    expect(container.textContent).toContain('4 av 5 · Bakifrån')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(onPhotoChange).toHaveBeenCalledWith(expect.anything(), 'back', 'data:image/jpeg;base64,xx')
    expect(container.textContent).toContain('5 av 5 · Granska')
    expect(onPhotoChange).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
    unmount()
  })

  it('reads each voice instruction only once per step even across rerenders', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onPhotoChange = vi.fn()

    function renderNow(status) {
      act(() => {
        root.render(
          <BodyScanGuidedCapture
            canAnalyze={false}
            currentAnalysisStatus={status || ''}
            disabledReason=""
            photos={{}}
            onAnalyze={() => {}}
            onPhotoChange={onPhotoChange}
          />,
        )
      })
    }

    renderNow()
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1)

    // A parent rerender that leaves the step unchanged must not repeat the line.
    renderNow('Förbereder...')
    renderNow('Fortfarande redo...')
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
    container.remove()
  })

  it('pause stops the countdown and blocks capture; resume continues it', async () => {
    const onPhotoChange = vi.fn()
    const { container, unmount } = renderCapture({ onPhotoChange })
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    stubCanvasCapture(container)

    vi.useFakeTimers()
    act(() => {
      findButton(container, 'Starta första bilden').click()
    })
    act(() => {
      findButton(container, 'Pausa').click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(onPhotoChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain('2 av 5 · Framifrån')

    act(() => {
      findButton(container, 'Fortsätt').click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(onPhotoChange).toHaveBeenCalledWith(expect.anything(), 'front', expect.any(String))

    vi.useRealTimers()
    unmount()
  })

  it('shows only the zoom levels the real camera capabilities report, never a CSS-only fallback', async () => {
    stream = createStream({ min: 1, max: 1 })
    getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })

    const { container, unmount } = renderCapture()
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.body-scan-guided-zoom')).toBeNull()
    expect(container.textContent).not.toContain('0,5×')
    expect(container.textContent).not.toContain('2×')
    unmount()
  })

  it('offers real zoom levels supported by the track and applies them via constraints, not CSS', async () => {
    stream = createStream({ min: 0.5, max: 2 })
    getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })

    const { container, unmount } = renderCapture()
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('0,5×')
    expect(container.textContent).toContain('2×')
    const track = stream.getVideoTracks()[0]

    await act(async () => {
      findButton(container, '2×').click()
      await Promise.resolve()
    })
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] })

    const video = container.querySelector('video')
    expect(video.style.transform).toBe('')
    unmount()
  })

  it('shows all three photos in review and only calls analyze on explicit press', async () => {
    const onAnalyze = vi.fn()
    // The component reports captures via onPhotoChange - mirror BodyAnalysisCard's
    // real wiring by feeding each capture straight back into the photos prop.
    let photos = {}
    const onPhotoChange = vi.fn((file, view, preview) => {
      photos = { ...photos, [view]: file ? { preview } : null }
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    function renderNow() {
      act(() => {
        root.render(
          <BodyScanGuidedCapture
            canAnalyze
            currentAnalysisStatus=""
            disabledReason=""
            photos={photos}
            onAnalyze={onAnalyze}
            onPhotoChange={onPhotoChange}
          />,
        )
      })
    }

    renderNow()
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    stubCanvasCapture(container)

    vi.useFakeTimers()
    act(() => {
      findButton(container, 'Starta första bilden').click()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    renderNow()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    renderNow()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    renderNow()

    expect(container.textContent).toContain('5 av 5 · Granska')
    expect(container.querySelectorAll('.body-scan-guided-thumbnails img').length).toBe(3)
    expect(onAnalyze).not.toHaveBeenCalled()

    act(() => {
      findButton(container, 'Analysera kroppen').click()
    })
    expect(onAnalyze).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
    act(() => root.unmount())
    container.remove()
  })

  it('stops camera, timers and speech on unmount (Avbryt)', async () => {
    const { container, unmount } = renderCapture()
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    const track = stream.getVideoTracks()[0]

    vi.useFakeTimers()
    act(() => {
      findButton(container, 'Starta första bilden').click()
    })
    unmount()

    expect(track.stop).toHaveBeenCalled()
    expect(window.speechSynthesis.cancel).toHaveBeenCalled()
    expect(document.body.classList.contains('vk-body-scan-session')).toBe(false)
    vi.useRealTimers()
  })

  it('never asks for a microphone', async () => {
    const { container, unmount } = renderCapture()
    await act(async () => {
      findButton(container, 'Starta kameran').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    unmount()
  })
})
