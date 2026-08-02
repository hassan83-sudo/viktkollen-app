import {
  readStorage,
  removeStorage,
  writeStorage,
} from './appStorageService.js'
import {
  createUpdatedNutritionGoals,
  normalizeNutritionGoals,
} from './nutrition/nutritionGoals.js'

export const userDataKeys = {
  aiConversationMemory: 'viktkollen.aiConversationMemory',
  aiCoachReports: 'viktkollen.aiCoach.reports.v1',
  adaptiveCoachFeedback: 'viktkollen.adaptiveCoach.v1',
  bodyAnalysisHistory: 'viktkollen.bodyAnalysis.history.v1',
  bodyAnalysisLegacyHistory: 'viktkollen.bodyAnalysis.history',
  bodyAnalysisLatest: 'viktkollen.bodyAnalysis.latest',
  chat: 'viktkollen.chat',
  checkIn: 'viktkollen.checkIn',
  cloudBackupMeta: 'viktkollen.cloudBackup.meta',
  demoMode: 'viktkollen.demoMode',
  foods: 'viktkollen.foods',
  goalsHabits: 'viktkollen.goalsHabits.v2',
  healthDashboardPeriod: 'viktkollen.healthDashboard.v2.period',
  favoriteMeals: 'viktkollen.favoriteMeals',
  mealHistory: 'viktkollen.mealAnalysisHistory',
  meals: 'viktkollen.meals',
  nutritionGoals: 'viktkollen.nutritionGoals',
  photoMeals: 'viktkollen.photoMeals',
  profile: 'viktkollen.profile',
  progressGoalSettings: 'viktkollen.progress.goalSettings',
  progressInsightsSeen: 'viktkollen.progress.insightsSeen',
  progressPhotos: 'viktkollen.progressPhotos',
  progressReports: 'viktkollen.progress.reports.v1',
  bodyMeasurements: 'viktkollen.bodyMeasurements',
  reminderLog: 'viktkollen.reminderLog',
  reminderSchedulerLock: 'viktkollen.reminders.v2.schedulerLock',
  remindersV2: 'viktkollen.reminders.v2',
  reminders: 'viktkollen.reminders',
  scannedProducts: 'viktkollen.scannedProducts',
  weights: 'viktkollen.weights',
}

const backupSnapshotVersion = 1
export const cloudClientIdKey = 'viktkollen.clientId'
export const preRestoreBackupKey = 'viktkollen.preRestoreBackup'
const sensitiveBackupKeyPatterns = [
  /auth/i,
  /session/i,
  /supabase/i,
  /token/i,
]
const backupStorageKeys = Object.values(userDataKeys).filter((key) =>
  key !== userDataKeys.reminderSchedulerLock &&
  sensitiveBackupKeyPatterns.every((pattern) => !pattern.test(key)),
)

export function getBackupStorageKeys() {
  return [...backupStorageKeys]
}

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

export function getGoalsHabits(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.goalsHabits, fallbackValue, isValid)
}

export function saveGoalsHabits(value) {
  return saveValue(userDataKeys.goalsHabits, value)
}

export function getAdaptiveCoachFeedback(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.adaptiveCoachFeedback, fallbackValue, isValid)
}

export function saveAdaptiveCoachFeedback(value) {
  return saveValue(userDataKeys.adaptiveCoachFeedback, value)
}

export function getHealthDashboardPeriod(fallbackValue = '30d', isValid) {
  return readValidated(userDataKeys.healthDashboardPeriod, fallbackValue, isValid)
}

export function saveHealthDashboardPeriod(value) {
  return saveValue(userDataKeys.healthDashboardPeriod, value)
}

export function getMeals(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.meals, fallbackValue, isValid)
}

export function saveMeals(meals) {
  return saveValue(userDataKeys.meals, meals)
}

export function getNutritionGoals(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.nutritionGoals, fallbackValue, isValid)
}

export function saveNutritionGoals(goals) {
  return saveValue(userDataKeys.nutritionGoals, normalizeNutritionGoals(goals))
}

export function readNutritionGoals() {
  return normalizeNutritionGoals(readStorage(userDataKeys.nutritionGoals, {}))
}

export function writeNutritionGoals(goals) {
  return saveNutritionGoals(goals)
}

export function updateNutritionGoals(draft, options = {}) {
  const result = createUpdatedNutritionGoals(readNutritionGoals(), draft, options)

  if (result.goals) {
    saveNutritionGoals(result.goals)
  }

  return result
}

export function clearNutritionGoals() {
  removeStorage(userDataKeys.nutritionGoals)

  return {}
}

export function getFavoriteMeals(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.favoriteMeals, fallbackValue, isValid)
}

export function saveFavoriteMeals(favorites) {
  return saveValue(userDataKeys.favoriteMeals, favorites)
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

export function getBodyMeasurements(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.bodyMeasurements, fallbackValue, isValid)
}

export function saveBodyMeasurements(measurements) {
  return saveValue(userDataKeys.bodyMeasurements, measurements)
}

export function getProgressGoalSettings(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.progressGoalSettings, fallbackValue, isValid)
}

export function saveProgressGoalSettings(settings) {
  return saveValue(userDataKeys.progressGoalSettings, settings)
}

export function getProgressReports(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.progressReports, fallbackValue, isValid)
}

export function saveProgressReports(reports) {
  return saveValue(userDataKeys.progressReports, reports)
}

export function getProgressInsightsSeen(fallbackValue = [], isValid) {
  return readValidated(userDataKeys.progressInsightsSeen, fallbackValue, isValid)
}

export function saveProgressInsightsSeen(types) {
  return saveValue(userDataKeys.progressInsightsSeen, types)
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

export function getRemindersV2(fallbackValue = {}, isValid) {
  return readValidated(userDataKeys.remindersV2, fallbackValue, isValid)
}

export function saveRemindersV2(value) {
  return saveValue(userDataKeys.remindersV2, value)
}

export function getAiConversationMemory(fallbackValue = []) {
  return readStorage(userDataKeys.aiConversationMemory, fallbackValue)
}

export function saveAiConversationMemory(messages) {
  return saveValue(userDataKeys.aiConversationMemory, messages)
}

export function getAiCoachReports(fallbackValue = []) {
  return readStorage(userDataKeys.aiCoachReports, fallbackValue)
}

export function saveAiCoachReports(reports) {
  return saveValue(userDataKeys.aiCoachReports, reports)
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

export function getCloudBackupMeta(fallbackValue = {}) {
  return readStorage(userDataKeys.cloudBackupMeta, fallbackValue)
}

export function saveCloudBackupMeta(meta) {
  return saveValue(userDataKeys.cloudBackupMeta, meta)
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

export function getCloudClientId() {
  const existing = readStorage(cloudClientIdKey, '')

  if (typeof existing === 'string' && existing.startsWith('viktkollen-client-')) {
    return existing
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  const clientId = `viktkollen-client-${randomPart}`

  writeStorage(cloudClientIdKey, clientId)

  return clientId
}

export function savePreRestoreBackup(snapshot) {
  return writeStorage(preRestoreBackupKey, {
    createdAt: new Date().toISOString(),
    snapshot,
  })
}

export function getPreRestoreBackup(fallbackValue = null) {
  return readStorage(preRestoreBackupKey, fallbackValue)
}

export function clearPreRestoreBackup() {
  return removeStorage(preRestoreBackupKey)
}
