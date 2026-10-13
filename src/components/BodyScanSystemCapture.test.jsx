/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { changeAppLanguage } from '../i18n/index.js'
import {
  bindHomeSystemCameraInput,
  openHomeSystemCamera,
  readHomeBodyScanSession,
  resetHomeBodyScanSession,
} from '../services/homeBodyScanSession.js'

vi.mock('../services/bodyAnalysisVideoScan.js', async () => {
  const actual = await vi.importActual('../services/bodyAnalysisVideoScan.js')
  return {
    ...actual,
    reencodeImageFileToScanFile: vi.fn(async (file, pose) => ({
      file: new File([file], `body-scan-${pose}.jpg`, { type: 'image/jpeg' }),
      preview: `data:image/jpeg;base64,${pose}`,
    })),
  }
})

import BodyScanSystemCapture from './BodyScanSystemCapture.jsx'

function renderCapture(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const onPhotoChange = props.onPhotoChange || vi.fn()
  const onAnalyze = props.onAnalyze || vi.fn()
  const photos = props.photos || { front: null, side: null, back: null }

  act(() => {
    root.render(
      <BodyScanSystemCapture
        canAnalyze={Boolean(props.canAnalyze)}
        currentAnalysisStatus=""
        disabledReason=""
        photos={photos}
        onAnalyze={onAnalyze}
        onPhotoChange={onPhotoChange}
      />,
    )
  })

  return {
    container,
    onAnalyze,
    onPhotoChange,
    rerender(nextPhotos) {
      act(() => {
        root.render(
          <BodyScanSystemCapture
            canAnalyze={Boolean(props.canAnalyze)}
            currentAnalysisStatus=""
            disabledReason=""
            photos={nextPhotos}
            onAnalyze={onAnalyze}
            onPhotoChange={onPhotoChange}
          />,
        )
      })
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('BodyScanSystemCapture', () => {
  beforeEach(async () => {
    resetHomeBodyScanSession()
    await changeAppLanguage('sv')
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  })

  it('uses the system camera input and does not start the live camera', () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    const { container, unmount } = renderCapture()
    const input = container.querySelector('input[type="file"]')

    expect(input.getAttribute('capture')).toBe('environment')
    expect(input.getAttribute('accept')).toBe('image/*')
    expect(container.textContent).toContain('Ta bilden Framifrån')
    expect(container.textContent).toContain('Öppna kameran')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled()
    unmount()
  })

  it('keeps the first photo when the next camera is cancelled and waits for another tap', async () => {
    const onPhotoChange = vi.fn()
    const { container, rerender, unmount } = renderCapture({ onPhotoChange })
    const input = container.querySelector('input[type="file"]')
    const file = new File(['front'], 'front.jpg', { type: 'image/jpeg' })

    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onPhotoChange).toHaveBeenCalledWith(expect.any(File), 'front', 'data:image/jpeg;base64,front')
    const saved = { file: onPhotoChange.mock.calls[0][0], name: 'front.jpg', preview: 'data:image/jpeg;base64,front' }
    rerender({ front: saved, side: null, back: null })

    expect(container.textContent).toContain('Nästa bild: Från sidan')
    expect(container.textContent).toContain('Ta nästa bild')
    expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled()

    act(() => {
      container.querySelector('input[type="file"]').dispatchEvent(new Event('cancel', { bubbles: true }))
    })

    expect(readHomeBodyScanSession().photos.front?.file).toBe(saved.file)
    expect(container.textContent).toContain('Ingen bild togs')
    expect(container.textContent).toContain('Framifrån sparad')
    unmount()
  })

  it('restores photos from the same session after the view is closed', () => {
    const file = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
    const photos = { front: { file, name: file.name, preview: 'data:image/jpeg;base64,front' }, side: null, back: null }
    const { container, unmount } = renderCapture({ photos })

    expect(container.textContent).toContain('Framifrån sparad')
    expect(container.textContent).toContain('Nästa bild: Från sidan')
    unmount()
  })

  it('opens the bound system camera input from the Home tap handler', () => {
    const input = document.createElement('input')
    document.body.append(input)
    bindHomeSystemCameraInput(input)

    expect(openHomeSystemCamera()).toBe(true)
    expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(1)
    input.remove()
    bindHomeSystemCameraInput(null)
  })
})
