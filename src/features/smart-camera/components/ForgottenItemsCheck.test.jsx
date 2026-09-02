/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return { ...actual, createPortal: (node) => node }
})

// The security-critical consent/token/network logic already has direct,
// thorough coverage in src/services/forgottenItemsAnalysis.test.js and
// api/forgotten-items-analysis/analysisConsent.test.js. Mocking the
// service here lets these component tests focus on what only rendering
// the real component chain can prove: that the UI never calls the AI
// service before an explicit "Skicka bilden för analys" tap, that a new
// capture is required for every attempt, that a service failure falls
// back to the manual check, and that AI + manual statuses render
// correctly merged in the result stage.
vi.mock('../../../services/forgottenItemsAnalysis.js', () => ({
  analyzeForgottenItemsPhoto: vi.fn(async () => ({ ok: false, reason: 'not_mocked' })),
}))

import SmartCameraStage from './SmartCameraStage.jsx'
import { getFeatureFlags } from '../../featureRegistry.js'
import { assertNoMissingClaim, formatUnseenItemMessage } from '../itemVisibility.js'
import { analyzeForgottenItemsPhoto } from '../../../services/forgottenItemsAnalysis.js'

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

// Makes SmartCameraLiveView's captureFrame() succeed (jsdom gives a
// freshly-created <video> zero dimensions and no real 2D context by
// default, which would otherwise make every capture fail closed before
// the consent UI ever appears). Only the canvas geometry plumbing is
// stubbed here - the AI service itself stays mocked above, so no real
// network/consent code runs in these component tests.
function stubForgottenItemsCapture(container) {
  const video = container.querySelector('video')
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 320 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 240 })
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = () => ({ drawImage: vi.fn() })
  return () => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
  }
}

// Targeted coverage for the 'Har jag glömt något?' guided flow (task section 8).
// Mounts the real SmartCameraStage so these tests exercise the actual hub -> mode
// wiring, not just ForgottenItemsCheck in isolation.
describe('"Har jag glömt något?" guided camera flow', () => {
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

  it('opens the dedicated guided flow directly, not the hub grid', () => {
    const stage = mountStage()

    stage.click('Har jag glömt något?')

    expect(stage.container.querySelector('.smart-camera-hub')).toBeNull()
    expect(stage.container.querySelector('.smart-camera-forgotten-check')).not.toBeNull()
    stage.unmount()
  })

  it('shows guiding text instead of a plain camera', () => {
    const stage = mountStage()
    stage.click('Har jag glömt något?')

    expect(stage.container.textContent).toContain('Visa sakerna du tänker ta med dig, en i taget')
    expect(stage.container.textContent).toContain('Visa sakerna du tänker ta med dig.')
    stage.unmount()
  })

  it('starts the camera immediately with the back camera and guidance, without a Starta kamera gate', () => {
    const stage = mountStage()
    stage.click('Har jag glömt något?')

    expect(stage.container.textContent).not.toContain('Kameran är avstängd')
    expect(stage.container.querySelector('video')).not.toBeNull()
    expect(stage.container.querySelector('.smart-camera-forgotten-guidance')).not.toBeNull()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' } } })
    stage.unmount()
  })

  it('never triggers a network request while checking or showing the result', async () => {
    const stage = mountStage()
    stage.click('Har jag glömt något?')
    await act(async () => {})
    stage.click('Mobil')
    stage.click('Se resultat')
    stage.click('Kolla igen')
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    stage.unmount()
  })

  it('stops the MediaStream tracks when the check moves to the result', async () => {
    const stage = mountStage()
    stage.click('Har jag glömt något?')
    await act(async () => {})
    const stream = await getUserMedia.mock.results[0].value

    stage.click('Se resultat')

    expect(stream.track.stop).toHaveBeenCalled()
    stage.unmount()
  })

  it('marks an item as identified only once the user showed it, and never claims an unconfirmed item is forgotten', async () => {
    const stage = mountStage()
    stage.click('Har jag glömt något?')
    await act(async () => {})

    stage.click('Mobil')
    stage.click('Se resultat')

    const result = stage.container.querySelector('.smart-camera-forgotten-result')
    expect(result.textContent).toContain('✓ Mobil')
    expect(result.textContent).toContain(formatUnseenItemMessage('Nycklar'))
    expect(result.textContent).not.toContain('Du har glömt')

    const unconfirmedMessage = [...result.querySelectorAll('p')]
      .map((node) => node.textContent)
      .find((text) => text.includes('Nycklar'))
    expect(assertNoMissingClaim(unconfirmedMessage)).toBe(true)
    stage.unmount()
  })

  it('"Kolla igen" returns to the same guided camera check, not the hub', async () => {
    const stage = mountStage()
    stage.click('Har jag glömt något?')
    await act(async () => {})
    stage.click('Mobil')
    stage.click('Se resultat')

    stage.click('Kolla igen')

    expect(stage.container.querySelector('.smart-camera-hub')).toBeNull()
    expect(stage.container.querySelector('.smart-camera-forgotten-check')).not.toBeNull()
    expect(stage.container.querySelector('video')).not.toBeNull()
    expect(stage.container.textContent).not.toContain('Kameran är avstängd')
    stage.unmount()
  })
})

describe('"Har jag glömt något?" optional remote AI check ("Kontrollera saker")', () => {
  let getUserMedia
  let restoreCanvasStub

  beforeEach(() => {
    getUserMedia = vi.fn(async () => createFakeStream())
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}), ok: true })))
    globalThis.HTMLMediaElement.prototype.play = vi.fn(async () => {})
    analyzeForgottenItemsPhoto.mockReset()
    restoreCanvasStub = () => {}
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    restoreCanvasStub()
  })

  async function openAndStartCamera() {
    const stage = mountStage()
    stage.click('Har jag glömt något?')
    await act(async () => {})
    restoreCanvasStub = stubForgottenItemsCapture(stage.container)
    return stage
  }

  it('never calls the AI service just from tapping "Kontrollera saker" - it only shows the privacy notice and waits for explicit approval', async () => {
    const stage = await openAndStartCamera()

    stage.click('Kontrollera saker')

    expect(stage.container.textContent).toContain('Bilden sparas inte av Viktkollen')
    expect(stage.container.textContent).toContain('Skicka bilden för analys')
    expect(analyzeForgottenItemsPhoto).not.toHaveBeenCalled()
    stage.unmount()
  })

  it('"Avbryt" discards the captured frame without ever calling the AI service', async () => {
    const stage = await openAndStartCamera()

    stage.click('Kontrollera saker')
    stage.click('Avbryt')

    expect(analyzeForgottenItemsPhoto).not.toHaveBeenCalled()
    expect(stage.container.textContent).not.toContain('Skicka bilden för analys')
    stage.unmount()
  })

  it('only calls the AI service after the explicit "Skicka bilden för analys" tap, passing consentApproved: true and the checklist items', async () => {
    analyzeForgottenItemsPhoto.mockResolvedValueOnce({ ok: false, reason: 'not_needed_for_this_assertion' })
    const stage = await openAndStartCamera()

    stage.click('Kontrollera saker')
    expect(analyzeForgottenItemsPhoto).not.toHaveBeenCalled()

    stage.click('Skicka bilden för analys')
    await act(async () => {})

    expect(analyzeForgottenItemsPhoto).toHaveBeenCalledTimes(1)
    const callArgs = analyzeForgottenItemsPhoto.mock.calls[0][0]
    expect(callArgs.consentApproved).toBe(true)
    expect(callArgs.items.map((item) => item.label)).toEqual(expect.arrayContaining(['Mobil', 'Nycklar']))
    stage.unmount()
  })

  it('renders AI-identified and AI-uncertain items correctly, merged with the manual check, in the result stage', async () => {
    // Real checklist item ids are generated (not "phone"/"keys"), so the
    // mock maps status by label - exactly as a real server response would
    // be matched back to the client's own items by id in production.
    analyzeForgottenItemsPhoto.mockImplementationOnce(async ({ items }) => ({
      ok: true,
      result: {
        items: items.map((item) => ({
          id: item.id,
          status: item.label === 'Mobil' ? 'identified' : item.label === 'Hörlurar' ? 'uncertain' : 'not_confirmed',
        })),
      },
    }))
    const stage = await openAndStartCamera()

    stage.click('Kontrollera saker')
    stage.click('Skicka bilden för analys')
    await act(async () => {})
    stage.click('Se resultat')

    const result = stage.container.querySelector('.smart-camera-forgotten-result')
    expect(result.textContent).toContain('✓ Mobil')
    expect(result.textContent).not.toContain('Du har glömt')
    const uncertainMessage = [...result.querySelectorAll('p')]
      .map((node) => node.textContent)
      .find((text) => text.includes('hörlurar') || text.includes('Hörlurar'))
    expect(uncertainMessage).toBeTruthy()
    expect(assertNoMissingClaim(uncertainMessage)).toBe(true)
    stage.unmount()
  })

  it('falls back to the manual check with a clear notice when the AI service fails (fail-closed), and manual marking still works', async () => {
    analyzeForgottenItemsPhoto.mockResolvedValueOnce({ ok: false, reason: 'network_error' })
    const stage = await openAndStartCamera()

    stage.click('Kontrollera saker')
    stage.click('Skicka bilden för analys')
    await act(async () => {})

    expect(stage.container.textContent).toContain('AI-kontrollen kunde inte genomföras just nu')

    // The manual fallback keeps working exactly as before.
    stage.click('Mobil')
    stage.click('Se resultat')
    const result = stage.container.querySelector('.smart-camera-forgotten-result')
    expect(result.textContent).toContain('✓ Mobil')
    stage.unmount()
  })

  it('requires a brand new capture and a fresh explicit approval for a second AI check - it never reuses the first approval', async () => {
    analyzeForgottenItemsPhoto.mockResolvedValue({
      ok: true,
      result: { items: [{ id: 'phone', status: 'identified' }, { id: 'keys', status: 'identified' }] },
    })
    const stage = await openAndStartCamera()

    stage.click('Kontrollera saker')
    stage.click('Skicka bilden för analys')
    await act(async () => {})
    expect(analyzeForgottenItemsPhoto).toHaveBeenCalledTimes(1)

    // The button reappears for a new attempt; nothing sends automatically.
    stage.click('Kontrollera saker')
    expect(analyzeForgottenItemsPhoto).toHaveBeenCalledTimes(1)
    expect(stage.container.textContent).toContain('Skicka bilden för analys')

    stage.click('Skicka bilden för analys')
    await act(async () => {})
    expect(analyzeForgottenItemsPhoto).toHaveBeenCalledTimes(2)
    stage.unmount()
  })
})
