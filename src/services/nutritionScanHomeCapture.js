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
// matscannern öppnas. Bara för samma konto.
//
// Appen kan laddas om mellan "Använd bild" och matscannern: iOS kan ladda om
// hemskärmsappen efter kameran, och en appdel som inte kan hämtas efter en ny
// version laddar om sidan (AppErrorBoundary). Då startar appen på Hem och en
// bild som bara låg i minnet var borta. Bilden sparas därför också i webbläsarens
// IndexedDB en kort stund, och att kameran öppnats från Hem sparas i
// sessionStorage, så att appen efter en omladdning öppnar matscannern igen.
let pendingCapture = null
let pendingSave = Promise.resolve()
const listeners = new Set()

const DB_NAME = 'viktkollen-home-food-scan'
const STORE_NAME = 'pending'
const RECORD_KEY = 'capture'
const INTENT_KEY = 'viktkollen.homeFoodScan.intent'
const SAVED_CAPTURE_MAX_AGE_MS = 10 * 60 * 1000
const CAMERA_INTENT_MAX_AGE_MS = 5 * 60 * 1000

function notify() {
  listeners.forEach((listener) => listener())
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb-unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, run) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request?.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

async function saveCapture(file, userId) {
  // Filens innehåll kopieras: en kamerafil på iOS kan vara borta efter en omladdning.
  const data = await file.arrayBuffer()
  await withStore('readwrite', (store) => store.put({
    data,
    name: file.name || 'matbild.jpg',
    savedAt: Date.now(),
    type: file.type || 'image/jpeg',
    userId,
  }, RECORD_KEY))
}

function clearSavedCapture() {
  return withStore('readwrite', (store) => store.delete(RECORD_KEY)).catch(() => undefined)
}

function readIntent() {
  try {
    const intent = JSON.parse(window.sessionStorage.getItem(INTENT_KEY) || 'null')
    return intent && typeof intent === 'object' ? intent : null
  } catch {
    return null
  }
}

function writeIntent(userId) {
  try {
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ at: Date.now(), userId }))
  } catch {
    // Utan sessionStorage öppnas matscannern inte igen efter en omladdning.
  }
}

export function clearHomeFoodCameraIntent() {
  try {
    window.sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // Inget att rensa.
  }
}

// Anropas när Hem öppnar telefonens kamera eller bildväljare.
export function markHomeFoodCameraOpened(userId) {
  writeIntent(userId)
}

export function setPendingHomeFoodScanFile(file, userId) {
  pendingCapture = file ? { file, userId } : null
  if (file) {
    writeIntent(userId)
    pendingSave = saveCapture(file, userId).catch(() => undefined)
  } else {
    clearHomeFoodCameraIntent()
    pendingSave = clearSavedCapture()
  }
  notify()
}

// Väntar (högst timeoutMs) på att en nytagen bild hunnit sparas, t.ex. innan
// appen laddar om sig själv.
export function waitForPendingHomeFoodScanSave(timeoutMs = 1500) {
  return Promise.race([
    pendingSave,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

// Efter start: hämtar en sparad bild för samma konto till minnet. Svarar true
// om appen ska öppna matscannern (bild finns eller kameran öppnades nyss från Hem).
export async function restorePendingHomeFoodScan(userId, now = Date.now()) {
  if (!userId) return false
  const intent = readIntent()
  const intentFresh = Boolean(intent && intent.userId === userId && now - Number(intent.at) < CAMERA_INTENT_MAX_AGE_MS)
  // Avsikten gäller bara en omladdning.
  if (intent) clearHomeFoodCameraIntent()

  let restored = false
  if (!pendingCapture) {
    try {
      const saved = await withStore('readonly', (store) => store.get(RECORD_KEY))
      const fresh = saved && now - Number(saved.savedAt) < SAVED_CAPTURE_MAX_AGE_MS
      if (fresh && saved.userId === userId && saved.data) {
        const file = typeof File === 'function'
          ? new File([saved.data], saved.name, { type: saved.type })
          : new Blob([saved.data], { type: saved.type })
        pendingCapture = { file, userId }
        restored = true
      } else if (saved) {
        await clearSavedCapture()
      }
    } catch {
      // Ingen sparad bild.
    }
  }
  if (restored) notify()
  return restored || intentFresh
}

export function hasPendingHomeFoodScanFile(userId) {
  return Boolean(pendingCapture && pendingCapture.userId === userId)
}

export function takePendingHomeFoodScanFile(userId) {
  if (!pendingCapture) return null
  const { file, userId: ownerId } = pendingCapture
  pendingCapture = null
  clearHomeFoodCameraIntent()
  pendingSave = pendingSave.then(clearSavedCapture)
  return ownerId === userId ? file : null
}

export function subscribePendingHomeFoodScanFile(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
