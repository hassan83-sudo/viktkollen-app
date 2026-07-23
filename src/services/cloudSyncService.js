import {
  getSupabaseStatus,
  isSupabaseConfigured,
} from './supabaseClient.js'

const disabledReason = 'Cloud sync is not enabled yet'

export function getCloudSyncStatus() {
  const supabaseStatus = getSupabaseStatus()

  return {
    configured: supabaseStatus.configured,
    enabled: false,
    reason: disabledReason,
    supabaseReason: supabaseStatus.reason,
  }
}

export function canUseCloudSync() {
  return false
}

export function uploadUserData() {
  return {
    ...getCloudSyncStatus(),
    action: 'upload',
    skipped: true,
  }
}

export function downloadUserData() {
  return {
    ...getCloudSyncStatus(),
    action: 'download',
    skipped: true,
  }
}

export function canConfigureCloudSyncLater() {
  return isSupabaseConfigured()
}
