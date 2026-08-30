import {
  appStorageChangedEvent,
  readStorage,
  removeStorage,
  writeStorage,
} from './appStorageService.js'
import {
  createUpdatedNutritionGoals,
  normalizeNutritionGoals,
} from './nutrition/nutritionGoals.js'
import { PROFILE_PHOTO_STORAGE_KEY } from './profilePhotoStorage.js'
import { normalizeProfile } from './profileService.js'
import { markSyncKeyDirty } from './sync/syncMetadata.js'

export const userDataScopeVersion = 1
export const userDataScopeMetadataKey = 'viktkollen.userDataScope.v1'
export const userDataScopeGuestId = 'guest'

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
  dietaryPreferences: 'viktkollen.dietaryPreferences.v1',
  foods: 'viktkollen.foods',
  generatedMealPlans: 'viktkollen.generatedMealPlans',
  goalsHabits: 'viktkollen.goalsHabits.v2',
  healthDashboardPeriod: 'viktkollen.healthDashboard.v2.period',
  locale: 'viktkollen.locale',
  favoriteMeals: 'viktkollen.favoriteMeals',
  mealHistory: 'viktkollen.mealAnalysisHistory',
  mealPlans: 'viktkollen.mealPlans',
  mealTemplates: 'viktkollen.mealTemplates',
  meals: 'viktkollen.meals',
  memoryStore: 'viktkollen.memory.v1',
  readyStore: 'viktkollen.ready.v1',
  placeStore: 'viktkollen.place.v1',
  nutritionGoals: 'viktkollen.nutritionGoals',
  photoMeals: 'viktkollen.photoMeals',
  profile: 'viktkollen.profile',
  profilePhoto: PROFILE_PHOTO_STORAGE_KEY,
  progressGoalSettings: 'viktkollen.progress.goalSettings',
  progressInsightsSeen: 'viktkollen.progress.insightsSeen',
  progressPhotos: 'viktkollen.progressPhotos',
  progressDashboardPeriod: 'viktkollen.progressDashboard.period',
  progressReports: 'viktkollen.progress.reports.v1',
  recipes: 'viktkollen.recipes',
  bodyMeasurements: 'viktkollen.bodyMeasurements',
  voiceConversationSettings: 'viktkollen.voiceConversation.settings.v1',
  reminderLog: 'viktkollen.reminderLog',
  reminderSchedulerLock: 'viktkollen.reminders.v2.schedulerLock',
  remindersV2: 'viktkollen.reminders.v2',
  reminders: 'viktkollen.reminders',
  scannedProducts: 'viktkollen.scannedProducts',
  shoppingLists: 'viktkollen.shoppingLists',
  weights: 'viktkollen.weights',
}

const scopedLogicalKeys = new Set([
  userDataKeys.profile,
  userDataKeys.weights,
])

const scopedKeySuffixByLogicalKey = {
  [userDataKeys.profile]: 'profile',
  [userDataKeys.weights]: 'weights',
}

const scopedSyncKeySuffixByKey = {
  'viktkollen.sync.crossTab.leader.v1': 'syncCrossTabLeader',
  'viktkollen.syncDeviceId': 'syncDeviceId',
  'viktkollen.syncMetadata': 'syncMetadata',
  'viktkollen.syncQueue': 'syncQueue',
  'viktkollen.syncRestoreSnapshots': 'syncRestoreSnapshots',
}

let activeUserDataScope = {
  kind: 'loading',
  storageId: '',
  userId: '',
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
const backupExcludedKeys = new Set([
  userDataKeys.profilePhoto,
  userDataKeys.reminderSchedulerLock,
])

function isBackupEligibleKey(key) {
  return Boolean(key)
    && !backupExcludedKeys.has(key)
    && sensitiveBackupKeyPatterns.every((pattern) => !pattern.test(key))
}

const backupStorageKeys = Object.values(userDataKeys).filter(isBackupEligibleKey)

export function getBackupStorageKeys() {
  return [...backupStorageKeys]
}

export function getDeletionStorageKeys() {
  return [...new Set(Object.values(userDataKeys).filter(Boolean))]
}

function readValidated(key, fallbackValue, isValid = () => true) {
  const value = readStorage(key, fallbackValue)

  return isValid(value) ? value : fallbackValue
}

function saveValue(key, value) {
  writeStorage(key, value)

  return value
}

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function encodeScopePart(value) {
  return encodeURIComponent(String(value || '')).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function createStorageId(scope) {
  if (scope?.kind === 'authenticated' && scope.userId) {
    return `user.${encodeScopePart(scope.userId)}`
  }

  if (scope?.kind === 'guest') return userDataScopeGuestId

  return ''
}

function scopedStorageKey(logicalKey, scope = activeUserDataScope) {
  if (!scopedLogicalKeys.has(logicalKey)) return logicalKey

  const storageId = scope.storageId || createStorageId(scope)
  const suffix = scopedKeySuffixByLogicalKey[logicalKey]
  if (!storageId || !suffix) return ''

  return `viktkollen.userData.v${userDataScopeVersion}.${storageId}.${suffix}`
}

function readJsonStorage(key, fallbackValue) {
  if (!key) return fallbackValue
  const storage = getStorage()
  if (!storage) return fallbackValue

  try {
    const raw = storage.getItem(key)
    if (raw === null) return fallbackValue
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

function notifyScopedStorageChanged(logicalKey) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const EventConstructor = window.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null)
  if (!EventConstructor) return

  window.dispatchEvent(new EventConstructor(appStorageChangedEvent, {
    detail: { key: logicalKey },
  }))
}

function writeJsonStorage(key, value, {
  logicalKey = key,
  markDirty = logicalKey !== key,
  syncScope = activeUserDataScope,
} = {}) {
  if (!key) return false
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.setItem(key, JSON.stringify(value))
    if (markDirty && logicalKey !== key) {
      markSyncKeyDirty(logicalKey, createScopedSyncStorage(syncScope, storage))
      notifyScopedStorageChanged(logicalKey)
    }
    return true
  } catch {
    return false
  }
}

function normalizeUserDataScope(scope = {}) {
  if (scope.kind === 'authenticated' && scope.userId) {
    const userId = String(scope.userId)
    return {
      kind: 'authenticated',
      storageId: createStorageId({ kind: 'authenticated', userId }),
      userId,
    }
  }

  if (scope.kind === 'guest') {
    return {
      kind: 'guest',
      storageId: userDataScopeGuestId,
      userId: '',
    }
  }

  return {
    kind: 'loading',
    storageId: '',
    userId: '',
  }
}

function readScopeMetadata() {
  return readJsonStorage(userDataScopeMetadataKey, {
    legacyClaim: null,
    version: userDataScopeVersion,
  })
}

function writeScopeMetadata(metadata) {
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.setItem(userDataScopeMetadataKey, JSON.stringify({
      legacyClaim: metadata?.legacyClaim || null,
      version: userDataScopeVersion,
    }))
    return true
  } catch {
    return false
  }
}

function claimLegacyScope(scope) {
  const metadata = readScopeMetadata()
  const owner = metadata?.legacyClaim?.storageId

  if (owner && owner !== scope.storageId) {
    return { claimed: false, metadata }
  }

  if (owner === scope.storageId) {
    return { claimed: true, metadata }
  }

  const nextMetadata = {
    ...metadata,
    legacyClaim: {
      claimedAt: new Date().toISOString(),
      kind: scope.kind,
      storageId: scope.storageId,
      version: userDataScopeVersion,
    },
  }

  return {
    claimed: writeScopeMetadata(nextMetadata),
    metadata: nextMetadata,
  }
}

function copyLegacyValue({ isValid, logicalKey, normalize = (value) => value, scope }) {
  const targetKey = scopedStorageKey(logicalKey, scope)
  if (!targetKey || readJsonStorage(targetKey, null) !== null) return false

  const legacyValue = readStorage(logicalKey, null)
  if (legacyValue === null || legacyValue === undefined) return false
  if (isValid && !isValid(legacyValue)) return false

  const normalizedValue = normalize(legacyValue)
  return writeJsonStorage(targetKey, normalizedValue, {
    logicalKey,
    markDirty: scope.kind === 'authenticated',
    syncScope: scope,
  })
}

export function createUserDataScopeFromAuth({ authLoading = false, userId = '' } = {}) {
  if (authLoading) return normalizeUserDataScope({ kind: 'loading' })
  if (userId) return normalizeUserDataScope({ kind: 'authenticated', userId })
  return normalizeUserDataScope({ kind: 'guest' })
}

export function setActiveUserDataScope(scope = {}) {
  activeUserDataScope = normalizeUserDataScope(scope)
  return activeUserDataScope
}

export function getActiveUserDataScope() {
  return { ...activeUserDataScope }
}

export function isUserDataScopeHydrated(scope = activeUserDataScope, hydratedScopeId = '') {
  const normalizedScope = normalizeUserDataScope(scope)

  return Boolean(normalizedScope.storageId && normalizedScope.storageId === hydratedScopeId)
}

export function getScopedStorageKey(logicalKey, scope = activeUserDataScope) {
  return scopedStorageKey(logicalKey, normalizeUserDataScope(scope))
}

export function createScopedSyncStorage(scope = activeUserDataScope, storage = getStorage()) {
  const normalizedScope = normalizeUserDataScope(scope)
  const mapKey = (key) => {
    const scopedKey = getScopedStorageKey(key, normalizedScope)
    if (scopedKey !== key) return scopedKey

    const suffix = scopedSyncKeySuffixByKey[key]
    if (!suffix || !normalizedScope.storageId) return key

    return `viktkollen.userData.v${userDataScopeVersion}.${normalizedScope.storageId}.${suffix}`
  }

  return {
    getItem: (key) => storage?.getItem?.(mapKey(key)) ?? null,
    removeItem: (key) => storage?.removeItem?.(mapKey(key)),
    setItem: (key, value) => storage?.setItem?.(mapKey(key), String(value)),
  }
}

export function createAuthenticatedUserSyncStorage(userId, storage = getStorage()) {
  const normalizedUserId = String(userId || '').trim()

  if (!normalizedUserId) return null

  return createScopedSyncStorage({
    kind: 'authenticated',
    userId: normalizedUserId,
  }, storage)
}

export function migrateLegacyProfileAndWeights(scope = activeUserDataScope, validators = {}) {
  const normalizedScope = normalizeUserDataScope(scope)
  if (!normalizedScope.storageId) {
    return { migrated: [], ok: false, reason: 'Scope saknas.' }
  }

  const legacyProfile = readStorage(userDataKeys.profile, null)
  const legacyWeights = readStorage(userDataKeys.weights, null)
  const hasLegacyProfile = legacyProfile !== null && legacyProfile !== undefined &&
    (!validators.isProfile || validators.isProfile(legacyProfile))
  const hasLegacyWeights = legacyWeights !== null && legacyWeights !== undefined &&
    (!validators.isWeights || validators.isWeights(legacyWeights))
  if (!hasLegacyProfile && !hasLegacyWeights) {
    return { migrated: [], ok: true, reason: '' }
  }

  const claim = claimLegacyScope(normalizedScope)
  if (!claim.claimed) {
    return { migrated: [], ok: true, reason: 'Legacy-data är redan kopplad till ett annat namespace.' }
  }

  const migrated = []
  if (copyLegacyValue({
    isValid: validators.isProfile,
    logicalKey: userDataKeys.profile,
    normalize: (value) => normalizeProfile(value),
    scope: normalizedScope,
  })) {
    migrated.push(userDataKeys.profile)
  }

  if (copyLegacyValue({
    isValid: validators.isWeights,
    logicalKey: userDataKeys.weights,
    scope: normalizedScope,
  })) {
    migrated.push(userDataKeys.weights)
  }

  return { migrated, ok: true, reason: '' }
}

function readScopedValidated(key, fallbackValue, isValid = () => true) {
  const scopedKey = scopedStorageKey(key)
  if (!scopedKey) return fallbackValue

  const value = readJsonStorage(scopedKey, fallbackValue)
  return isValid(value) ? value : fallbackValue
}

function saveScopedValue(key, value) {
  const scopedKey = scopedStorageKey(key)
  writeJsonStorage(scopedKey, value, {
    logicalKey: key,
    markDirty: activeUserDataScope.kind === 'authenticated',
    syncScope: activeUserDataScope,
  })

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
  const value = readScopedValidated(userDataKeys.profile, fallbackValue, isValid)

  return value ? normalizeProfile(value) : value
}

export function saveProfile(profile) {
  return saveScopedValue(userDataKeys.profile, normalizeProfile(profile, { markCompleted: true }))
}

export function getLocalePreference(fallbackValue = '') {
  const profile = readScopedValidated(userDataKeys.profile, null, (value) => value && typeof value === 'object' && !Array.isArray(value))
  const profileLocale = typeof profile?.locale === 'string' ? profile.locale.trim() : ''
  if (profileLocale) {
    return profileLocale
  }
  return readStorage(userDataKeys.locale, fallbackValue)
}

export function saveLocalePreference(locale, profile = null) {
  saveValue(userDataKeys.locale, locale)

  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    saveScopedValue(userDataKeys.profile, normalizeProfile({
      ...profile,
      locale,
    }))
  }

  return locale
}

export function getWeights(fallbackValue = [], isValid) {
  return readScopedValidated(userDataKeys.weights, fallbackValue, isValid)
}

export function saveWeights(weights) {
  return saveScopedValue(userDataKeys.weights, weights)
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

export function getVoiceConversationSettings(fallbackValue = { aiVoiceEnabled: true }) {
  return readStorage(userDataKeys.voiceConversationSettings, fallbackValue)
}

export function saveVoiceConversationSettings(settings) {
  return saveValue(userDataKeys.voiceConversationSettings, settings)
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
