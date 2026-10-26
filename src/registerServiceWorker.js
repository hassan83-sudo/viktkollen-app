export const PWA_CACHE_VERSION = 'v3'
export const PWA_APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0'

export function shouldRegisterServiceWorker({
  hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  isProduction = import.meta.env.PROD,
} = {}) {
  return Boolean(isProduction && hasServiceWorker)
}

function getWaitingWorker(registration) {
  return registration?.waiting || registration?.installing || null
}

export function watchForServiceWorkerUpdate(registration, {
  hasController = typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
  onStatusChange,
  onUpdateAvailable,
} = {}) {
  if (!registration) return () => {}

  const waitingWorker = registration.waiting

  if (waitingWorker && hasController) {
    onStatusChange?.('update-ready')
    onUpdateAvailable?.(registration)
  }

  function handleUpdateFound() {
    const worker = registration.installing
    if (!worker) return

    onStatusChange?.('installing')

    worker.addEventListener('statechange', () => {
      onStatusChange?.(worker.state)

      if (worker.state === 'installed' && hasController) {
        onUpdateAvailable?.(registration)
      }
    })
  }

  registration.addEventListener('updatefound', handleUpdateFound)

  return () => registration.removeEventListener('updatefound', handleUpdateFound)
}

export function registerServiceWorker({
  isProduction = import.meta.env.PROD,
  onStatusChange,
  onUpdateAvailable,
  serviceWorker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  serviceWorkerUrl = '/sw.js',
} = {}) {
  if (!shouldRegisterServiceWorker({
    hasServiceWorker: Boolean(serviceWorker?.register),
    isProduction,
  })) {
    onStatusChange?.('unsupported-or-non-production')
    return Promise.resolve({ registered: false, reason: 'unsupported-or-non-production' })
  }

  return serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' })
    .then(async (registration) => {
      onStatusChange?.(getWaitingWorker(registration)?.state || 'registered')
      const cleanup = watchForServiceWorkerUpdate(registration, {
        onStatusChange,
        onUpdateAvailable,
      })

      await registration.update().catch(() => undefined)
      return { cleanup, registered: true, registration }
    })
    .catch((error) => {
      onStatusChange?.('registration-failed')
      return { error, registered: false, reason: 'registration-failed' }
    })
}

export function applyServiceWorkerUpdate(registration) {
  const worker = registration?.waiting

  if (!worker) return false

  worker.postMessage({ type: 'SKIP_WAITING' })
  return true
}

// Vad sidan ska göra när en service worker tar kontroll (controllerchange).
// - Första kontrollen (ingen service worker styrde sidan vid start): sidan är
//   redan hämtad från nätet, så en omladdning behövs inte. Den gav tidigare
//   ett flimmer på inloggningssidan och tömde e-postfältet medan man skrev.
// - Byte från en äldre service worker: ladda om, men inte mitt i inmatning.
//   Då skjuts omladdningen upp tills sidan döljs.
export function controllerChangeReloadAction({ activeElement = null, captureActive = false, hadControllerAtStart = false } = {}) {
  if (!hadControllerAtStart) return 'none'
  return captureActive || isEditingElement(activeElement) ? 'defer' : 'now'
}

// Telefonens kamera eller bildväljare lämnar sidan. En omladdning medan den är
// öppen, eller strax efter att en bild valts, tappar bilden (Hem-kameran håller
// den bara i minnet tills matscannern tar emot den). Omladdningen väntar därför
// tills valet är avbrutet eller klart och sidan sedan döljs igen.
const NATIVE_CAPTURE_OPEN_MS = 10 * 60 * 1000
const NATIVE_CAPTURE_SELECTED_MS = 2 * 60 * 1000
let nativeCaptureUntil = 0

export function isNativeCaptureActive(now = Date.now()) {
  return now < nativeCaptureUntil
}

export function trackNativeCapture(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return () => {}
  const isFileInput = (target) => String(target?.tagName || '').toUpperCase() === 'INPUT' &&
    String(target.type || '').toLowerCase() === 'file'
  const onClick = (event) => {
    if (isFileInput(event.target)) nativeCaptureUntil = Date.now() + NATIVE_CAPTURE_OPEN_MS
  }
  const onChange = (event) => {
    if (!isFileInput(event.target)) return
    nativeCaptureUntil = event.target.files?.length ? Date.now() + NATIVE_CAPTURE_SELECTED_MS : 0
  }
  const onCancel = (event) => {
    if (isFileInput(event.target)) nativeCaptureUntil = 0
  }
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('change', onChange, true)
  doc.addEventListener('cancel', onCancel, true)
  return () => {
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('change', onChange, true)
    doc.removeEventListener('cancel', onCancel, true)
    nativeCaptureUntil = 0
  }
}

export function reloadPage() {
  window.location.reload()
}

export function isEditingElement(element) {
  if (!element || typeof element !== 'object') return false
  if (element.isContentEditable) return true
  const tag = String(element.tagName || '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = String(element.type || 'text').toLowerCase()
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type)
}

export function requestServiceWorkerUpdate(registration) {
  if (!registration?.update) return Promise.resolve(false)
  return registration.update().then(() => true).catch(() => false)
}

export function isStandaloneDisplayMode({
  matchMedia = typeof window !== 'undefined' ? window.matchMedia : undefined,
  navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined,
} = {}) {
  return Boolean(
    navigatorRef?.standalone ||
    matchMedia?.('(display-mode: standalone)')?.matches ||
    matchMedia?.('(display-mode: fullscreen)')?.matches,
  )
}
