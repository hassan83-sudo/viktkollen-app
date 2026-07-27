import {
  buildCloudBackupPayload,
  compareCloudBackupPayloads,
  createPreRestoreBackup,
  getApproximatePayloadSize,
  getLocalCloudBackupPayload,
  getUndoRestorePreview,
  normalizeCloudBackupPayload,
  restoreCloudBackupPayload,
  validateCloudBackupPayload,
} from './cloudBackupSchema.js'
import {
  classifyCloudError,
  cloudErrorCodes,
  getCloudErrorMessage,
  makeCloudFailure,
} from './cloudSyncErrors.js'
import {
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient.js'
import {
  clearPreRestoreBackup,
  getCloudBackupMeta,
  saveCloudBackupMeta,
} from './userDataRepository.js'

const disabledReason = 'Automatisk molnsynk är avstängd'
const backupTable = 'user_backups'
const syncStateTable = 'user_sync_state'
const syncEventsTable = 'user_sync_events'
const maxHistoryRows = 10

function nowIso() {
  return new Date().toISOString()
}

function getLocalCloudBackupMeta() {
  return getCloudBackupMeta({})
}

function saveLocalCloudBackupMeta(meta) {
  return saveCloudBackupMeta({
    ...getLocalCloudBackupMeta(),
    ...meta,
  })
}

function getLocalEvents() {
  const meta = getLocalCloudBackupMeta()

  return Array.isArray(meta.syncEvents) ? meta.syncEvents : []
}

function saveLocalEvent(event) {
  const events = [
    {
      createdAt: nowIso(),
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...event,
    },
    ...getLocalEvents(),
  ].slice(0, 20)

  saveLocalCloudBackupMeta({ syncEvents: events })

  return events[0]
}

async function getAuthenticatedUser() {
  if (!supabase || !isSupabaseConfigured()) {
    return {
      error: new Error('Supabase är inte konfigurerat.'),
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

function makeFailure(action, error, extra = {}) {
  const code = extra.code || classifyCloudError(error, {
    configured: isSupabaseConfigured(),
  })
  const failure = makeCloudFailure(action, error, {
    ...getCloudSyncStatus(),
    ...extra,
    code,
  })

  saveLocalEvent({
    eventType: action,
    message: failure.reason,
    status: 'failed',
  })

  return failure
}

function normalizeBackupRow(row) {
  const backup = normalizeCloudBackupPayload(row.payload || row.data)
  const sizeBytes = Number(row.size_bytes) || getApproximatePayloadSize(backup)

  return {
    backup,
    checksum: row.checksum || backup?.checksum || '',
    clientId: backup?.clientId || '',
    createdAt: row.created_at || row.updated_at,
    id: row.id,
    isFavorite: Boolean(row.is_favorite),
    name: typeof row.name === 'string' ? row.name : '',
    schemaVersion: Number(row.schema_version) || backup?.schemaVersion || 1,
    sizeBytes,
    storageKeyCount: Array.isArray(backup?.metadata?.storageKeys)
      ? backup.metadata.storageKeys.length
      : Object.keys(backup?.userData || backup?.data || {}).length,
    updatedAt: row.updated_at,
  }
}

function getBackupSelectColumns() {
  return 'id, name, is_favorite, payload, data, schema_version, client_updated_at, created_at, updated_at, size_bytes, checksum'
}

async function getLatestCloudBackup() {
  const { data, error } = await supabase
    .from(backupTable)
    .select(getBackupSelectColumns())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { backup: null, error }
  }

  return {
    backup: data ? normalizeBackupRow(data) : null,
    error: null,
  }
}

async function createCloudEvent(eventType, status, message, metadata = {}) {
  const localEvent = saveLocalEvent({
    eventType,
    message,
    status,
  })

  if (!supabase || !isSupabaseConfigured()) {
    return localEvent
  }

  try {
    const { error } = await supabase
      .from(syncEventsTable)
      .insert({
        event_type: eventType,
        message,
        metadata,
        status,
      })

    if (error) {
      console.warn('[Viktkollen molnbackup] Synkhändelsen kunde inte sparas.', {
        eventType,
        status,
      })

      return null
    }
  } catch {
    console.warn('[Viktkollen molnbackup] Synkhändelsen kunde inte sparas.', {
      eventType,
      status,
    })

    return null
  }

  return localEvent
}

async function updateSyncState(payload, latestBackupId, direction, status) {
  if (!supabase || !isSupabaseConfigured()) {
    return null
  }

  const state = {
    cloud_updated_at: nowIso(),
    client_updated_at: payload?.exportedAt || nowIso(),
    last_sync_direction: direction,
    last_sync_status: status,
    latest_backup_id: latestBackupId || null,
    schema_version: payload?.schemaVersion || 2,
  }

  const { error } = await supabase
    .from(syncStateTable)
    .upsert(state, { onConflict: 'user_id' })

  return error
}

function getConflictRecommendation(status) {
  const recommendations = {
    CLOUD_NEWER: 'Molnversionen är nyare. Förhandsgranska innan återställning.',
    CLOUD_ONLY: 'Det finns bara molndata. Förhandsgranska innan du återställer.',
    CONFLICT: 'Båda versionerna har ändrats. Välj vilken version du vill behålla.',
    IN_SYNC: 'Versionerna är identiska.',
    LOCAL_NEWER: 'Lokal data är nyare. Skicka den till molnet.',
    LOCAL_ONLY: 'Det finns bara lokal data. Spara den i molnet om du vill.',
    UNKNOWN: 'Status kunde inte avgöras. Uppdatera status och kontrollera igen.',
  }

  return recommendations[status] || recommendations.UNKNOWN
}

export function analyzeCloudConflict(localPayload, cloudPayload) {
  const local = normalizeCloudBackupPayload(localPayload)
  const cloud = normalizeCloudBackupPayload(cloudPayload)

  if (local && !cloud) {
    return {
      recommendation: getConflictRecommendation('LOCAL_ONLY'),
      status: 'LOCAL_ONLY',
    }
  }

  if (!local && cloud) {
    return {
      recommendation: getConflictRecommendation('CLOUD_ONLY'),
      status: 'CLOUD_ONLY',
    }
  }

  if (!local || !cloud) {
    return {
      recommendation: getConflictRecommendation('UNKNOWN'),
      status: 'UNKNOWN',
    }
  }

  const comparison = compareCloudBackupPayloads(local, cloud)

  if (comparison.identical || comparison.checksumMatches) {
    return {
      recommendation: getConflictRecommendation('IN_SYNC'),
      status: 'IN_SYNC',
    }
  }

  const localTime = new Date(local.exportedAt).getTime()
  const cloudTime = new Date(cloud.exportedAt).getTime()

  if (local.clientId !== cloud.clientId && localTime !== cloudTime) {
    return {
      recommendation: getConflictRecommendation('CONFLICT'),
      status: 'CONFLICT',
    }
  }

  const status = localTime > cloudTime ? 'LOCAL_NEWER' : 'CLOUD_NEWER'

  return {
    recommendation: getConflictRecommendation(status),
    status,
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

export async function pushLocalDataToCloud(name = '') {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('backup', auth.error)
  }

  const payload = buildCloudBackupPayload({ name, source: 'manual-push' })
  const validation = validateCloudBackupPayload(payload)

  if (!validation.ok) {
    return makeFailure('backup', new Error(validation.reason), {
      code: cloudErrorCodes.INVALID_PAYLOAD,
    })
  }

  const latest = await getLatestCloudBackup()

  if (latest.error) {
    return makeFailure('backup', latest.error)
  }

  if (latest.backup?.checksum && latest.backup.checksum === validation.payload.checksum) {
    await createCloudEvent('backup', 'skipped', 'Molnet har redan den senaste versionen.', {
      checksum: validation.payload.checksum,
    })

    return {
      ...getCloudSyncStatus(),
      action: 'upload',
      backupId: latest.backup.id,
      backupUpdatedAt: latest.backup.updatedAt,
      ok: true,
      reason: 'Molnet har redan den senaste versionen.',
      skipped: true,
    }
  }

  const { data, error } = await supabase
    .from(backupTable)
    .insert({
      checksum: validation.payload.checksum,
      client_updated_at: validation.payload.exportedAt,
      is_favorite: false,
      name: name.trim() || null,
      payload: validation.payload,
      schema_version: validation.payload.schemaVersion,
      size_bytes: validation.payload.metadata.sizeBytes,
    })
    .select('id, name, is_favorite, payload, schema_version, client_updated_at, created_at, updated_at, size_bytes, checksum')
    .single()

  if (error) {
    return makeFailure('backup', error)
  }

  const normalized = normalizeBackupRow(data)
  const stateError = await updateSyncState(validation.payload, normalized.id, 'push', 'success')

  if (stateError) {
    return makeFailure('backup', stateError)
  }

  await createCloudEvent('backup', 'success', 'Lokal data sparades i molnet.', {
    backupId: normalized.id,
    checksum: normalized.checksum,
    sizeBytes: normalized.sizeBytes,
  })
  saveLocalCloudBackupMeta({
    latestBackupAt: normalized.createdAt,
    latestBackupId: normalized.id,
    latestSyncAt: nowIso(),
  })

  return {
    ...getCloudSyncStatus(),
    action: 'upload',
    backup: normalized,
    backupCreatedAt: normalized.createdAt,
    backupId: normalized.id,
    backupUpdatedAt: normalized.updatedAt,
    ok: true,
    reason: 'Säkerhetskopiering lyckades.',
    storageKeys: validation.payload.metadata.storageKeys,
  }
}

export async function listUserBackups() {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('list', auth.error, { backups: [] })
  }

  const { count, data, error } = await supabase
    .from(backupTable)
    .select(getBackupSelectColumns(), { count: 'exact' })
    .order('is_favorite', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(maxHistoryRows)

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

export async function previewCloudRestore(backupId = '') {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return makeFailure('preview', auth.error)
  }

  let query = supabase
    .from(backupTable)
    .select(getBackupSelectColumns())
    .order('created_at', { ascending: false })

  if (backupId) {
    query = query.eq('id', backupId)
  }

  const { data, error } = backupId
    ? await query.maybeSingle()
    : await query.limit(1).maybeSingle()

  if (error) {
    return makeFailure('preview', error)
  }

  if (!data) {
    return makeFailure('preview', new Error('Backup not found'), {
      code: cloudErrorCodes.BACKUP_NOT_FOUND,
    })
  }

  const backup = normalizeBackupRow(data)
  const validation = validateCloudBackupPayload(backup.backup)

  if (!validation.ok) {
    return makeFailure('preview', new Error(validation.reason), {
      code: cloudErrorCodes.INVALID_PAYLOAD,
    })
  }

  const localPayload = getLocalCloudBackupPayload()
  const conflict = analyzeCloudConflict(localPayload, validation.payload)

  await createCloudEvent('preview', 'success', 'Molnversion förhandsgranskades.', {
    backupId: backup.id,
    conflictStatus: conflict.status,
  })

  return {
    ...getCloudSyncStatus(),
    action: 'preview',
    backup: {
      ...backup,
      backup: validation.payload,
    },
    conflict,
    local: {
      clientId: localPayload.clientId,
      checksum: localPayload.checksum,
      exportedAt: localPayload.exportedAt,
      sizeBytes: localPayload.metadata.sizeBytes,
      storageKeyCount: localPayload.metadata.storageKeyCount,
    },
    ok: true,
    preview: {
      backupName: backup.name || 'Namnlös backup',
      clientId: validation.payload.clientId,
      cloudUpdatedAt: backup.updatedAt,
      createdAt: backup.createdAt,
      schemaVersion: validation.payload.schemaVersion,
      sizeBytes: backup.sizeBytes,
      storageKeyCount: validation.payload.metadata.storageKeyCount,
    },
    reason: 'Molnversionen förhandsgranskades.',
  }
}

export async function restoreCloudBackup(backupId = '') {
  const preview = await previewCloudRestore(backupId)

  if (!preview.ok) {
    await createCloudEvent('restore', 'failed', preview.reason)
    return preview
  }

  createPreRestoreBackup()
  const restoreResult = restoreCloudBackupPayload(preview.backup.backup)

  if (!restoreResult.ok) {
    await createCloudEvent('restore', 'failed', restoreResult.reason, {
      backupId: preview.backup.id,
    })

    return {
      ...getCloudSyncStatus(),
      action: 'restore',
      ok: false,
      reason: restoreResult.reason,
    }
  }

  const stateError = await updateSyncState(preview.backup.backup, preview.backup.id, 'pull', 'success')

  if (stateError) {
    return makeFailure('restore', stateError)
  }

  await createCloudEvent('restore', 'success', 'Molnbackup återställdes till lokal lagring.', {
    backupId: preview.backup.id,
    restoredKeyCount: restoreResult.restoredKeys.length,
  })
  saveLatestRestoreMeta(preview.backup)

  return {
    ...getCloudSyncStatus(),
    action: 'restore',
    backup: preview.backup,
    ok: true,
    reason: 'Återställning lyckades.',
    restoreResult,
  }
}

export function getUndoRestoreStatus() {
  return getUndoRestorePreview()
}

export async function undoLatestRestore() {
  const undo = getUndoRestorePreview()

  if (!undo.ok) {
    return {
      ...getCloudSyncStatus(),
      action: 'undo-restore',
      ok: false,
      reason: undo.reason || 'Det finns ingen giltig ångra-backup.',
    }
  }

  const result = restoreCloudBackupPayload(undo.payload)

  if (!result.ok) {
    await createCloudEvent('undo_restore', 'failed', result.reason)
    return {
      ...getCloudSyncStatus(),
      action: 'undo-restore',
      ok: false,
      reason: result.reason,
    }
  }

  clearPreRestoreBackup()
  await createCloudEvent('undo_restore', 'success', 'Senaste återställning ångrades.', {
    restoredKeyCount: result.restoredKeys.length,
  })

  return {
    ...getCloudSyncStatus(),
    action: 'undo-restore',
    ok: true,
    reason: 'Senaste återställning ångrades.',
    restoreResult: result,
  }
}

export async function getCloudDashboardStatus() {
  const auth = await getAuthenticatedUser()
  const localMeta = getLocalCloudBackupMeta()

  if (auth.error) {
    const code = classifyCloudError(auth.error, { configured: isSupabaseConfigured() })

    return {
      ...getCloudSyncStatus(),
      backupCount: 0,
      databaseStatus: code === cloudErrorCodes.NOT_CONFIGURED ? 'Inte konfigurerad' : 'Ej inloggad',
      isAuthenticated: false,
      latestBackup: null,
      latestRestoreAt: localMeta.latestRestoreAt || null,
      latestSyncAt: localMeta.latestSyncAt || null,
      ok: false,
      reason: getCloudErrorMessage(code),
      syncStatus: 'Inaktiv',
    }
  }

  const { count, data, error } = await supabase
    .from(backupTable)
    .select(getBackupSelectColumns(), { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    const code = classifyCloudError(error, { configured: isSupabaseConfigured() })

    return {
      ...getCloudSyncStatus(),
      backupCount: 0,
      databaseStatus: code === cloudErrorCodes.TABLE_MISSING ? 'Tabell saknas' : getCloudErrorMessage(code),
      isAuthenticated: true,
      latestBackup: null,
      latestRestoreAt: localMeta.latestRestoreAt || null,
      latestSyncAt: localMeta.latestSyncAt || null,
      ok: false,
      reason: getCloudErrorMessage(code),
      syncStatus: 'Endast manuell',
    }
  }

  return {
    ...getCloudSyncStatus(),
    backupCount: count || 0,
    databaseStatus: 'Tillgänglig',
    isAuthenticated: true,
    latestBackup: data?.[0] ? normalizeBackupRow(data[0]) : null,
    latestRestoreAt: localMeta.latestRestoreAt || null,
    latestSyncAt: localMeta.latestSyncAt || null,
    ok: true,
    reason: 'Molnstatus hämtades.',
    syncStatus: 'Endast manuell',
  }
}

export async function getSyncEvents() {
  const auth = await getAuthenticatedUser()

  if (auth.error) {
    return {
      ...makeFailure('events', auth.error),
      events: getLocalEvents(),
    }
  }

  const { data, error } = await supabase
    .from(syncEventsTable)
    .select('id, event_type, status, message, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return {
      ...makeFailure('events', error),
      events: getLocalEvents(),
    }
  }

  return {
    ...getCloudSyncStatus(),
    action: 'events',
    events: (data || []).map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      message: event.message,
      status: event.status,
    })),
    ok: true,
    reason: 'Synkhistorik hämtades.',
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
    .select(getBackupSelectColumns())
    .maybeSingle()

  if (error) {
    return makeFailure('update', error)
  }

  if (!data) {
    return makeFailure('update', new Error('Backup not found'), {
      code: cloudErrorCodes.BACKUP_NOT_FOUND,
    })
  }

  await createCloudEvent('update', 'success', 'Backupens metadata uppdaterades.', {
    backupId,
  })

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
    return makeFailure('delete', new Error('Backup not found'), {
      code: cloudErrorCodes.BACKUP_NOT_FOUND,
    })
  }

  const { error } = await supabase
    .from(backupTable)
    .delete()
    .in('id', ids)

  if (error) {
    return makeFailure('delete', error)
  }

  await createCloudEvent('delete', 'success', ids.length === 1
    ? 'En molnbackup raderades.'
    : 'Flera molnbackuper raderades.', {
    backupIds: ids,
  })

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
    latestRestoreAt: nowIso(),
    latestRestoreBackupId: backup?.id || '',
    latestRestoreName: backup?.name || '',
    latestSyncAt: nowIso(),
  }

  saveLocalCloudBackupMeta(meta)

  return getLocalCloudBackupMeta()
}

export function canConfigureCloudSyncLater() {
  return isSupabaseConfigured()
}

export async function uploadUserData(name = '') {
  return pushLocalDataToCloud(name)
}

export async function downloadUserData(backupId) {
  return previewCloudRestore(backupId)
}
