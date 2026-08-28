export const placeSchemaVersion = 1
export const placeStorageKey = 'viktkollen.place.v1'

export const placeFeatureIds = Object.freeze([
  'familyMap',
  'childLocation',
  'status',
  'safePlaces',
  'placeNotifications',
  'sos',
  'allOkCheckin',
  'placeHistory',
  'batterySaver',
  'sharingSettings',
])

export const placeAvailability = Object.freeze({
  comingSoon: 'comingSoon',
  notConnected: 'notConnected',
  requiresConsent: 'requiresConsent',
})

export function createEmptyPlaceState(overrides = {}) {
  return normalizePlaceState({
    batterySaverEnabled: false,
    consentGranted: false,
    consentGrantedAt: null,
    schemaVersion: placeSchemaVersion,
    sharingEnabled: false,
    ...overrides,
  })
}

export function normalizePlaceState(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    batterySaverEnabled: Boolean(source.batterySaverEnabled),
    consentGranted: Boolean(source.consentGranted),
    consentGrantedAt: typeof source.consentGrantedAt === 'string' ? source.consentGrantedAt : null,
    schemaVersion: placeSchemaVersion,
    sharingEnabled: Boolean(source.sharingEnabled),
  }
}

export function getPlaceFeatureAvailability(featureId, state = createEmptyPlaceState()) {
  const normalized = normalizePlaceState(state)

  if (featureId === 'sharingSettings') {
    return placeAvailability.notConnected
  }

  if (featureId === 'batterySaver') {
    return normalized.consentGranted
      ? placeAvailability.comingSoon
      : placeAvailability.requiresConsent
  }

  if (!normalized.consentGranted) {
    return placeAvailability.requiresConsent
  }

  return placeAvailability.notConnected
}

export function setPlaceConsent(state, granted) {
  const next = normalizePlaceState(state)
  return {
    ...next,
    consentGranted: Boolean(granted),
    consentGrantedAt: granted ? new Date().toISOString() : null,
    sharingEnabled: granted ? next.sharingEnabled : false,
  }
}

export function setPlaceSharing(state, enabled) {
  const next = normalizePlaceState(state)
  if (!next.consentGranted && enabled) return next
  return {
    ...next,
    sharingEnabled: Boolean(enabled),
  }
}

export function setBatterySaver(state, enabled) {
  const next = normalizePlaceState(state)
  if (!next.consentGranted) return next
  return {
    ...next,
    batterySaverEnabled: Boolean(enabled),
  }
}
