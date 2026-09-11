import { readStorage, removeStorage, writeStorage } from '../../services/appStorageService.js'
import {
  createEmptyPlaceState,
  normalizePlaceState,
  placeStorageKey,
} from './placeModel.js'
import { syncPlaceLocationSharing } from './placeLocationSharingService.js'

export function loadPlaceState() {
  const raw = readStorage(placeStorageKey, null)
  if (!raw) return createEmptyPlaceState()
  return normalizePlaceState(raw)
}

export function savePlaceState(state) {
  const normalized = normalizePlaceState(state)
  writeStorage(placeStorageKey, normalized)

  void syncPlaceLocationSharing(normalized).catch((error) => {
    console.warn('Place sharing sync failed:', error?.message || error)
  })

  return normalized
}

export function clearPlaceState() {
  removeStorage(placeStorageKey)
  return createEmptyPlaceState()
}
