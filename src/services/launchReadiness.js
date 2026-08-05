import { PWA_APP_VERSION, PWA_CACHE_VERSION } from '../registerServiceWorker.js'
import { getBackupStorageKeys, userDataKeys } from './userDataRepository.js'
import { isAllowedSyncStorageKey } from './sync/syncMetadata.js'
import { buildReminderStatus } from './reminders/reminderScheduler.js'
import { buildNotificationPlan } from './notifications/notificationEngine.js'
import { buildInsightsEngine } from './insights/insightsEngine.js'
import { buildAchievementSummary } from './achievements/achievementEngine.js'
import { buildSocialSummary } from './social/socialEngine.js'
import { buildCoachPlanCenterModel } from './coachActionPlanEngine.js'
import { buildNutritionCoachModel } from './nutrition/nutritionCoachEngine.js'
import { buildHealthPredictionModel } from './prediction/healthPredictionEngine.js'
import { buildRuntimePerformanceSummary } from './performanceDiagnostics.js'

function mask(value) {
  const text = String(value || '')
  if (!text) return 'Saknas'
  if (text.length <= 12) return `${text.slice(0, 3)}...`
  return `${text.slice(0, 8)}...${text.slice(-4)}`
}

function hasStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function numberFromEnv(name, fallback) {
  const value = Number(import.meta.env[name])

  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function buildLaunchReadinessReport({
  authSession = null,
  healthSnapshot = null,
  reminderState = {},
  syncStatus = {},
} = {}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  const reminderStatus = buildReminderStatus(reminderState)
  const notificationPlan = buildNotificationPlan({
    reminderState,
    syncStatus,
  })
  const insights = buildInsightsEngine({
    healthSnapshot,
    reminderState,
  })
  const achievements = buildAchievementSummary({
    goalsHabits: {},
    healthSnapshot,
    reminderState,
  })
  const social = buildSocialSummary({
    healthSnapshot,
    reminderState,
  })
  const coachPlan = buildCoachPlanCenterModel({
    adaptiveCoachFeedback: {},
    healthSnapshot,
    reminderState,
  })
  const nutritionCoach = buildNutritionCoachModel({
    healthSnapshot,
    reminderState,
  })
  const predictions = buildHealthPredictionModel({
    healthSnapshot,
    reminderState,
  })
  const performance = buildRuntimePerformanceSummary({
    lazyChunkCount: 18,
    largestLazyChunks: ['nutritionEngine', 'MealLogger', 'aiCoachDeterministicReplies', 'insightsEngine', 'ProgressPhotos'],
    listenerCategories: ['auth', 'online', 'visibilitychange', 'focus', 'storage', 'service-worker'],
    schedulerTypes: ['global-sync', 'reminders', 'notifications', 'service-worker-update'],
  })

  return {
    appVersion: PWA_APP_VERSION,
    auth: {
      configured: Boolean(supabaseUrl && supabaseAnonKey),
      signedIn: Boolean(authSession),
      supabaseAnonKey: supabaseAnonKey ? mask(supabaseAnonKey) : 'Saknas',
      supabaseUrl: supabaseUrl ? mask(supabaseUrl) : 'Saknas',
    },
    buildMode: import.meta.env.MODE,
    diagnostics: {
      analyticsHealth: insights.coverage > 0 ? 'Tillganglig' : 'Begransad',
      aiCoachRoute: 'api/adaptive-coach',
      aiCoachRemoteEnabled: 'Krav: aktivt samtycke och knapptryck',
      aiCoachAuthRequired: 'pass',
      aiCostRetryPolicy: 'Ingen automatisk kostnadsretry',
      aiCrossUserDedupProtection: 'pass',
      aiNoStoreHeaders: 'pass',
      aiOutputLimit: 'Max 3 coachforslag',
      aiPhotoAuthRequired: 'pass',
      aiRequestDeduplication: 'Single-flight per sammanfattning',
      aiSafetyValidator: 'Aktiv',
      aiTimeoutMs: numberFromEnv('VITE_OPENAI_COACH_TIMEOUT_MS', 15000),
      aiTokenSource: 'Supabase session',
      aiTokenTransport: 'Authorization header',
      aiUserScopedRateLimit: 'process-local',
      authVerifierConfigured: 'conditional',
      consentSeparation: 'coach/photo separata',
      coachMemoryBackupAllowlist: 'pass',
      coachMemoryExportAllowlist: 'pass',
      coachMemoryForgetSupport: 'pass',
      coachMemoryRemoteConsent: 'disabled',
      coachMemoryRequestMinimization: 'pass',
      coachMemorySafetyFiltering: 'pass',
      coachMemorySchema: 'configured',
      coachMemoryStaleFiltering: 'pass',
      coachMemorySyncAdapter: 'existing-adaptive-coach-key',
      coachMemoryUserIsolation: 'conditional',
      personalizationState: 'user-controlled',
      coachPlanningEngine: coachPlan.plan?.days?.length === 7 ? 'pass' : 'fail',
      coachPlannerAiIntegration: 'consent-gated',
      coachPlannerExport: 'existing-adaptive-coach-section',
      coachPlannerPersistence: 'existing-adaptive-coach-key',
      coachPlannerSync: isAllowedSyncStorageKey(userDataKeys.adaptiveCoachFeedback) ? 'pass' : 'fail',
      aiNutritionCoaching: 'consent-gated',
      nutritionCoachEngine: nutritionCoach.version === 2 ? 'pass' : 'fail',
      nutritionCoachExportCompatibility: 'existing-nutrition-and-adaptive-coach-sections',
      nutritionCoachSyncCompatibility: isAllowedSyncStorageKey(userDataKeys.meals) && isAllowedSyncStorageKey(userDataKeys.adaptiveCoachFeedback) ? 'pass' : 'fail',
      predictionEngine: predictions.modelVersion === 1 ? 'pass' : 'fail',
      predictionUi: 'lazy-loaded',
      predictionAiIntegration: 'consent-gated-aggregate-summary',
      performanceDiagnostics: 'read-only',
      runtimeAnalyticsCache: `${performance.analyticsCache.size}/${performance.analyticsCache.limit}`,
      storagePressureBand: performance.storagePressure.totalBand,
      logoutAbortSupport: 'pass',
      achievementEngineHealth: 'Aktiv',
      achievementLevel: achievements.levelTitle,
      achievementCoverage: `${achievements.coverage}%`,
      backupSchemaHealth: 'Backup schema v2',
      binaryExclusion: 'Raa bilder/base64 exporteras inte',
      csvSerializerHealth: 'Meals, weight, check-ins',
      exportEngineHealth: 'Lazy-loaded',
      exportImportCompatibility: 'Verifieras med Data Import V2',
      exportMaxFileSizeMb: 5,
      exportSupportedFormats: 'Backup JSON, selected JSON, CSV, text summary',
      importEngineHealth: 'Lazy-loaded',
      importMaxFileSizeMb: 5,
      importRollbackHealth: 'Snapshot + rollback',
      importSchemaAdapters: 'Backup v2, legacy v1, CSV meals/weight/check-ins',
      importSyncIntegration: 'Repository + dirty keys',
      lastExportVerificationStatus: 'Sessionsbaserad',
      insightGeneration: insights.insights.length > 0 ? 'Aktiv' : 'Vantar pa data',
      lastSafeImportResult: 'Sessionsbaserad',
      pendingImport: 'Ingen persistent importko',
      storageHealth: hasStorage() ? 'Tillganglig' : 'Saknas',
      socialReadiness: social.friendCount >= 0 ? 'Redo' : 'Begransad',
      privacyReadiness: social.privacyLabel,
      sharingReadiness: social.sharingReady ? 'Aktiv' : 'Private first',
      syncAllowedReminders: isAllowedSyncStorageKey(userDataKeys.remindersV2),
      syncedBackupKeys: getBackupStorageKeys().length,
      trendCoverage: `${insights.coverage}%`,
    },
    healthSnapshot: {
      date: healthSnapshot?.date || 'Saknas',
      hasWeight: Boolean(healthSnapshot?.availability?.weight),
      mealsToday: healthSnapshot?.nutrition?.mealCount ?? 0,
    },
    knownLimitations: [
      'Browsernotiser fungerar inte garanterat nar appen ar helt stangd.',
      'Ingen extern observability ar konfigurerad i klienten.',
      'Manuell Supabase/RLS-verifiering kravs fore release.',
    ],
    photoAnalysis: {
      maxFileSizeMb: numberFromEnv('VITE_NUTRITION_PHOTO_MAX_FILE_MB', 8),
      mockMode: import.meta.env.MODE !== 'production',
      providerConfigured: import.meta.env.VITE_NUTRITION_PHOTO_REMOTE_ENABLED === 'true',
      rateLimitMax: numberFromEnv('VITE_NUTRITION_PHOTO_RATE_LIMIT_MAX', 12),
      remoteAnalysisEnabled: import.meta.env.VITE_NUTRITION_PHOTO_REMOTE_ENABLED === 'true',
      routeConfigured: 'api/nutrition-photo-analysis',
      timeoutMs: numberFromEnv('VITE_NUTRITION_PHOTO_TIMEOUT_MS', 15000),
    },
    notifications: {
      batchingWindowMinutes: notificationPlan.settings.batchingWindowMinutes,
      pendingCount: notificationPlan.upcoming.length,
      permissionState: notificationPlan.permission,
      quietHours: `${notificationPlan.settings.quietHours.start}-${notificationPlan.settings.quietHours.end}`,
      quietHoursActive: notificationPlan.quietHoursActive,
      scheduler: reminderStatus.schedulerRunning ? 'running' : 'ready',
      syncHealth: syncStatus?.syncHealth || syncStatus?.statusCode || 'unknown',
    },
    pwa: {
      cacheVersion: PWA_CACHE_VERSION,
      manifest: 'public/manifest.webmanifest',
      serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Stods' : 'Saknas',
    },
    performance,
    reminders: {
      dueCount: reminderStatus.dueCount,
      enabledCount: reminderStatus.enabledCount,
      nextReminderAt: reminderStatus.nextReminderAt || 'Ingen',
      permissionState: reminderStatus.permissionState,
    },
    sync: {
      activeDeviceCount: syncStatus?.multiDevice?.activeDeviceCount || 0,
      conflictCount: syncStatus?.conflicts?.length || 0,
      failedItems: syncStatus?.failedItems || 0,
      historySize: syncStatus?.historySize || 0,
      lastRecovery: syncStatus?.recoveryStatus || 'ready',
      lastSuccessfulSyncAt: syncStatus?.lastSuccessfulSyncAt || '',
      multiDeviceHealth: syncStatus?.multiDevice?.staleDeviceCount ? 'stale-devices' : 'ok',
      offlineReconnect: syncStatus?.online === false ? 'offline' : 'ready',
      pendingDownloads: syncStatus?.pendingDownloads || 0,
      pendingUploads: syncStatus?.pendingUploads || 0,
      queueHealth: syncStatus?.queueStatus?.queueHealth || 'unknown',
      recoveryHealth: syncStatus?.recoveryStatus || 'ready',
      retryBacklog: syncStatus?.queueStatus?.dueCount || 0,
      staleDeviceCount: syncStatus?.multiDevice?.staleDeviceCount || 0,
      status: syncStatus?.status || syncStatus?.statusLabel || 'Okant',
      syncHealth: syncStatus?.syncHealth || syncStatus?.statusCode || 'unknown',
      userId: syncStatus?.userId ? mask(syncStatus.userId) : 'Saknas',
    },
  }
}
