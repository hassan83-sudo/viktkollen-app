import {
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient.js'
import { getUserDataBackupSnapshot } from './userDataRepository.js'

const disabledReason = 'Cloud sync is not enabled yet'
const backupTable = 'user_backups'

function getBackupErrorMessage(error) {
  const message = String(error?.message || '').toLocaleLowerCase('sv-SE')

  if (!isSupabaseConfigured()) {
    return 'Supabase är inte konfigurerat ännu.'
  }

  if (message.includes('jwt') || message.includes('session') || message.includes('auth')) {
    return 'Du behöver vara inloggad för att säkerhetskopiera.'
  }

  if (message.includes('relation') || message.includes('does not exist')) {
    return 'Tabellen för säkerhetskopior saknas i Supabase.'
  }

  if (message.includes('permission') || message.includes('policy') || message.includes('rls')) {
    return 'Säkerhetskopiering nekades av Supabase-reglerna.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Nätverksfel. Kontrollera anslutningen och försök igen.'
  }

  return 'Säkerhetskopiering misslyckades.'
}

async function getAuthenticatedUser() {
  if (!supabase) {
    return {
      error: new Error('Supabase är inte konfigurerat ännu.'),
      user: null,
    }
  }

  const { data, error } = await supabase.auth.getUser()

  if (error) {
    return { error, user: null }
  }

  if (!data?.user) {
    return {
      error: new Error('Ingen inloggad användare hittades.'),
      user: null,
    }
  }

  return {
    error: null,
    user: data.user,
  }
}

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

export async function uploadUserData() {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return {
      ...getCloudSyncStatus(),
      action: 'upload',
      ok: false,
      reason: getBackupErrorMessage(auth.error),
    }
  }

  const backup = getUserDataBackupSnapshot()
  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from(backupTable)
    .upsert(
      {
        data: backup,
        updated_at: updatedAt,
        user_id: auth.user.id,
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    return {
      ...getCloudSyncStatus(),
      action: 'upload',
      ok: false,
      reason: getBackupErrorMessage(error),
    }
  }

  return {
    ...getCloudSyncStatus(),
    action: 'upload',
    backupUpdatedAt: updatedAt,
    ok: true,
    reason: 'Säkerhetskopiering lyckades.',
    storageKeys: backup.storageKeys,
  }
}

export function canConfigureCloudSyncLater() {
  return isSupabaseConfigured()
}
