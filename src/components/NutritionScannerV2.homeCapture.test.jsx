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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('Hem → Skanna maten', () => {
  let clock = 0

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

  it('opens the scanner page with information and consent for a new user', () => {
    const onScanFood = vi.fn()
    renderHome(onScanFood)
    const click = vi.spyOn(foodCameraInput(), 'click')

    startFoodScan()

    expect(click).not.toHaveBeenCalled()
    expect(onScanFood).toHaveBeenCalledTimes(1)
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

  it('asks every time with "Fråga varje gång", even with stored consent', () => {
    grantNutritionRemoteConsent(USER_ID)
    localStorage.setItem(getNutritionConsentPromptStorageKey(USER_ID), 'always')
    const onScanFood = vi.fn()
    renderHome(onScanFood)
    const click = vi.spyOn(foodCameraInput(), 'click')

    startFoodScan()

    expect(click).not.toHaveBeenCalled()
    expect(onScanFood).toHaveBeenCalledTimes(1)
  })

  it('never uses an old consent after it was revoked', () => {
    chooseNeverAsk()
    revokeNutritionRemoteConsent(USER_ID)
    expect(canSkipNutritionConsentPrompt(USER_ID)).toBe(false)

    const onScanFood = vi.fn()
    renderHome(onScanFood)
    const click = vi.spyOn(foodCameraInput(), 'click')
    startFoodScan()

    expect(click).not.toHaveBeenCalled()
    expect(onScanFood).toHaveBeenCalledTimes(1)
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

    clock += 1000
    fireEvent.click(document.querySelector('.scanner-primary-actions .primary-button'))
    await flush()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    expect(analyzeNutritionPhoto.mock.calls[0][1].consentApproved).toBe(true)
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
