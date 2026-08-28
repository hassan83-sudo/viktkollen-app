import { readStorage, removeStorage, writeStorage } from '../../services/appStorageService.js'
import {
  createEmptyReadyState,
  normalizeReadyState,
  readyStorageKey,
} from './readyModel.js'

export function loadReadyState() {
  const raw = readStorage(readyStorageKey, null)
  if (!raw) return createEmptyReadyState()
  return normalizeReadyState(raw)
}

export function saveReadyState(state) {
  const normalized = normalizeReadyState(state)
  writeStorage(readyStorageKey, normalized)
  return normalized
}

export function clearReadyState() {
  removeStorage(readyStorageKey)
  return createEmptyReadyState({ deletedAt: new Date().toISOString() })
}
