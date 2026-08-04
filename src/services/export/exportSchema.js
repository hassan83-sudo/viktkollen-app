import { getBackupStorageKeys, userDataKeys } from '../userDataRepository.js'
import { isAllowedSyncStorageKey } from '../sync/syncMetadata.js'

export const dataExportSchemaVersion = 2
export const maxExportPayloadBytes = 5 * 1024 * 1024
export const maxExportArrayItems = 5000
export const maxExportTextLength = 20000

export const blockedExportFieldPatterns = [
  /auth/i,
  /session/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /authorization/i,
  /password/i,
  /supabase/i,
  /service[_-]?role/i,
  /api[_-]?key/i,
  /apikey/i,
  /secret/i,
  /diagnostics/i,
  /stack/i,
  /rawPrompt/i,
  /providerResponse/i,
  /rawResponse/i,
  /blob/i,
  /base64/i,
  /image/i,
]

export const exportExcludedFields = [
  'Inloggningssession',
  'Lösenord',
  'Access tokens',
  'Refresh tokens',
  'API-nycklar',
  'Supabase-session',
  'Diagnostics',
  'Service worker-cache',
  'Råa bilder',
  'Base64',
  'Blob URL',
  'Råa AI-prompter',
  'Råa providerresponser',
]

export const exportSections = Object.freeze([
  {
    defaultSelected: true,
    dependencies: [],
    id: 'profile',
    label: 'Profil och mål',
    storageKeys: [userDataKeys.profile, userDataKeys.progressGoalSettings, userDataKeys.nutritionGoals],
  },
  {
    csvFormat: 'csvMeals',
    defaultSelected: true,
    dependencies: [],
    id: 'meals',
    label: 'Måltider och nutrition',
    storageKeys: [userDataKeys.meals, userDataKeys.favoriteMeals, userDataKeys.mealHistory, userDataKeys.scannedProducts],
  },
  {
    csvFormat: 'csvWeight',
    defaultSelected: true,
    dependencies: [],
    id: 'weightLog',
    label: 'Vikt',
    storageKeys: [userDataKeys.weights, userDataKeys.bodyMeasurements],
  },
  {
    csvFormat: 'csvCheckIns',
    defaultSelected: true,
    dependencies: [],
    id: 'checkIns',
    label: 'Check-ins',
    storageKeys: [userDataKeys.checkIn],
  },
  {
    defaultSelected: true,
    dependencies: [],
    id: 'goalsHabits',
    label: 'Mål och vanor',
    storageKeys: [userDataKeys.goalsHabits],
  },
  {
    defaultSelected: true,
    dependencies: ['goalsHabits'],
    id: 'reminders',
    label: 'Reminders och notiser',
    storageKeys: [userDataKeys.reminders, userDataKeys.reminderLog, userDataKeys.remindersV2],
  },
  {
    defaultSelected: true,
    dependencies: ['goalsHabits', 'reminders'],
    id: 'adaptiveCoach',
    label: 'Adaptive Coach',
    storageKeys: [userDataKeys.adaptiveCoachFeedback, userDataKeys.aiConversationMemory, userDataKeys.aiCoachReports, userDataKeys.chat],
  },
  {
    defaultSelected: true,
    dependencies: ['meals'],
    id: 'plansRecipes',
    label: 'Planer, recept och inköpslistor',
    storageKeys: [userDataKeys.dietaryPreferences, userDataKeys.mealTemplates, userDataKeys.mealPlans, userDataKeys.shoppingLists, userDataKeys.recipes, userDataKeys.generatedMealPlans],
  },
  {
    defaultSelected: false,
    dependencies: [],
    id: 'progressMetadata',
    label: 'Framstegsmetadata utan bilder',
    storageKeys: [userDataKeys.progressPhotos, userDataKeys.progressReports, userDataKeys.progressInsightsSeen, userDataKeys.bodyAnalysisHistory, userDataKeys.bodyAnalysisLegacyHistory, userDataKeys.bodyAnalysisLatest],
  },
  {
    defaultSelected: false,
    dependencies: [],
    id: 'settings',
    label: 'Appinställningar',
    storageKeys: [userDataKeys.demoMode, userDataKeys.healthDashboardPeriod, userDataKeys.progressDashboardPeriod, userDataKeys.foods],
  },
])

export function getExportableSections() {
  const backupKeys = new Set(getBackupStorageKeys())

  return exportSections.map((section) => ({
    ...section,
    storageKeys: section.storageKeys.filter((key) => key && backupKeys.has(key) && isAllowedSyncStorageKey(key)),
  }))
}

export function getDefaultExportSectionIds() {
  return getExportableSections()
    .filter((section) => section.defaultSelected && section.storageKeys.length)
    .map((section) => section.id)
}

export function getExportStorageKeys(sectionIds = getDefaultExportSectionIds()) {
  const selected = new Set(sectionIds)
  return [...new Set(getExportableSections()
    .filter((section) => selected.has(section.id))
    .flatMap((section) => section.storageKeys))]
}

export function findExportSectionById(sectionId) {
  return getExportableSections().find((section) => section.id === sectionId) || null
}

export function isBlockedExportField(key) {
  return blockedExportFieldPatterns.some((pattern) => pattern.test(String(key || '')))
}

export const exportSchemaInternals = {
  blockedExportFieldPatterns,
}
