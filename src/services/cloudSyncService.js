import {
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient.js'
import {
  getCloudBackupMeta,
  getUserDataBackupSnapshot,
  isValidUserDataBackupSnapshot,
  saveCloudBackupMeta,
} from './userDataRepository.js'

const disabledReason = 'Cloud sync is not enabled yet'
const backupTable = 'user_backups'

function getCloudActionErrorMessage(error, action) {
  const message = String(error?.message || '').toLocaleLowerCase('sv-SE')
  const labels = {
    backup: 'säkerhetskopiera',
    delete: 'ta bort säkerhetskopior',
    list: 'hämta säkerhetskopior',
    rename: 'byta namn på säkerhetskopior',
    restore: 'återställa',
    update: 'uppdatera säkerhetskopior',
  }

  if (!isSupabaseConfigured()) {
    return 'Supabase är inte konfigurerat ännu.'
  }

  if (message.includes('jwt') || message.includes('session') || message.includes('auth')) {
    return `Du behöver vara inloggad för att ${labels[action] || 'använda molnbackup'}.`
  }

  if (message.includes('relation') || message.includes('does not exist')) {
    return 'Tabellen för säkerhetskopior saknas i Supabase.'
  }

  if (message.includes('permission') || message.includes('policy') || message.includes('rls')) {
    return 'Åtgärden nekades av Supabase-reglerna.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Nätverksfel. Kontrollera anslutningen och försök igen.'
  }

  return 'Molnåtgärden misslyckades.'
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
    isFavorite: Boolean(row.is_favorite),
    name: typeof row.name === 'string' ? row.name : '',
    sizeBytes: getApproximateBackupSize(backup),
    storageKeyCount: Array.isArray(backup?.storageKeys)
      ? backup.storageKeys.length
      : 0,
    updatedAt: row.updated_at,
  }
}

function makeFailure(action, error, extra = {}) {
  return {
    ...getCloudSyncStatus(),
    action,
    ok: false,
    reason: getCloudActionErrorMessage(error, action),
    ...extra,
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

export async function uploadUserData(name = '') {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('backup', auth.error)
  }

  const backup = getUserDataBackupSnapshot()
  const { data, error } = await supabase
    .from(backupTable)
    .insert({
      data: backup,
      is_favorite: false,
      name: name.trim() || null,
    })
    .select('id, name, is_favorite, created_at, updated_at')
    .single()

  if (error) {
    return makeFailure('backup', error)
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
    return makeFailure('list', auth.error, { backups: [] })
  }

  const { count, data, error } = await supabase
    .from(backupTable)
    .select('id, name, is_favorite, data, created_at, updated_at', { count: 'exact' })
    .order('is_favorite', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    return makeFailure('list', error, { backups: [] })
  }

  return {
    ...getCloudSyncStatus(),
    action: 'list',
    backupCount: count || 0,
    backups: (data || []).map(normalizeBackupRow),
    ok: true,
    reason: 'Säkerhetskopior hämtades.',
  }
}

export async function getCloudDashboardStatus() {
  const auth = await getAuthenticatedUser()
  const localMeta = getLocalCloudBackupMeta()

  if (auth.error) {
    return {
      ...getCloudSyncStatus(),
      backupCount: 0,
      databaseStatus: 'Ej tillgänglig',
      isAuthenticated: false,
      latestBackup: null,
      latestRestoreAt: localMeta.latestRestoreAt || null,
      ok: false,
      reason: getCloudActionErrorMessage(auth.error, 'list'),
      syncStatus: 'Manuell backup',
    }
  }

  const { count, data, error } = await supabase
    .from(backupTable)
    .select('id, name, is_favorite, data, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    return {
      ...getCloudSyncStatus(),
      backupCount: 0,
      databaseStatus: 'Fel',
      isAuthenticated: true,
      latestBackup: null,
      latestRestoreAt: localMeta.latestRestoreAt || null,
      ok: false,
      reason: getCloudActionErrorMessage(error, 'list'),
      syncStatus: 'Manuell backup',
    }
  }

  return {
    ...getCloudSyncStatus(),
    backupCount: count || 0,
    databaseStatus: 'Ansluten',
    isAuthenticated: true,
    latestBackup: data?.[0] ? normalizeBackupRow(data[0]) : null,
    latestRestoreAt: localMeta.latestRestoreAt || null,
    ok: true,
    reason: 'Molnstatus hämtades.',
    syncStatus: 'Endast manuell',
  }
}

export async function downloadUserData(backupId) {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('restore', auth.error)
  }

  let query = supabase
    .from(backupTable)
    .select('id, name, is_favorite, data, created_at, updated_at')
    .order('is_favorite', { ascending: false })
    .order('created_at', { ascending: false })

  if (backupId) {
    query = query.eq('id', backupId)
  }

  // RLS limits this query to the authenticated user's own rows.
  const { data, error } = backupId
    ? await query.maybeSingle()
    : await query.limit(1).maybeSingle()

  if (error) {
    return makeFailure('restore', error)
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
    ...normalizeBackupRow(data),
    ok: true,
    reason: 'Säkerhetskopian hämtades.',
  }
}

export async function updateUserBackup(backupId, updates) {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('update', auth.error)
  }

  const payload = {}

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    payload.name = updates.name.trim() || null
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'isFavorite')) {
    payload.is_favorite = Boolean(updates.isFavorite)
  }

  const { data, error } = await supabase
    .from(backupTable)
    .update(payload)
    .eq('id', backupId)
    .select('id, name, is_favorite, data, created_at, updated_at')
    .maybeSingle()

  if (error) {
    return makeFailure('update', error)
  }

  if (!data) {
    return {
      ...getCloudSyncStatus(),
      action: 'update',
      ok: false,
      reason: 'Säkerhetskopian kunde inte uppdateras.',
    }
  }

  return {
    ...getCloudSyncStatus(),
    action: 'update',
    backup: normalizeBackupRow(data),
    ok: true,
    reason: 'Säkerhetskopian uppdaterades.',
  }
}

export async function deleteUserBackup(backupId) {
  return deleteUserBackups([backupId])
}

export async function deleteUserBackups(backupIds) {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('delete', auth.error)
  }

  const ids = [...new Set((backupIds || []).filter(Boolean))]

  if (ids.length === 0) {
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
    .in('id', ids)

  if (error) {
    return makeFailure('delete', error)
  }

  return {
    ...getCloudSyncStatus(),
    action: 'delete',
    deletedIds: ids,
    ok: true,
    reason: ids.length === 1
      ? 'Säkerhetskopian togs bort.'
      : 'Säkerhetskopiorna togs bort.',
  }
}

export function saveLatestRestoreMeta(backup) {
  const meta = {
    ...getCloudBackupMeta({}),
    latestRestoreAt: new Date().toISOString(),
    latestRestoreBackupId: backup?.id || '',
    latestRestoreName: backup?.name || '',
  }

  saveCloudBackupMeta(meta)

  return meta
}

export function getLocalCloudBackupMeta() {
  return getCloudBackupMeta({})
}

export function canConfigureCloudSyncLater() {
  return isSupabaseConfigured()
}
