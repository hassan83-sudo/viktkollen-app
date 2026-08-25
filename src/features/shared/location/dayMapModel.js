export const dayMapStatus = Object.freeze({
  available: false,
  optInRequired: true,
  reason: 'Frivillig GPS-historik och kartleverantör saknas i webbläsaren för V1.',
  requires: ['explicit-opt-in', 'background-or-session-location', 'map-provider'],
})

export function createDayMapSession() {
  return {
    entries: [],
    enabled: false,
    ...dayMapStatus,
  }
}

export function canShowDayMap() {
  return false
}
