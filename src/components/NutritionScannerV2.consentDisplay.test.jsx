/** @vitest-environment jsdom */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getNutritionAnalysisBlocker,
} from '../services/nutritionScannerFlow.js'
import {
  grantNutritionRemoteConsent,
  readNutritionRemoteConsent,
} from '../services/nutritionRemoteConsent.js'
import NutritionScannerV2 from './NutritionScannerV2.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const USER_ID = 'user-consent-display'
const DISPLAY_KEY = `viktkollen.nutritionScanner.consentInfoDisplay.${USER_ID}`

describe('NutritionScannerV2 "Visa inte igen"', () => {
  let container
  let root

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    localStorage.clear()
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
    expect(radio('Visa varje gång').checked).toBe(true)
    expect(changeButton()).toBeUndefined()
  })

  it('keeps "Visa inte igen" after the app is closed and opened again', () => {
    openScanner()
    act(() => radio('Visa inte igen').click())

    expect(localStorage.getItem(DISPLAY_KEY)).toBe('never')
    expect(displayOptions()).toBeNull()
    expect(changeButton()).toBeDefined()

    openScanner()
    expect(displayOptions()).toBeNull()
    expect(changeButton()).toBeDefined()
  })

  it('restores "Visa varje gång" via "Ändra visningsval", also after reopening', () => {
    localStorage.setItem(DISPLAY_KEY, 'never')
    openScanner()

    act(() => changeButton().click())
    expect(localStorage.getItem(DISPLAY_KEY)).toBe('always')
    expect(displayOptions()).not.toBeNull()
    expect(radio('Visa varje gång').checked).toBe(true)

    openScanner()
    expect(displayOptions()).not.toBeNull()
    expect(radio('Visa varje gång').checked).toBe(true)
  })

  it('never grants or skips AI consent when the information is hidden', () => {
    localStorage.setItem(DISPLAY_KEY, 'never')
    openScanner()

    // Samtyckesrutan finns kvar, är inte ikryssad och inget samtycke sparas.
    expect(consentCheckbox()).not.toBeNull()
    expect(consentCheckbox().checked).toBe(false)
    expect(readNutritionRemoteConsent(USER_ID).granted).toBe(false)

    // Även med tidigare sparat samtycke krävs kryss för varje AI-analys.
    grantNutritionRemoteConsent(USER_ID)
    openScanner()
    expect(consentCheckbox().checked).toBe(false)
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
