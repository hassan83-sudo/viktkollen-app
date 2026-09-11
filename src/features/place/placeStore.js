import { readStorage, removeStorage, writeStorage } from '../../services/appStorageService.js'
import {
  createEmptyPlaceState,
  normalizePlaceState,
  placeStorageKey,
} from './placeModel.js'
import {
  configureActiveLocationSharing,
  stopActiveLocationSharing,
  syncPlaceLocationSharing,
} from './placeLocationSharingService.js'

export function loadPlaceState() {
  const raw = readStorage(placeStorageKey, null)
  if (!raw) return createEmptyPlaceState()
  return normalizePlaceState(raw)
}

export function savePlaceState(state) {
  const normalized = normalizePlaceState(state)
  writeStorage(placeStorageKey, normalized)

  configureActiveLocationSharing(normalized)

  void syncPlaceLocationSharing(normalized).catch((error) => {
    console.warn('Place sharing sync failed:', error?.message || error)
  })

  return normalized
}

export function clearPlaceState() {
  stopActiveLocationSharing()
  removeStorage(placeStorageKey)
  return createEmptyPlaceState()
}
