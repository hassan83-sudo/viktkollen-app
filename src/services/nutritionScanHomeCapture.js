import { readNutritionRemoteConsent } from './nutritionRemoteConsent.js'

// Matscannerns val "Fråga varje gång" / "Fråga inte igen", sparat per konto.
export function getNutritionConsentPromptStorageKey(userId) {
  return `viktkollen.nutritionScanner.consentInfoDisplay.${userId || 'anonymous'}`
}

export function readNutritionConsentPromptPreference(userId) {
  if (typeof window === 'undefined') return 'always'
  try {
    return window.localStorage.getItem(getNutritionConsentPromptStorageKey(userId)) === 'never' ? 'never' : 'always'
  } catch {
    return 'always'
  }
}

// Frågan får bara hoppas över när användaren valt "Fråga inte igen" OCH ett
// giltigt sparat samtycke finns just nu. Läses alltid direkt från lagringen så
// att ett återkallat samtycke aldrig återanvänds.
export function canSkipNutritionConsentPrompt(userId) {
  return readNutritionConsentPromptPreference(userId) === 'never'
    && readNutritionRemoteConsent(userId).granted === true
}

// Bild tagen med telefonens kamera direkt från Hem, som väntar på att
// matscannern öppnas. Hålls bara i minnet och bara för samma konto.
let pendingCapture = null
const listeners = new Set()

export function setPendingHomeFoodScanFile(file, userId) {
  pendingCapture = file ? { file, userId } : null
  listeners.forEach((listener) => listener())
}

export function hasPendingHomeFoodScanFile(userId) {
  return Boolean(pendingCapture && pendingCapture.userId === userId)
}

export function takePendingHomeFoodScanFile(userId) {
  if (!pendingCapture) return null
  const { file, userId: ownerId } = pendingCapture
  pendingCapture = null
  return ownerId === userId ? file : null
}

export function subscribePendingHomeFoodScanFile(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
