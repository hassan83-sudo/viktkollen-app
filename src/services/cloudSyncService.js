import {
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient.js'
import {
  getUserDataBackupSnapshot,
  isValidUserDataBackupSnapshot,
} from './userDataRepository.js'

const disabledReason = 'Cloud sync is not enabled yet'
const backupTable = 'user_backups'

function getCloudActionErrorMessage(error, action) {
  const message = String(error?.message || '').toLocaleLowerCase('sv-SE')
  const isRestore = action === 'restore'

  if (!isSupabaseConfigured()) {
    return 'Supabase är inte konfigurerat ännu.'
  }

  if (message.includes('jwt') || message.includes('session') || message.includes('auth')) {
    return isRestore
      ? 'Du behöver vara inloggad för att återställa.'
      : 'Du behöver vara inloggad för att säkerhetskopiera.'
  }

  if (message.includes('relation') || message.includes('does not exist')) {
    return 'Tabellen för säkerhetskopior saknas i Supabase.'
  }

  if (message.includes('permission') || message.includes('policy') || message.includes('rls')) {
    return isRestore
      ? 'Återställning nekades av Supabase-reglerna.'
      : 'Säkerhetskopiering nekades av Supabase-reglerna.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Nätverksfel. Kontrollera anslutningen och försök igen.'
  }

  return isRestore ? 'Återställning misslyckades.' : 'Säkerhetskopiering misslyckades.'
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
      reason: getCloudActionErrorMessage(auth.error, 'backup'),
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
      reason: getCloudActionErrorMessage(error, 'backup'),
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

export async function downloadUserData() {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return {
      ...getCloudSyncStatus(),
      action: 'download',
      ok: false,
      reason: getCloudActionErrorMessage(auth.error, 'restore'),
    }
  }

  const { data, error } = await supabase
    .from(backupTable)
    .select('data, updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) {
    return {
      ...getCloudSyncStatus(),
      action: 'download',
      ok: false,
      reason: getCloudActionErrorMessage(error, 'restore'),
    }
  }

  if (!data?.data) {
    return {
      ...getCloudSyncStatus(),
      action: 'download',
      ok: false,
      reason: 'Ingen säkerhetskopia hittades i molnet.',
    }
  }

  if (!isValidUserDataBackupSnapshot(data.data)) {
    return {
      ...getCloudSyncStatus(),
      action: 'download',
      ok: false,
      reason: 'Säkerhetskopian har ett ogiltigt format.',
    }
  }

  return {
    ...getCloudSyncStatus(),
    action: 'download',
    backup: data.data,
    backupUpdatedAt: data.updated_at,
    ok: true,
    reason: 'Säkerhetskopian hämtades.',
  }
}

export function canConfigureCloudSyncLater() {
  return isSupabaseConfigured()
}
