/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BodyAnalysisUploader from './BodyAnalysisUploader.jsx'

const completePhotos = {
  back: { name: 'back.jpg', preview: '/back.jpg' },
  front: { name: 'front.jpg', preview: '/front.jpg' },
  side: { name: 'side.jpg', preview: '/side.jpg' },
}

const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const source = readFileSync(resolve(process.cwd(), 'src/components/BodyAnalysisUploader.jsx'), 'utf8')

function createStream() {
  const stop = vi.fn()
  return {
    getTracks: () => [{ kind: 'video', stop }],
  }
}

function renderUploader(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <BodyAnalysisUploader
        canAnalyze={Boolean(props.canAnalyze)}
        currentAnalysisStatus={props.currentAnalysisStatus || 'Väntar på tre vinklar'}
        disabledReason={props.disabledReason || ''}
        photos={props.photos ?? {}}
        onAnalyze={props.onAnalyze || (() => {})}
        onPhotoChange={props.onPhotoChange || (() => {})}
      />,
    )
  })

  return {
    container,
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

async function clickAngle(container, label) {
  const button = container.querySelector(`[aria-label="Öppna scanning för ${label}"]`)
  await act(async () => {
    button.click()
    await new Promise((resolveDelay) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolveDelay, 90)
      })
    })
  })
}

describe('BodyAnalysisUploader', () => {
  let getUserMedia
  let firstStream
  let secondStream

  beforeEach(() => {
    firstStream = createStream()
    secondStream = createStream()
    getUserMedia = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValue(secondStream)

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders readable step states, capture target and camera controls', () => {
    const { container, unmount } = renderUploader()
    const front = container.querySelector('[aria-label="Öppna scanning för Framifrån"]')
    const side = container.querySelector('[aria-label="Öppna scanning för Från sidan"]')
    const back = container.querySelector('[aria-label="Öppna scanning för Bakifrån"]')

    expect(front.className).toContain('is-active')
    expect(front.getAttribute('data-state')).toBe('active')
    expect(side.className).toContain('is-waiting')
    expect(side.getAttribute('data-state')).toBe('waiting')
    expect(back.getAttribute('data-state')).toBe('waiting')
    expect(container.querySelector('#body-scan-capture')).toBeTruthy()
    expect(container.querySelector('#body-scan-camera')).toBeTruthy()
    expect(container.textContent).toContain('Vänd kamera')
    expect(container.textContent).toContain('Bakre kamera')
    expect(container.textContent).toContain('Starta kamera')
    expect(container.textContent).toContain('Ta bild')
    expect(container.textContent).toContain('Välj bild')
    unmount()
  })

  it('keeps iPhone-safe file capture fallback for the active body scan step', () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    })
    const { container, unmount } = renderUploader()
    const html = container.innerHTML

    expect(html).toContain('Steg 1 av 3')
    expect(html).toContain('class="secondary-button body-scan-file-picker"')
    expect(html).toContain('for="body-scan-file-front"')
    expect(html).toContain('id="body-scan-file-front"')
    expect(html).toContain('type="file"')
    expect(html).toContain('accept="image/*"')
    expect(html).toContain('capture="environment"')
    expect(html).toContain('iPhone kan fortfarande ta eller välja bild')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('display: none')
    unmount()
  })

  it('marks all three body scan angles complete and enables analysis when photos exist', () => {
    const { container, unmount } = renderUploader({
      canAnalyze: true,
      currentAnalysisStatus: 'Redo att analysera',
      photos: completePhotos,
    })
    const html = container.innerHTML

    expect(html).toContain('3/3 klara')
    expect(html).toContain('front.jpg')
    expect(html).toContain('side.jpg')
    expect(html).toContain('back.jpg')
    expect(html).toContain('Analysera kroppen')
    expect(html).toContain('Ta om')
    expect(html).toContain('Ta om Framifrån')
    expect(html).not.toContain('disabled=""')
    expect(container.querySelector('[data-state="active"]').className).toContain('is-active')
    expect(container.querySelector('[aria-label="Öppna scanning för Från sidan"]').getAttribute('data-state')).toBe('done')
    unmount()
  })

  it('scrolls to the camera capture area when a step is pressed', async () => {
    const { container, unmount } = renderUploader()
    const capture = container.querySelector('#body-scan-capture')
    capture.getBoundingClientRect = () => ({
      top: 640,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
    })

    await clickAngle(container, 'Framifrån')
    expect(window.scrollTo).toHaveBeenCalled()
    expect(capture.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    })

    window.scrollTo.mockClear()
    capture.scrollIntoView.mockClear()
    await clickAngle(container, 'Från sidan')
    expect(window.scrollTo).toHaveBeenCalled()
    expect(capture.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    })

    window.scrollTo.mockClear()
    capture.scrollIntoView.mockClear()
    await clickAngle(container, 'Bakifrån')
    expect(window.scrollTo).toHaveBeenCalled()
    expect(capture.scrollIntoView).toHaveBeenCalled()
    unmount()
  })

  it('flips the camera, stops the old stream and keeps the active view and photos', async () => {
    const onPhotoChange = vi.fn()
    const { container, unmount } = renderUploader({
      photos: { front: completePhotos.front },
      onPhotoChange,
    })

    await clickAngle(container, 'Från sidan')
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    expect(container.querySelector('#body-scan-step-title').textContent).toBe('Från sidan')
    expect(container.textContent).toContain('Bakre kamera')
    expect(container.textContent).toContain('front.jpg')

    const flip = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Vänd kamera')
    await act(async () => {
      flip.click()
      await Promise.resolve()
    })

    expect(firstStream.getTracks()[0].stop).toHaveBeenCalled()
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'user' } },
    })
    expect(container.querySelector('#body-scan-step-title').textContent).toBe('Från sidan')
    expect(container.textContent).toContain('Främre kamera')
    expect(container.textContent).toContain('front.jpg')
    expect(onPhotoChange).not.toHaveBeenCalled()

    await act(async () => {
      flip.click()
      await Promise.resolve()
    })

    expect(secondStream.getTracks()[0].stop).toHaveBeenCalled()
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    expect(container.textContent).toContain('Bakre kamera')
    expect(container.querySelector('.body-scan-capture-button').textContent).toBe('Ta bild')
    expect(container.querySelector('.body-scan-capture-button').disabled).toBe(false)
    unmount()
  })

  it('stops the camera stream on unmount', async () => {
    const { container, unmount } = renderUploader()
    await clickAngle(container, 'Framifrån')
    expect(getUserMedia).toHaveBeenCalled()
    unmount()
    expect(firstStream.getTracks()[0].stop).toHaveBeenCalled()
  })

  it('keeps high-contrast step colors and camera scroll margins in CSS', () => {
    expect(css).toContain("button.body-scan-step[data-state='active']")
    expect(css).toContain('linear-gradient(90deg, #7af7ff 0%, #c9b8ff 100%)')
    expect(css).toContain("button.body-scan-step[data-state='waiting']")
    expect(css).toContain('color: #eaf2ff')
    expect(css).toContain("button.body-scan-step[data-state='done']")
    expect(css).toContain('linear-gradient(90deg, #66ffae 0%, #38f7ff 100%)')
    expect(css).toContain('.body-scan-capture {')
    expect(source).toContain('scrollBodyScanCameraIntoView')
    expect(css).toContain('scroll-margin-bottom: calc(var(--vk-nav-height) + 26px + env(safe-area-inset-bottom, 0px))')
  })
})
