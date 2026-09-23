export const PLACE_MIN_MEANINGFUL_MOVEMENT_METERS = 20
export const PLACE_STATIONARY_HEARTBEAT_MS = 120000

// Live still observes on its selected interval. A 5-second Live tick is not
// persisted when the point has not moved beyond max(20 m, GPS accuracy).
// The 2-minute heartbeat matches the battery interval and the family map
// LIVE freshness window, so a stationary person still looks like they are
// sharing. Heartbeats never run more often than a longer selected interval,
// so the normal 30-minute cadence stays the same.
//
// A heartbeat refreshes the encrypted live share and its timestamp. It does
// not append a history point and it does not move the movement baseline.
// History remains off unless retention is enabled. When it is enabled, only
// the first fix and later meaningful moves are stored.

function finiteAccuracy(fix) {
  const value = Number(fix?.accuracyMeters ?? fix?.accuracy_meters)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function placeDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusMeters = 6371000
  const radians = (value) => value * Math.PI / 180
  const latitudeDelta = radians(latitudeB - latitudeA)
  const longitudeDelta = radians(longitudeB - longitudeA)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function isMeaningfulPlaceMovement(previous, next) {
  if (!previous || !next) return true
  const latitudeA = Number(previous.latitude)
  const longitudeA = Number(previous.longitude)
  const latitudeB = Number(next.latitude)
  const longitudeB = Number(next.longitude)
  if (![latitudeA, longitudeA, latitudeB, longitudeB].every(Number.isFinite)) return true
  const meters = placeDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB)
  const accuracyMeters = Math.max(finiteAccuracy(previous), finiteAccuracy(next))
  return meters > Math.max(PLACE_MIN_MEANINGFUL_MOVEMENT_METERS, accuracyMeters)
}

export function decidePlaceLocationPersist({
  previousFix,
  nextFix,
  elapsedSincePersistMs,
  minWriteIntervalMs,
}) {
  if (!previousFix) {
    return { persist: true, reason: 'initial', recordHistory: true }
  }
  if (isMeaningfulPlaceMovement(previousFix, nextFix)) {
    return { persist: true, reason: 'movement', recordHistory: true }
  }
  const heartbeatIntervalMs = Math.max(Number(minWriteIntervalMs) || 0, PLACE_STATIONARY_HEARTBEAT_MS)
  if (elapsedSincePersistMs >= heartbeatIntervalMs) {
    return { persist: true, reason: 'heartbeat', recordHistory: false }
  }
  return { persist: false, reason: 'stationary', recordHistory: false }
}

export function nextPlaceMapAnchor(current, personKey, location) {
  const next = {
    personKey,
    latitude: Number(location?.latitude),
    longitude: Number(location?.longitude),
    accuracyMeters: finiteAccuracy(location) || null,
  }
  if (!current || current.personKey !== personKey || isMeaningfulPlaceMovement(current, next)) return next
  return current
}
