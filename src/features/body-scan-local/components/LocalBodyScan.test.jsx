/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalModelUnavailableError } from '../localPoseModel.js'
import { getLocalBodyScanStorageKey, loadLocalScanRecords } from '../localBodyScanStore.js'
import LocalBodyScan from './LocalBodyScan.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const scope = { kind: 'authenticated', storageId: 'user.local-test', userId: 'local-test' }

// Samma syntetiska kropp som i metrics-testet (600x1000).
function frontLandmarks() {
  const points = Array.from({ length: 33 }, () => ({ visibility: 0.9, x: 0.5, y: 0.5, z: 0 }))
  const set = (index, x, y) => { points[index] = { visibility: 0.99, x, y, z: 0 } }
  // Framifrån: personens vänstra sida syns till höger i bilden.
  set(0, 0.5, 0.1); set(7, 0.52, 0.1); set(8, 0.48, 0.1)
  set(11, 0.65, 0.22); set(12, 0.35, 0.22)
  set(23, 0.58, 0.52); set(24, 0.42, 0.52)
  set(25, 0.55, 0.72); set(26, 0.45, 0.72)
  set(27, 0.55, 0.92); set(28, 0.45, 0.92)
  set(15, 0.8, 0.5); set(16, 0.2, 0.5)
  return points
}

function frontMask() {
  const data = new Float32Array(600 * 1000)
  for (let y = 200; y < 900; y += 1) {
    const width = y < 380 ? 200 : y < 470 ? 160 : 210
    for (let x = 300 - width / 2; x < 300 + width / 2; x += 1) data[y * 600 + x] = 1
  }
  return { data, height: 1000, width: 600 }
}

function createFakeStream() {
  const track = { kind: 'video', readyState: 'live', stop: vi.fn(function stop() { this.readyState = 'ended' }) }
  return { getTracks: () => [track], getVideoTracks: () => [track], track }
}

let spies
let stream
let view

function mount(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(<LocalBodyScan scope={scope} {...props} />))
  return {
    click(text) {
      const button = [...container.querySelectorAll('button')].find((node) => node.textContent.includes(text))
      if (!button) throw new Error(`Button not found: ${text}`)
      act(() => button.click())
    },
    container,
    async flush() {
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function captureFront() {
  view.click('Starta lokal analys')
  await view.flush()
  await view.flush()
  const video = view.container.querySelector('video')
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 600 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1000 })
  view.click('Analysera framifrån')
  act(() => vi.advanceTimersByTime(3000))
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.sessionStorage.clear()
  stream = createFakeStream()
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(32 * 32 * 4).fill(128) })),
  }
  spies = {
    caches: vi.fn(),
    createObjectURL: vi.fn(),
    fetch: vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('network blocked in test'))),
    getContext: vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context),
    getUserMedia: vi.fn(async () => stream),
    indexedDB: vi.fn(),
    sendBeacon: vi.fn(),
    toBlob: vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {}),
    toDataURL: vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => ''),
    xhrOpen: vi.spyOn(XMLHttpRequest.prototype, 'open'),
  }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: spies.getUserMedia } })
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: spies.sendBeacon })
  Object.defineProperty(window, 'caches', { configurable: true, value: { open: spies.caches } })
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: spies.indexedDB } })
  URL.createObjectURL = spies.createObjectURL
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => {
  view?.unmount()
  view = null
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function expectNoImageEgressOrStorage() {
  expect(spies.fetch).not.toHaveBeenCalled()
  expect(spies.xhrOpen).not.toHaveBeenCalled()
  expect(spies.sendBeacon).not.toHaveBeenCalled()
  expect(spies.toDataURL).not.toHaveBeenCalled()
  expect(spies.toBlob).not.toHaveBeenCalled()
  expect(spies.createObjectURL).not.toHaveBeenCalled()
  expect(spies.caches).not.toHaveBeenCalled()
  expect(spies.indexedDB).not.toHaveBeenCalled()
  expect(window.sessionStorage.length).toBe(0)
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const value = window.localStorage.getItem(window.localStorage.key(index))
    expect(value).not.toMatch(/data:image|blob:|base64/)
  }
}

describe('LocalBodyScan', () => {
  it('shows that local analysis is unavailable when the model fails – no mock result, no camera', async () => {
    const createAnalyzer = vi.fn(async () => { throw new LocalModelUnavailableError('load-failed', 'nope') })
    view = mount({ createAnalyzer })
    view.click('Starta lokal analys')
    await view.flush()

    expect(view.container.textContent).toContain('Lokal analys är inte tillgänglig')
    expect(view.container.textContent).not.toContain('Resultat')
    expect(spies.getUserMedia).not.toHaveBeenCalled()
    expectNoImageEgressOrStorage()
  })

  it('analyzes on device, stops the camera when done and saves only approved values', async () => {
    const analyze = vi.fn(() => ({ landmarks: frontLandmarks(), mask: frontMask() }))
    const close = vi.fn()
    view = mount({
      createAnalyzer: async () => ({ analyze, close }),
      weights: [{ date: '2026-09-01', value: 84 }, { date: '2026-10-09', value: 83 }],
    })
    await captureFront()

    expect(analyze).toHaveBeenCalledTimes(1)
    expect(analyze.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement)
    // Bildrutan nollställs direkt efter analys.
    expect(analyze.mock.calls[0][0].width).toBe(0)
    expect(view.container.textContent).toContain('Vyn kunde analyseras')
    expect(stream.track.stop).not.toHaveBeenCalled()

    view.click('Avsluta och visa resultat')
    expect(stream.track.stop).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
    expect(view.container.querySelector('video')).toBeNull()

    const text = view.container.textContent
    expect(text).toContain('Ingen jämförelse ännu')
    expect(text).toContain('Senast registrerade vikt: 83,0 kg')
    expect(text).not.toMatch(/viktminskning|gått ner|kroppsfett\s*\d|\d+\s*cm|\d+\s*%/i)
    expect(window.localStorage.getItem(getLocalBodyScanStorageKey(scope))).toBeNull()

    view.click('Godkänn och spara analysvärden')
    const saved = loadLocalScanRecords(scope)
    expect(saved).toHaveLength(1)
    expect(Object.keys(saved[0].views)).toEqual(['front'])
    expectNoImageEgressOrStorage()
  })

  it('uses only the registered weight log for weight change', async () => {
    window.localStorage.setItem(getLocalBodyScanStorageKey(scope), JSON.stringify({
      scans: [{
        createdAt: '2026-09-01T08:00:00.000Z',
        id: 'local-a',
        modelVersion: 'mediapipe-pose-landmarker-lite@0.10.35',
        views: { front: { conditions: { bodyFraction: 0.82, luminance: 128, roll: 0 }, metrics: { waist: 0.2286 } } },
      }],
      version: 1,
    }))
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
    view = mount({
      createAnalyzer: async () => ({ analyze: () => ({ landmarks: frontLandmarks(), mask: frontMask() }), close() {} }),
      weights: [{ date: '2026-09-01', value: 84 }, { date: '2026-10-09', value: 83 }],
    })
    await captureFront()
    view.click('Avsluta och visa resultat')

    const text = view.container.textContent
    expect(text).toContain('Enligt din viktlogg')
    expect(text).toContain('84,0 kg')
    expect(text).toContain('83,0 kg')
    expect(text).toContain('Midjans kontur: ingen tydlig förändring')
    expect(text).not.toMatch(/viktminskning|gått ner/i)
  })

  it('stops the camera on unmount and when the app is hidden', async () => {
    view = mount({ createAnalyzer: async () => ({ analyze: vi.fn(), close: vi.fn() }) })
    view.click('Starta lokal analys')
    await view.flush()
    await view.flush()
    expect(spies.getUserMedia).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(stream.track.stop).toHaveBeenCalledTimes(1)
    expect(view.container.textContent).toContain('Kameran stängdes')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    stream = createFakeStream()
    view.click('Starta kameran igen')
    await view.flush()
    view.unmount()
    view = null
    expect(stream.track.stop).toHaveBeenCalledTimes(1)
  })
})

describe('LocalBodyScan – mobilens kamera, kamerabyte och gamla bilder', () => {
  it('analyzes a photo from the phone camera app locally and releases the file', async () => {
    const analyze = vi.fn(() => ({ landmarks: frontLandmarks(), mask: frontMask() }))
    const release = vi.fn()
    const readImageFile = vi.fn(async () => ({ canvas: document.createElement('canvas'), height: 1000, luminance: 130, release, width: 600 }))
    view = mount({ createAnalyzer: async () => ({ analyze, close: vi.fn() }), readImageFile })

    view.click('Använd mobilens kamera-app')
    await view.flush()
    await view.flush()
    expect(spies.getUserMedia).not.toHaveBeenCalled()

    const input = view.container.querySelector('input[type="file"]')
    expect(input.getAttribute('capture')).toBe('environment')
    expect(input.getAttribute('accept')).toBe('image/*')
    const openSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
    view.click('Öppna kamera-appen')
    expect(openSpy).toHaveBeenCalled()

    const file = new File([new Uint8Array([1, 2, 3])], 'kropp.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(readImageFile).toHaveBeenCalledWith(file)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalled()
    expect(input.value).toBe('')
    expect(view.container.textContent).toContain('Vyn kunde analyseras')
    expectNoImageEgressOrStorage()
  })

  it('switches between back and front camera and stops the previous stream', async () => {
    view = mount({ createAnalyzer: async () => ({ analyze: vi.fn(), close: vi.fn() }) })
    view.click('Starta lokal analys')
    await view.flush()
    await view.flush()
    const first = stream
    expect(spies.getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ ideal: 'environment' })

    stream = createFakeStream()
    view.click('Byt kamera')
    await view.flush()
    expect(first.track.stop).toHaveBeenCalled()
    expect(spies.getUserMedia.mock.calls[1][0].video.facingMode).toEqual({ ideal: 'user' })
    expect(spies.getUserMedia.mock.calls[1][0].audio).toBe(false)
    expect(view.container.querySelector('.local-body-scan-frame').className).toContain('is-mirrored')
    expect(view.container.textContent).toContain('Främre kamera')
    // Videon måste faktiskt kopplas till den nya strömmen.
    expect(view.container.querySelector('video').srcObject).toBe(stream)
  })

  it('removes old body images only after explicit confirmation', async () => {
    const legacy = JSON.stringify({
      analyses: [{
        createdAt: '2026-09-01T08:00:00.000Z',
        frontPhoto: { name: 'front.jpg', preview: 'data:image/jpeg;base64,AAAA' },
        result: { summary: 'Gammal analys' },
        userId: null,
      }],
      version: 1,
    })
    window.localStorage.setItem('viktkollen.bodyAnalysis.history.v1', legacy)
    view = mount({ createAnalyzer: async () => ({ analyze: vi.fn(), close: vi.fn() }) })

    expect(view.container.textContent).toContain('sparat 1 bildförhandsvisning')
    // Ingen automatisk rensning vid visning.
    expect(window.localStorage.getItem('viktkollen.bodyAnalysis.history.v1')).toBe(legacy)
    view.click('Ta bort gamla kroppsbilder')
    expect(window.localStorage.getItem('viktkollen.bodyAnalysis.history.v1')).toBe(legacy)
    view.click('Ja, ta bort gamla kroppsbilder')

    const cleaned = JSON.parse(window.localStorage.getItem('viktkollen.bodyAnalysis.history.v1'))
    expect(cleaned.analyses[0]).toEqual({
      createdAt: '2026-09-01T08:00:00.000Z',
      frontPhoto: { name: 'front.jpg' },
      result: { summary: 'Gammal analys' },
      userId: null,
    })
    expect(view.container.textContent).toContain('1 bild borttagen')
  })
})
