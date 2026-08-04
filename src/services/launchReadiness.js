import { PWA_APP_VERSION, PWA_CACHE_VERSION } from '../registerServiceWorker.js'
import { getBackupStorageKeys, userDataKeys } from './userDataRepository.js'
import { isAllowedSyncStorageKey } from './sync/syncMetadata.js'
import { buildReminderStatus } from './reminders/reminderScheduler.js'
import { buildNotificationPlan } from './notifications/notificationEngine.js'
import { buildInsightsEngine } from './insights/insightsEngine.js'

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
      analyticsHealth: insights.coverage > 0 ? 'Tillgänglig' : 'Begränsad',
      insightGeneration: insights.insights.length > 0 ? 'Aktiv' : 'Väntar på data',
      storageHealth: hasStorage() ? 'Tillgänglig' : 'Saknas',
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
      'Browsernotiser fungerar inte garanterat när appen är helt stängd.',
      'Ingen extern observability är konfigurerad i klienten.',
      'Manuell Supabase/RLS-verifiering krävs före release.',
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
      serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Stöds' : 'Saknas',
    },
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
      status: syncStatus?.status || syncStatus?.statusLabel || 'Okänt',
      syncHealth: syncStatus?.syncHealth || syncStatus?.statusCode || 'unknown',
      userId: syncStatus?.userId ? mask(syncStatus.userId) : 'Saknas',
    },
  }
}
