export function shouldRegisterServiceWorker({
  hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  isProduction = import.meta.env.PROD,
} = {}) {
  return Boolean(isProduction && hasServiceWorker)
}

export function registerServiceWorker({
  isProduction = import.meta.env.PROD,
  serviceWorker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  serviceWorkerUrl = '/sw.js',
} = {}) {
  if (!shouldRegisterServiceWorker({
    hasServiceWorker: Boolean(serviceWorker?.register),
    isProduction,
  })) {
    return Promise.resolve({ registered: false, reason: 'unsupported-or-non-production' })
  }

  return serviceWorker.register(serviceWorkerUrl)
    .then((registration) => ({ registered: true, registration }))
    .catch((error) => ({ error, registered: false, reason: 'registration-failed' }))
}
