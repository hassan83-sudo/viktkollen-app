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
