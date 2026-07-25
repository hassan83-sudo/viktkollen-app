import {
  readStorage,
  removeStorage,
  writeStorage,
} from './appStorageService.js'

export const userDataKeys = {
  aiConversationMemory: 'viktkollen.aiConversationMemory',
  bodyAnalysisHistory: 'viktkollen.bodyAnalysis.history.v1',
  bodyAnalysisLegacyHistory: 'viktkollen.bodyAnalysis.history',
  bodyAnalysisLatest: 'viktkollen.bodyAnalysis.latest',
  chat: 'viktkollen.chat',
  checkIn: 'viktkollen.checkIn',
  demoMode: 'viktkollen.demoMode',
  foods: 'viktkollen.foods',
  mealHistory: 'viktkollen.mealAnalysisHistory',
  meals: 'viktkollen.meals',
  photoMeals: 'viktkollen.photoMeals',
  profile: 'viktkollen.profile',
  progressPhotos: 'viktkollen.progressPhotos',
  reminderLog: 'viktkollen.reminderLog',
  reminders: 'viktkollen.reminders',
  scannedProducts: 'viktkollen.scannedProducts',
  weights: 'viktkollen.weights',
}

const backupSnapshotVersion = 1
const backupStorageKeys = Object.values(userDataKeys)

function readValidated(key, fallbackValue, isValid = () => true) {
  const value = readStorage(key, fallbackValue)

  return isValid(value) ? value : fallbackValue
}

function saveValue(key, value) {
  writeStorage(key, value)

  return value
}

// Local-first repository. Supabase/cloud sync can later be added behind this API
// without forcing UI components to know where the data is stored.
export function getDemoMode(fallbackValue = false, isValid) {
  return readValidated(userDataKeys.demoMode, fallbackValue, isValid)
}

export function saveDemoMode(value) {
  return saveValue(userDataKeys.demoMode, value)
}

export function getProfile(fallbackValue = null, isValid) {
  return readValidated(userDataKeys.profile, fallbackValue, isValid)
}

export function saveProfile(profile) {
  return saveValue(userDataKeys.profile, profile)
}

export function getWeights(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.weights, fallbackValue, isValid)
}

export function saveWeights(weights) {
  return saveValue(userDataKeys.weights, weights)
}

export function getFoods(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.foods, fallbackValue, isValid)
}

export function saveFoods(foods) {
  return saveValue(userDataKeys.foods, foods)
}

export function getMeals(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.meals, fallbackValue, isValid)
}

export function saveMeals(meals) {
  return saveValue(userDataKeys.meals, meals)
}

export function getMealHistory(fallbackValue = []) {
  return readStorage(userDataKeys.mealHistory, fallbackValue)
}

export function saveMealHistory(history) {
  return saveValue(userDataKeys.mealHistory, history)
}

export function getLegacyPhotoMeals(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.photoMeals, fallbackValue, isValid)
}

export function saveLegacyPhotoMeals(photoMeals) {
  return saveValue(userDataKeys.photoMeals, photoMeals)
}

export function getCheckIn(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.checkIn, fallbackValue, isValid)
}

export function saveCheckIn(checkIn) {
  return saveValue(userDataKeys.checkIn, checkIn)
}

export function getProgressPhotos(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.progressPhotos, fallbackValue, isValid)
}

export function saveProgressPhotos(photos) {
  return saveValue(userDataKeys.progressPhotos, photos)
}

export function getCoachChat(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.chat, fallbackValue, isValid)
}

export function saveCoachChat(messages) {
  return saveValue(userDataKeys.chat, messages)
}

export function getScannedProducts(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.scannedProducts, fallbackValue, isValid)
}

export function saveScannedProducts(products) {
  return saveValue(userDataKeys.scannedProducts, products)
}

export function getReminderSettings(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.reminders, fallbackValue, isValid)
}

export function saveReminderSettings(settings) {
  return saveValue(userDataKeys.reminders, settings)
}

export function getReminderLog(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.reminderLog, fallbackValue, isValid)
}

export function saveReminderLog(log) {
  return saveValue(userDataKeys.reminderLog, log)
}

export function getAiConversationMemory(fallbackValue = []) {
  return readStorage(userDataKeys.aiConversationMemory, fallbackValue)
}

export function saveAiConversationMemory(messages) {
  return saveValue(userDataKeys.aiConversationMemory, messages)
}

export function getBodyAnalysisHistoryPayload(fallbackValue = null) {
  return readStorage(userDataKeys.bodyAnalysisHistory, fallbackValue)
}

export function saveBodyAnalysisHistoryPayload(payload) {
  return saveValue(userDataKeys.bodyAnalysisHistory, payload)
}

export function removeUserData(key) {
  return removeStorage(key)
}

export function getUserDataBackupSnapshot() {
  const data = backupStorageKeys.reduce((snapshot, key) => {
    const value = readStorage(key, null)

    if (value === null || value === undefined) {
      return snapshot
    }

    return {
      ...snapshot,
      [key]: value,
    }
  }, {})

  return {
    app: 'Viktkollen',
    createdAt: new Date().toISOString(),
    data,
    storageKeys: Object.keys(data),
    version: backupSnapshotVersion,
  }
}

export function isValidUserDataBackupSnapshot(snapshot) {
  return (
    snapshot &&
    typeof snapshot === 'object' &&
    snapshot.app === 'Viktkollen' &&
    snapshot.version === backupSnapshotVersion &&
    snapshot.data &&
    typeof snapshot.data === 'object' &&
    !Array.isArray(snapshot.data)
  )
}

export function restoreUserDataBackupSnapshot(snapshot) {
  if (!isValidUserDataBackupSnapshot(snapshot)) {
    return {
      failedKeys: [],
      ok: false,
      reason: 'Säkerhetskopian har ett ogiltigt format.',
      restoredKeys: [],
    }
  }

  const allowedKeys = new Set(backupStorageKeys)
  const failedKeys = []
  const restoredKeys = []

  Object.entries(snapshot.data).forEach(([key, value]) => {
    if (!allowedKeys.has(key) || value === undefined) {
      return
    }

    if (writeStorage(key, value)) {
      restoredKeys.push(key)
    } else {
      failedKeys.push(key)
    }
  })

  return {
    failedKeys,
    ok: failedKeys.length === 0,
    reason:
      failedKeys.length > 0
        ? 'Några lokala värden kunde inte återställas.'
        : 'Återställning lyckades.',
    restoredKeys,
  }
}
