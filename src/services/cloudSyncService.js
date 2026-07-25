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
  const isDelete = action === 'delete'
  const isRestore = action === 'restore'

  if (!isSupabaseConfigured()) {
    return 'Supabase är inte konfigurerat ännu.'
  }

  if (message.includes('jwt') || message.includes('session') || message.includes('auth')) {
    if (isDelete) {
      return 'Du behöver vara inloggad för att ta bort säkerhetskopior.'
    }

    return isRestore
      ? 'Du behöver vara inloggad för att återställa.'
      : 'Du behöver vara inloggad för att säkerhetskopiera.'
  }

  if (message.includes('relation') || message.includes('does not exist')) {
    return 'Tabellen för säkerhetskopior saknas i Supabase.'
  }

  if (message.includes('permission') || message.includes('policy') || message.includes('rls')) {
    if (isDelete) {
      return 'Borttagning nekades av Supabase-reglerna.'
    }

    return isRestore
      ? 'Återställning nekades av Supabase-reglerna.'
      : 'Säkerhetskopiering nekades av Supabase-reglerna.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Nätverksfel. Kontrollera anslutningen och försök igen.'
  }

  if (isDelete) {
    return 'Borttagning misslyckades.'
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

function getApproximateBackupSize(snapshot) {
  try {
    return new Blob([JSON.stringify(snapshot)]).size
  } catch {
    return JSON.stringify(snapshot || {}).length
  }
}

function normalizeBackupRow(row) {
  const backup = row.data

  return {
    backup,
    createdAt: row.created_at || row.updated_at,
    id: row.id,
    sizeBytes: getApproximateBackupSize(backup),
    storageKeyCount: Array.isArray(backup?.storageKeys)
      ? backup.storageKeys.length
      : 0,
    updatedAt: row.updated_at,
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
  const { data, error } = await supabase
    .from(backupTable)
    .insert({
      data: backup,
    })
    .select('id, created_at, updated_at')
    .single()

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
    backupCreatedAt: data.created_at,
    backupId: data.id,
    backupUpdatedAt: data.updated_at,
    ok: true,
    reason: 'Säkerhetskopiering lyckades.',
    storageKeys: backup.storageKeys,
  }
}

export async function listUserBackups() {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return {
      ...getCloudSyncStatus(),
      action: 'list',
      backups: [],
      ok: false,
      reason: getCloudActionErrorMessage(auth.error, 'restore'),
    }
  }

  const { data, error } = await supabase
    .from(backupTable)
    .select('id, data, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    return {
      ...getCloudSyncStatus(),
      action: 'list',
      backups: [],
      ok: false,
      reason: getCloudActionErrorMessage(error, 'restore'),
    }
  }

  return {
    ...getCloudSyncStatus(),
    action: 'list',
    backups: (data || []).map(normalizeBackupRow),
    ok: true,
    reason: 'Säkerhetskopior hämtades.',
  }
}

export async function downloadUserData(backupId) {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return {
      ...getCloudSyncStatus(),
      action: 'download',
      ok: false,
      reason: getCloudActionErrorMessage(auth.error, 'restore'),
    }
  }

  let query = supabase
    .from(backupTable)
    .select('id, data, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (backupId) {
    query = query.eq('id', backupId)
  }

  // RLS limits this query to the authenticated user's own rows.
  const { data, error } = backupId
    ? await query.maybeSingle()
    : await query.limit(1).maybeSingle()

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
    backupCreatedAt: data.created_at,
    backupId: data.id,
    backupUpdatedAt: data.updated_at,
    ok: true,
    reason: 'Säkerhetskopian hämtades.',
  }
}

export async function deleteUserBackup(backupId) {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return {
      ...getCloudSyncStatus(),
      action: 'delete',
      ok: false,
      reason: getCloudActionErrorMessage(auth.error, 'delete'),
    }
  }

  if (!backupId) {
    return {
      ...getCloudSyncStatus(),
      action: 'delete',
      ok: false,
      reason: 'Ingen säkerhetskopia valdes.',
    }
  }

  const { error } = await supabase
    .from(backupTable)
    .delete()
    .eq('id', backupId)

  if (error) {
    return {
      ...getCloudSyncStatus(),
      action: 'delete',
      ok: false,
      reason: getCloudActionErrorMessage(error, 'delete'),
    }
  }

  return {
    ...getCloudSyncStatus(),
    action: 'delete',
    backupId,
    ok: true,
    reason: 'Säkerhetskopian togs bort.',
  }
}

export function canConfigureCloudSyncLater() {
  return isSupabaseConfigured()
}
