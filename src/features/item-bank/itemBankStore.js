import { readStorage, writeStorage } from '../../services/appStorageService.js'
import { getActiveUserDataScope, userDataScopeVersion } from '../../services/userDataRepository.js'
import { createEmptyItemBankState, normalizeItemBankState } from './itemBankModel.js'

export const itemBankStorageSuffix = 'itemBank.v1'

// Samma per-användar-namnrymd som profil och vikt använder
// (viktkollen.userData.v1.<storageId>.*). Inloggade användare får
// "user.<id>", utloggade "guest". Under auth-laddning finns inget scope
// och då varken läses eller skrivs något.
export function getItemBankStorageKey(scope = getActiveUserDataScope()) {
  const storageId = scope?.storageId || ''
  if (!storageId) return ''
  return `viktkollen.userData.v${userDataScopeVersion}.${storageId}.${itemBankStorageSuffix}`
}

export function loadItemBankState(scope = getActiveUserDataScope()) {
  const key = getItemBankStorageKey(scope)
  if (!key) return createEmptyItemBankState()
  return normalizeItemBankState(readStorage(key, null))
}

export function saveItemBankState(state, scope = getActiveUserDataScope()) {
  const next = normalizeItemBankState(state)
  const key = getItemBankStorageKey(scope)
  if (!key) return { ok: false, state: next }
  return { ok: writeStorage(key, next), state: next }
}
