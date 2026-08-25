import { readStorage, writeStorage } from '../../services/appStorageService.js'
import { emptyMemoryState, normalizeMemoryState } from './memoryModel.js'

export const memoryStorageKey = 'viktkollen.memory.v1'

export function loadMemoryState() {
  return normalizeMemoryState(readStorage(memoryStorageKey, emptyMemoryState))
}

export function saveMemoryState(state) {
  const next = normalizeMemoryState(state)
  writeStorage(memoryStorageKey, next)
  return next
}

export function updateMemoryState(updater) {
  const current = loadMemoryState()
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
  return saveMemoryState(next)
}
