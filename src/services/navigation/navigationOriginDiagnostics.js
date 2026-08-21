import { safeLogger } from '../safeLogger.js'

function getWindowLocation(windowRef) {
  if (!windowRef?.location) return null

  return {
    hash: windowRef.location.hash || '',
    host: windowRef.location.host || '',
    href: windowRef.location.href || '',
    origin: windowRef.location.origin || '',
    pathname: windowRef.location.pathname || '',
    search: windowRef.location.search || '',
  }
}

export function getNavigationLocationSnapshot(windowRef = typeof window !== 'undefined' ? window : null) {
  try {
    return getWindowLocation(windowRef)
  } catch {
    return null
  }
}

export function logNavigationOrigin(eventName, details = {}, windowRef = typeof window !== 'undefined' ? window : null) {
  if (!import.meta.env.DEV) return null

  const payload = {
    event: eventName,
    location: getNavigationLocationSnapshot(windowRef),
    ...details,
  }
  const entry = safeLogger.info('Navigation origin diagnostic', payload)

  if (windowRef) {
    try {
      const diagnostics = Array.isArray(windowRef.__viktkollenNavigationDiagnostics)
        ? windowRef.__viktkollenNavigationDiagnostics
        : []

      windowRef.__viktkollenNavigationDiagnostics = [...diagnostics, entry].slice(-40)
    } catch {
      // Console logging above is the primary dev-only diagnostic path.
    }
  }

  return entry
}
