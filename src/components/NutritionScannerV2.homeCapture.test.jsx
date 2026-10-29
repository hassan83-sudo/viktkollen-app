/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.js'
import {
  grantNutritionRemoteConsent,
  readNutritionRemoteConsent,
  revokeNutritionRemoteConsent,
} from '../services/nutritionRemoteConsent.js'
import {
  canSkipNutritionConsentPrompt,
  getNutritionConsentPromptStorageKey,
  hasPendingHomeFoodScanFile,
  setPendingHomeFoodScanFile,
  takePendingHomeFoodScanFile,
} from '../services/nutritionScanHomeCapture.js'
import OverviewDashboard from './app/OverviewDashboard.jsx'
import NutritionScannerV2 from './NutritionScannerV2.jsx'
import { createLocalNutritionPhotoEstimate } from '../services/nutritionPhotoLocalAnalysis.js'

const analyzeNutritionPhoto = vi.hoisted(() => vi.fn(async () => ({ ok: false, errorCode: 'test_stop' })))

vi.mock('../services/nutritionPhotoAnalysisProvider.js', () => ({ analyzeNutritionPhoto }))
vi.mock('../services/nutritionPhotoPreprocessing.js', async (importOriginal) => ({
  ...(await importOriginal()),
  preprocessNutritionPhoto: vi.fn(async () => ({
    metadata: { width: 10, height: 10 },
    ok: true,
    previewUrl: 'blob:home-capture',
    processedBlob: new Blob(['x'], { type: 'image/jpeg' }),
    revoke: () => {},
  })),
  revokeNutritionPhotoObjectUrl: () => {},
}))

const USER_ID = 'user-home-capture'

function createStream() {
  const track = { readyState: 'live', stop: vi.fn(function stop() { this.readyState = 'ended' }) }
  return { getTracks: () => [track], getVideoTracks: () => [track], track }
}

function renderHome(onScanFood) {
  return render(
    <OverviewDashboard
      adaptiveCoachFeedback={{}}
      calorieGoal={2200}
      caloriesToday={0}
      checkIn={{}}
      currentWeight={78}
      featureFlags={{}}
      foods={[]}
      goalsHabits={{}}
      healthScore={80}
      healthSnapshot={{ date: '2026-10-13', weight: { current: 78, dailyWeights: [] } }}
      isAuthenticated
      meals={[]}
      nutritionGoals={{}}
      onAddMeal={vi.fn()}
      onEditProfile={vi.fn()}
      onLogWeight={vi.fn()}
      onNavigateSection={vi.fn()}
      onScanFood={onScanFood}
      profile={{ name: 'Test' }}
      reminderState={{ reminders: [] }}
      selectedDate="2026-10-13"
      syncStatus={{}}
      userId={USER_ID}
      weights={[]}
    />,
  )
}

function renderScanner() {
  return render(
    <NutritionScannerV2
      analysisDate="2026-10-13"
      meals={[]}
      onMealsChange={() => {}}
      selectedMealDate="2026-10-13"
      userId={USER_ID}
    />,
  )
}

const foodCameraInput = () => document.querySelector('.home-food-camera-input')
const startFoodScan = () => fireEvent.click(screen.getAllByRole('button', { name: 'Skanna maten' })[0])
const consentCheckbox = () => document.querySelector('#nutrition-scanner-remote-consent')
const analyzeButton = () => document.querySelector('.scanner-preview-stage .scanner-preview-analyze .primary-button')

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('Hem → Skanna maten', () => {
  let clock = 0

  async function analyzeWithAi() {
    clock += 1000
    fireEvent.click(analyzeButton())
    await flush()
  }

  // Hem → Skanna maten → bild tas → matscannern öppnas med bilden.
  async function captureFromHome() {
    const onScanFood = vi.fn()
    renderHome(onScanFood)
    const click = vi.spyOn(foodCameraInput(), 'click').mockImplementation(() => {})
    startFoodScan()
    expect(click).toHaveBeenCalledTimes(1)
    expect(onScanFood).not.toHaveBeenCalled()
    fireEvent.change(foodCameraInput(), { target: { files: [new File(['x'], 'meal.jpg', { type: 'image/jpeg' })] } })
    expect(onScanFood).toHaveBeenCalledTimes(1)
    cleanup()
    renderScanner()
    await flush()
    expect(document.querySelector('img.food-preview')?.getAttribute('src')).toBe('blob:home-capture')
  }

  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    localStorage.clear()
    takePendingHomeFoodScanFile(USER_ID)
    analyzeNutritionPhoto.mockClear()
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function chooseNeverAsk() {
    grantNutritionRemoteConsent(USER_ID)
    localStorage.setItem(getNutritionConsentPromptStorageKey(USER_ID), 'never')
  }

  it('opens the phone camera for a new user too, but requires AI consent before analysis', async () => {
    await captureFromHome()

    expect(consentCheckbox()).not.toBeNull()
    expect(consentCheckbox().checked).toBe(false)
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Bekräfta först')

    fireEvent.click(consentCheckbox())
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    expect(analyzeNutritionPhoto.mock.calls[0][1].consentApproved).toBe(true)
  })

  it('opens the phone camera directly with "Fråga inte igen" and valid consent', () => {
    chooseNeverAsk()
    const onScanFood = vi.fn()
    renderHome(onScanFood)
    const click = vi.spyOn(foodCameraInput(), 'click').mockImplementation(() => {})

    startFoodScan()

    expect(click).toHaveBeenCalledTimes(1)
    expect(foodCameraInput().getAttribute('capture')).toBe('environment')
    expect(onScanFood).not.toHaveBeenCalled()
  })

  it('stays on Home when the phone camera is cancelled', () => {
    chooseNeverAsk()
    const onScanFood = vi.fn()
    renderHome(onScanFood)
    vi.spyOn(foodCameraInput(), 'click').mockImplementation(() => {})
    startFoodScan()

    fireEvent.change(foodCameraInput(), { target: { files: [] } })

    expect(onScanFood).not.toHaveBeenCalled()
    expect(hasPendingHomeFoodScanFile(USER_ID)).toBe(false)
  })

  it('asks every time with "Fråga varje gång", even with stored consent', async () => {
    grantNutritionRemoteConsent(USER_ID)
    localStorage.setItem(getNutritionConsentPromptStorageKey(USER_ID), 'always')
    await captureFromHome()

    expect(consentCheckbox()).not.toBeNull()
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()

    fireEvent.click(consentCheckbox())
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
  })

  it('never uses an old consent after it was revoked', async () => {
    chooseNeverAsk()
    revokeNutritionRemoteConsent(USER_ID)
    expect(canSkipNutritionConsentPrompt(USER_ID)).toBe(false)

    await captureFromHome()

    expect(consentCheckbox()).not.toBeNull()
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()
  })

  it('keeps the choice per account', () => {
    chooseNeverAsk()
    expect(canSkipNutritionConsentPrompt(USER_ID)).toBe(true)
    expect(canSkipNutritionConsentPrompt('someone-else')).toBe(false)

    setPendingHomeFoodScanFile(new File(['x'], 'meal.jpg'), USER_ID)
    expect(hasPendingHomeFoodScanFile('someone-else')).toBe(false)
    expect(takePendingHomeFoodScanFile('someone-else')).toBeNull()
    expect(hasPendingHomeFoodScanFile(USER_ID)).toBe(false)
  })

  it('hands the photo to the scanner, without the consent question and without starting the preview camera', async () => {
    chooseNeverAsk()
    const getUserMedia = vi.fn(async () => createStream())
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { this.callback = callback }
      observe() { this.callback([{ isIntersecting: true }]) }
      disconnect() {}
    })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })

    const onScanFood = vi.fn()
    renderHome(onScanFood)
    vi.spyOn(foodCameraInput(), 'click').mockImplementation(() => {})
    startFoodScan()
    fireEvent.change(foodCameraInput(), { target: { files: [new File(['x'], 'meal.jpg', { type: 'image/jpeg' })] } })
    expect(onScanFood).toHaveBeenCalledTimes(1)
    expect(hasPendingHomeFoodScanFile(USER_ID)).toBe(true)
    cleanup()

    renderScanner()
    await flush()

    expect(hasPendingHomeFoodScanFile(USER_ID)).toBe(false)
    expect(document.querySelector('img.food-preview')?.getAttribute('src')).toBe('blob:home-capture')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(consentCheckbox()).toBeNull()
    // Bildval från mobilen finns kvar.
    expect(document.querySelector('#nutrition-scanner-photo-library-input')).not.toBeNull()

    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    expect(analyzeNutritionPhoto.mock.calls[0][1].consentApproved).toBe(true)
  })

  it('automatically analyzes native camera and library photos once each, with manual retry after failure', async () => {
    chooseNeverAsk()
    renderScanner()
    const camera = document.querySelector('#nutrition-scanner-photo-camera-input')
    fireEvent.change(camera, { target: { files: [new File(['a'], 'camera.jpg', { type: 'image/jpeg' })] } })
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)

    // The mock returns an error: rerenders and preference toggles must not retry it.
    fireEvent.click(screen.getByRole('button', { name: 'Ändra visningsval' }))
    await flush()
    fireEvent.click(document.querySelector('input[name="nutrition-consent-display"][value="never"]'))
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(2)

    const library = document.querySelector('#nutrition-scanner-photo-library-input')
    fireEvent.change(library, { target: { files: [new File(['b'], 'library.jpg', { type: 'image/jpeg' })] } })
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(3)
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(3)
  })

  it('does not start an analysis when the scanner opens without a selected photo', async () => {
    chooseNeverAsk()
    renderScanner()
    await flush()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('shows only the photo and percentage during analysis and restores the view on %s', async (outcome) => {
    chooseNeverAsk()
    let finish
    analyzeNutritionPhoto.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const background = document.createElement('button')
    background.textContent = 'Background navigation'
    document.body.append(background)
    try {
      await captureFromHome()
      const dialog = screen.getByRole('dialog')
      expect(dialog.querySelector('img').getAttribute('src')).toBe('blob:home-capture')
      expect(dialog.textContent.trim()).toMatch(/^\d+ %$/)
      expect(dialog.querySelector('button')).toBeNull()
      expect(screen.getAllByRole('progressbar')).toHaveLength(1)
      expect(document.activeElement).toBe(dialog)
      expect(background.inert).toBe(true)
      expect(document.body.style.overflow).toBe('hidden')
      const analysis = createLocalNutritionPhotoEstimate({ imageMetadata: {} })
      analysis.provider.type = 'remote'
      await act(async () => finish(outcome === 'success'
        ? { ok: true, analysis }
        : { ok: false, warning: 'Testfel' }))
      await flush()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(background.inert).not.toBe(true)
      expect(document.body.style.overflow).not.toBe('hidden')
      expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
      if (outcome === 'success') expect(document.querySelector('.nutrition-scanner-review')).not.toBeNull()
      else expect(screen.getByRole('alert').textContent).toContain('Testfel')
    } finally {
      background.remove()
    }
  })

  it('stops the preview camera when the user leaves the scanner', async () => {
    const stream = createStream()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { this.callback = callback }
      observe() { this.callback([{ isIntersecting: true }]) }
      disconnect() {}
    })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } })
    HTMLMediaElement.prototype.play = vi.fn(async () => {})

    const { unmount } = renderScanner()
    await flush()
    expect(stream.track.stop).not.toHaveBeenCalled()

    unmount()
    expect(stream.track.stop).toHaveBeenCalled()
  })

  it('unticking the box only cancels this photo and keeps the stored consent', () => {
    renderScanner()
    fireEvent.click(consentCheckbox())
    expect(readNutritionRemoteConsent(USER_ID).granted).toBe(true)

    fireEvent.click(consentCheckbox())
    expect(consentCheckbox().checked).toBe(false)
    expect(readNutritionRemoteConsent(USER_ID).granted).toBe(true)
    expect(document.body.textContent).not.toContain('AI-analys är avstängd för den här användaren')
  })
})
