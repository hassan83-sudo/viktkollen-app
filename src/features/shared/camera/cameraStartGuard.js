// Skydd mot att kameran startas utan att användaren har gjort något.
//
// Alla kamerafunktioner i Viktkollen (matscanning, AI-ögat, kroppsscanning,
// streckkod, teckenspråk) nås via ett tryck. En videobegäran innan sidan
// har fått någon användaraktivering är därför alltid oavsiktlig - t.ex. vid
// uppstart på Hem - och nekas. Försöket loggas med anropsstack så att källan
// kan spåras. Mikrofon (endast ljud) påverkas inte. Saknar webbläsaren
// navigator.userActivation lämnas beteendet oförändrat.

export const CAMERA_GUARD_LOG_PREFIX = '[camera-guard]'

function wantsVideo(constraints) {
  return Boolean(constraints && typeof constraints === 'object' && constraints.video)
}

export function hasUserActivation(navigatorRef) {
  const activation = navigatorRef?.userActivation
  if (!activation) return true
  return activation.hasBeenActive === true || activation.isActive === true
}

function blockedError() {
  const message = 'Kameran startas först efter att du tryckt på en kamerafunktion.'
  if (typeof DOMException === 'function') return new DOMException(message, 'NotAllowedError')
  const error = new Error(message)
  error.name = 'NotAllowedError'
  return error
}

export function installCameraStartGuard({
  log = (...args) => console.warn(...args),
  navigatorRef = typeof navigator === 'undefined' ? undefined : navigator,
} = {}) {
  const mediaDevices = navigatorRef?.mediaDevices
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') return false
  if (mediaDevices.__viktkollenCameraGuard === true) return true

  const original = mediaDevices.getUserMedia.bind(mediaDevices)
  const guarded = function getUserMedia(constraints) {
    if (wantsVideo(constraints) && !hasUserActivation(navigatorRef)) {
      log(`${CAMERA_GUARD_LOG_PREFIX} Blockerade kamerastart utan användaraktivering`, new Error('camera-guard').stack)
      return Promise.reject(blockedError())
    }
    return original(constraints)
  }

  try {
    Object.defineProperty(mediaDevices, 'getUserMedia', { configurable: true, value: guarded, writable: true })
    Object.defineProperty(mediaDevices, '__viktkollenCameraGuard', { configurable: true, value: true })
  } catch {
    return false
  }
  return true
}
