import { PWA_APP_VERSION, PWA_CACHE_VERSION } from '../registerServiceWorker.js'
import { getBackupStorageKeys, userDataKeys } from './userDataRepository.js'
import { isAllowedSyncStorageKey } from './sync/syncMetadata.js'
import { buildReminderStatus } from './reminders/reminderScheduler.js'

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
      storageHealth: hasStorage() ? 'Tillgänglig' : 'Saknas',
      syncAllowedReminders: isAllowedSyncStorageKey(userDataKeys.remindersV2),
      syncedBackupKeys: getBackupStorageKeys().length,
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
    pwa: {
      cacheVersion: PWA_CACHE_VERSION,
      manifest: 'public/manifest.webmanifest',
      serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Stöds' : 'Saknas',
    },
    photoAnalysis: {
      maxFileSizeMb: numberFromEnv('VITE_NUTRITION_PHOTO_MAX_FILE_MB', 8),
      mockMode: import.meta.env.MODE !== 'production',
      providerConfigured: import.meta.env.VITE_NUTRITION_PHOTO_REMOTE_ENABLED === 'true',
      rateLimitMax: numberFromEnv('VITE_NUTRITION_PHOTO_RATE_LIMIT_MAX', 12),
      remoteAnalysisEnabled: import.meta.env.VITE_NUTRITION_PHOTO_REMOTE_ENABLED === 'true',
      routeConfigured: 'api/nutrition-photo-analysis',
      timeoutMs: numberFromEnv('VITE_NUTRITION_PHOTO_TIMEOUT_MS', 15000),
    },
    reminders: {
      dueCount: reminderStatus.dueCount,
      enabledCount: reminderStatus.enabledCount,
      nextReminderAt: reminderStatus.nextReminderAt || 'Ingen',
      permissionState: reminderStatus.permissionState,
    },
    sync: {
      status: syncStatus?.status || 'Okänt',
      userId: syncStatus?.userId ? mask(syncStatus.userId) : 'Saknas',
    },
  }
}
