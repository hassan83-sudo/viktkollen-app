/** @vitest-environment jsdom */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getNutritionAnalysisBlocker,
} from '../services/nutritionScannerFlow.js'
import {
  grantNutritionRemoteConsent,
  readNutritionRemoteConsent,
} from '../services/nutritionRemoteConsent.js'
import NutritionScannerV2 from './NutritionScannerV2.jsx'
import { changeAppLanguage } from '../i18n/index.js'

const analyzeNutritionPhoto = vi.hoisted(() => vi.fn(async () => ({ ok: false, errorCode: 'test_stop' })))

vi.mock('../services/nutritionPhotoAnalysisProvider.js', () => ({ analyzeNutritionPhoto }))
vi.mock('../services/nutritionPhotoPreprocessing.js', async (importOriginal) => ({
  ...(await importOriginal()),
  preprocessNutritionPhoto: vi.fn(async () => ({
    metadata: { width: 10, height: 10 },
    ok: true,
    previewUrl: 'blob:test-preview',
    processedBlob: new Blob(['x'], { type: 'image/jpeg' }),
    revoke: () => {},
  })),
  revokeNutritionPhotoObjectUrl: () => {},
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const USER_ID = 'user-consent-display'
const DISPLAY_KEY = `viktkollen.nutritionScanner.consentInfoDisplay.${USER_ID}`

describe('NutritionScannerV2 "Fråga inte igen"', () => {
  let container
  let root
  let clock = 0

  beforeEach(async () => {
    await changeAppLanguage('sv')
    localStorage.clear()
    analyzeNutritionPhoto.mockClear()
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    localStorage.clear()
    vi.restoreAllMocks()
  })

  // Montera skannern som när appen öppnas; att avmontera och montera igen
  // motsvarar att appen stängs och öppnas igen (endast localStorage finns kvar).
  function openScanner() {
    act(() => root?.unmount())
    container?.remove()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(NutritionScannerV2, {
        analysisDate: '2026-10-13',
        meals: [],
        onMealsChange: () => {},
        selectedMealDate: '2026-10-13',
        userId: USER_ID,
      }))
    })
  }

  const displayOptions = () => container.querySelector('fieldset.scanner-consent-display')
  const changeButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Ändra visningsval')
  const consentCheckbox = () => container.querySelector('#nutrition-scanner-remote-consent')
  const radio = (label) => [...container.querySelectorAll('fieldset.scanner-consent-display label')]
    .find((row) => row.textContent.includes(label))?.querySelector('input')

  it('shows the display options by default', () => {
    openScanner()
    expect(displayOptions()).not.toBeNull()
    expect(radio('Fråga varje gång').checked).toBe(true)
  })

  it('keeps "Fråga inte igen" after the app is closed and opened again', () => {
    openScanner()
    act(() => radio('Fråga inte igen').click())

    expect(localStorage.getItem(DISPLAY_KEY)).toBe('never')
    expect(displayOptions()).toBeNull()
    expect(changeButton()).toBeDefined()

    openScanner()
    expect(displayOptions()).toBeNull()
    expect(changeButton()).toBeDefined()
  })

  it('restores "Fråga varje gång" via change button, also after reopening', () => {
    localStorage.setItem(DISPLAY_KEY, 'never')
    openScanner()

    act(() => changeButton().click())
    expect(localStorage.getItem(DISPLAY_KEY)).toBe('always')
    expect(displayOptions()).not.toBeNull()
    expect(radio('Fråga varje gång').checked).toBe(true)

    openScanner()
    expect(displayOptions()).not.toBeNull()
    expect(radio('Fråga varje gång').checked).toBe(true)
  })

  async function selectImage() {
    const input = container.querySelector('#nutrition-scanner-photo-library-input')
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['x'], 'meal.jpg', { type: 'image/jpeg' })],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  async function analyzeWithAi() {
    // Med vald bild ligger "Analysera maten" direkt under bilden.
    const button = container.querySelector('.scanner-preview-stage .scanner-preview-analyze .primary-button')
    expect(button).not.toBeNull()
    expect(container.querySelector('.scanner-primary-actions')).toBeNull()
    // Hoppa förbi skyddet mot dubbeltryck (420 ms) mellan testklick.
    clock += 1000
    await act(async () => {
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('asks a new user for consent before anything is sent to AI', async () => {
    openScanner()
    expect(consentCheckbox()).not.toBeNull()
    expect(consentCheckbox().checked).toBe(false)
    expect(readNutritionRemoteConsent(USER_ID).granted).toBe(false)

    await selectImage()
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bekräfta först')
  })

  it('"Fråga inte igen" with valid consent skips the question, also after reopening', async () => {
    openScanner()
    await selectImage()
    act(() => consentCheckbox().click())
    act(() => radio('Fråga inte igen').click())

    expect(readNutritionRemoteConsent(USER_ID).granted).toBe(true)
    expect(localStorage.getItem(DISPLAY_KEY)).toBe('never')
    expect(consentCheckbox()).toBeNull()

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    analyzeNutritionPhoto.mockClear()

    // Appen stängs och öppnas igen: ingen fråga, analysen går direkt.
    openScanner()
    expect(consentCheckbox()).toBeNull()
    expect(displayOptions()).toBeNull()
    expect(changeButton()).toBeDefined()
    expect(container.querySelector('.scanner-file-picker-group')).not.toBeNull()

    await selectImage()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    expect(analyzeNutritionPhoto.mock.calls[0][1].consentApproved).toBe(true)

    // Även nästa bild går direkt utan nytt kryss.
    await selectImage()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(2)
    expect(analyzeNutritionPhoto.mock.calls[1][1].consentApproved).toBe(true)
  })

  it('"Fråga varje gång" requires active consent for every scan', async () => {
    grantNutritionRemoteConsent(USER_ID)
    openScanner()
    expect(radio('Fråga varje gång').checked).toBe(true)
    expect(consentCheckbox()).not.toBeNull()

    await selectImage()
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()

    act(() => consentCheckbox().click())
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    expect(analyzeNutritionPhoto.mock.calls[0][1].consentApproved).toBe(true)

    // Ny bild: frågan visas igen och kryss krävs på nytt.
    await selectImage()
    expect(consentCheckbox().checked).toBe(false)
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
  })

  it('revoked consent is never reused, even with "Fråga inte igen"', async () => {
    grantNutritionRemoteConsent(USER_ID)
    localStorage.setItem(DISPLAY_KEY, 'never')
    openScanner()
    expect(consentCheckbox()).toBeNull()

    const revokeButton = container.querySelector('.scanner-consent-status button')
    act(() => revokeButton.click())
    expect(readNutritionRemoteConsent(USER_ID).granted).toBe(false)
    expect(consentCheckbox()).not.toBeNull()
    expect(consentCheckbox().checked).toBe(false)

    await selectImage()
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()

    // Samtycke som tas bort utanför skannern gäller inte heller.
    grantNutritionRemoteConsent(USER_ID)
    openScanner()
    expect(consentCheckbox()).toBeNull()
    localStorage.removeItem(`viktkollen.nutritionRemoteAnalysisConsent.${USER_ID}`)
    await selectImage()
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).not.toHaveBeenCalled()

    // Nytt godkännande: analysen fungerar igen.
    openScanner()
    await selectImage()
    act(() => consentCheckbox().click())
    await analyzeWithAi()
    expect(analyzeNutritionPhoto).toHaveBeenCalledTimes(1)
    expect(consentCheckbox()).toBeNull()
  })

  it('keeps the blocker message for remote analysis without consent', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: { size: 1 }, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: false,
    })).toContain('Bekräfta först')
  })

  it('keeps the preference per user', () => {
    localStorage.setItem('viktkollen.nutritionScanner.consentInfoDisplay.someone-else', 'never')
    openScanner()
    expect(displayOptions()).not.toBeNull()
  })
})
