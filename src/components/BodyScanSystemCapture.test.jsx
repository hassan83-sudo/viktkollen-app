/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { changeAppLanguage } from '../i18n/index.js'
import {
  bindHomeSystemCameraInput,
  getPreferredBodyScanAngle,
  openHomeSystemCamera,
  readHomeBodyScanSession,
  resetHomeBodyScanSession,
  saveHomeBodyScanPhoto,
  setPreferredBodyScanAngle,
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

const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewDashboard.jsx'), 'utf8')

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
        disabledReason={props.disabledReason || ''}
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
    rerender(nextPhotos, extra = {}) {
      act(() => {
        root.render(
          <BodyScanSystemCapture
            canAnalyze={extra.canAnalyze ?? Boolean(props.canAnalyze)}
            currentAnalysisStatus=""
            disabledReason={extra.disabledReason ?? props.disabledReason ?? ''}
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

function fileInput(container) {
  return container.querySelector('input[type="file"]')
}

function chooseAngle(container, angle) {
  const radio = container.querySelector(`input[type="radio"][value="${angle}"]`)
  act(() => {
    radio.click()
  })
}

async function takePhoto(container, contents, name) {
  const input = fileInput(container)
  const file = new File([contents], name, { type: 'image/jpeg' })
  await act(async () => {
    input.closest('label').click()
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
  return file
}

describe('BodyScanSystemCapture', () => {
  beforeEach(async () => {
    resetHomeBodyScanSession()
    window.localStorage.removeItem('viktkollen.bodyScan.preferredAngle')
    await changeAppLanguage('sv')
  })

  it('shows the two angles and waits for Ta bild before opening the camera', () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { container, unmount } = renderCapture()
    const input = fileInput(container)

    expect(container.textContent).toContain('Välj vilken kroppsvinkel du vill fotografera')
    expect(container.textContent).toContain('0 av 2 bilder')
    expect(container.textContent).toContain('Framifrån')
    expect(container.textContent).toContain('Från sidan')
    expect(container.textContent).not.toContain('Bakifrån')
    expect(container.textContent).toContain('Ställ mobilen så att hela kroppen syns i bild, från huvudet till fötterna. Stå rakt och håll armarna lite från kroppen.')
    expect(container.textContent).toContain('Ta bild – Framifrån')
    expect(container.querySelector('fieldset')).toBeNull()
    expect(input.getAttribute('capture')).toBe('environment')
    expect(container.querySelector('button').disabled).toBe(true)
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
    expect(getPreferredBodyScanAngle()).toBeNull()
    expect(dashboardSource).toContain('if (angle)')
    expect(dashboardSource).toContain('openHomeSystemCamera(angle)')
    expect(dashboardSource).toContain('capture="environment"')
    expect(dashboardSource).not.toContain('getUserMedia')
    unmount()
  })

  it('remembers the photographed angle after restart and does not store the image', async () => {
    const first = renderCapture()
    await takePhoto(first.container, 'front', 'front.jpg')
    expect(window.localStorage.getItem('viktkollen.bodyScan.preferredAngle')).toBe('front')
    expect(readHomeBodyScanSession().photos.front.preview).toBe('data:image/jpeg;base64,front')
    first.unmount()

    resetHomeBodyScanSession()
    expect(readHomeBodyScanSession().photos.front).toBeNull()
    expect(window.localStorage.getItem('viktkollen.bodyScan.preferredAngle')).toBe('front')
    for (const key of Object.keys(window.localStorage)) {
      const value = window.localStorage.getItem(key)
      expect(value).not.toContain('data:image')
      expect(value).not.toContain('body-scan-front')
    }

    const second = renderCapture()
    expect(second.container.querySelector('input[value="front"]').checked).toBe(true)
    expect(second.container.textContent).toContain('Ta bild – Framifrån')
    expect(second.container.textContent).toContain('Välj vilken kroppsvinkel du vill fotografera')
    second.unmount()
  })

  it('opens the phone system camera from Home only for a saved angle', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.setAttribute('capture', 'environment')
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    bindHomeSystemCameraInput(input)

    expect(openHomeSystemCamera()).toBe(false)
    expect(click).not.toHaveBeenCalled()

    setPreferredBodyScanAngle('side')
    expect(openHomeSystemCamera()).toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
    expect(readHomeBodyScanSession().pendingAngle).toBe('side')
    expect(input.getAttribute('capture')).toBe('environment')
    click.mockRestore()
  })

  it('stores the new photo on the selected angle and keeps the earlier photo', async () => {
    const frontFile = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
    const frontPhoto = { file: frontFile, name: frontFile.name, preview: 'data:image/jpeg;base64,front' }
    saveHomeBodyScanPhoto('front', frontPhoto)
    const onPhotoChange = vi.fn()
    const { container, unmount } = renderCapture({
      onPhotoChange,
      photos: { front: frontPhoto, side: null, back: null },
    })

    chooseAngle(container, 'side')
    await takePhoto(container, 'side', 'side.jpg')

    expect(onPhotoChange).toHaveBeenCalledWith(expect.any(File), 'side', 'data:image/jpeg;base64,side')
    expect(readHomeBodyScanSession().photos.front.file).toBe(frontFile)
    expect(readHomeBodyScanSession().photos.side.file.name).toBe('body-scan-side.jpg')
    expect(readHomeBodyScanSession().photos.back).toBeNull()
    unmount()
  })

  it('keeps the angle from camera start while the image is still processing', async () => {
    const { reencodeImageFileToScanFile } = await import('../services/bodyAnalysisVideoScan.js')
    let finish
    reencodeImageFileToScanFile.mockImplementationOnce((file, pose) => new Promise((resolve) => {
      finish = () => resolve({
        file: new File([file], `body-scan-${pose}.jpg`, { type: 'image/jpeg' }),
        preview: `data:image/jpeg;base64,${pose}`,
      })
    }))
    const onPhotoChange = vi.fn()
    const { container, unmount } = renderCapture({ onPhotoChange })

    chooseAngle(container, 'side')
    const input = fileInput(container)
    let done
    act(() => {
      input.click()
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['side'], 'side.jpg', { type: 'image/jpeg' })],
      })
      done = input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    chooseAngle(container, 'front')
    await act(async () => {
      finish()
      await done
    })

    expect(onPhotoChange).toHaveBeenCalledWith(expect.any(File), 'side', 'data:image/jpeg;base64,side')
    expect(readHomeBodyScanSession().photos.side.preview).toBe('data:image/jpeg;base64,side')
    expect(readHomeBodyScanSession().photos.front).toBeNull()
    expect(readHomeBodyScanSession().photos.back).toBeNull()
    unmount()
  })

  it('stores front and side in either order, with the matching preview and side instruction', async () => {
    const onPhotoChange = vi.fn()
    const { container, rerender, unmount } = renderCapture({ onPhotoChange })

    chooseAngle(container, 'side')
    expect(container.textContent).toContain('Stå med sidan mot kameran')
    await takePhoto(container, 'side', 'side.jpg')
    rerender(readHomeBodyScanSession().photos)
    chooseAngle(container, 'front')
    await takePhoto(container, 'front', 'front.jpg')

    const session = readHomeBodyScanSession()
    expect(session.photos.side.file.name).toBe('body-scan-side.jpg')
    expect(session.photos.front.file.name).toBe('body-scan-front.jpg')
    expect(session.photos.back).toBeNull()
    expect(onPhotoChange.mock.calls.map((call) => call[1])).toEqual(['side', 'front'])

    rerender(session.photos)
    const preview = (alt) => container.querySelector(`img[alt="${alt}"]`).getAttribute('src')
    expect(preview('Från sidan')).toBe('data:image/jpeg;base64,side')
    expect(preview('Framifrån')).toBe('data:image/jpeg;base64,front')
    expect(container.textContent).toContain('2 av 2 bilder')

    const frontFile = session.photos.front.file
    chooseAngle(container, 'side')
    await takePhoto(container, 'side-2', 'side-2.jpg')
    expect(readHomeBodyScanSession().photos.side.file).not.toBe(session.photos.side.file)
    expect(readHomeBodyScanSession().photos.front.file).toBe(frontFile)
    unmount()
  })

  it('replaces only the chosen angle when a photo is retaken', async () => {
    const frontFile = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
    const sideFile = new File(['side'], 'side.jpg', { type: 'image/jpeg' })
    saveHomeBodyScanPhoto('front', { file: frontFile, name: frontFile.name, preview: 'data:image/jpeg;base64,front' })
    saveHomeBodyScanPhoto('side', { file: sideFile, name: sideFile.name, preview: 'data:image/jpeg;base64,side' })
    const photos = {
      front: readHomeBodyScanSession().photos.front,
      side: readHomeBodyScanSession().photos.side,
      back: null,
    }
    const onPhotoChange = vi.fn()
    const { container, unmount } = renderCapture({ onPhotoChange, photos })

    expect(container.textContent).toContain('Ta om bild – Framifrån')
    await takePhoto(container, 'front-2', 'front-2.jpg')

    expect(onPhotoChange).toHaveBeenCalledWith(expect.any(File), 'front', 'data:image/jpeg;base64,front')
    expect(readHomeBodyScanSession().photos.front.file).not.toBe(frontFile)
    expect(readHomeBodyScanSession().photos.side.file).toBe(sideFile)
    unmount()
  })

  it('keeps saved photos when the camera is cancelled', async () => {
    const frontFile = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
    saveHomeBodyScanPhoto('front', { file: frontFile, name: frontFile.name, preview: 'data:image/jpeg;base64,front' })
    const { container, unmount } = renderCapture({
      photos: { front: readHomeBodyScanSession().photos.front, side: null, back: null },
    })

    act(() => {
      fileInput(container).dispatchEvent(new Event('cancel', { bubbles: true }))
    })

    expect(readHomeBodyScanSession().photos.front.file).toBe(frontFile)
    expect(container.textContent).toContain('Ingen bild togs')
    expect(container.textContent).toContain('Framifrån')
    unmount()
  })

  it('starts analysis only after both photos, and keeps the quota block', () => {
    const photos = {
      front: { file: new File(['f'], 'f.jpg', { type: 'image/jpeg' }), preview: 'data:image/jpeg;base64,f' },
      side: null,
      back: null,
    }
    const onAnalyze = vi.fn()
    const { container, rerender, unmount } = renderCapture({
      canAnalyze: true,
      onAnalyze,
      photos,
      disabledReason: 'Kvotgränsen är nådd',
    })
    const analyze = () => [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Analysera kroppen'))

    expect(analyze().disabled).toBe(true)
    expect(container.textContent).toContain('Kvotgränsen är nådd')

    rerender({
      ...photos,
      side: { file: new File(['s'], 's.jpg', { type: 'image/jpeg' }), preview: 'data:image/jpeg;base64,s' },
    }, { canAnalyze: true, disabledReason: '' })
    expect(analyze().disabled).toBe(false)
    act(() => analyze().click())
    expect(onAnalyze).toHaveBeenCalledTimes(1)
    unmount()
  })
})
