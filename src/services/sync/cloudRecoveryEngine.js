import {
  createSyncRestoreSnapshot,
  rollbackSyncRestoreSnapshot,
  syncRestoreSnapshotStorageKey,
  validateIncomingSyncRecord,
} from './syncRestoreSafety.js'
import { syncStorageAllowlist } from './syncMetadata.js'
import { appendCloudSyncHistoryEvent } from './cloudSyncHistory.js'

function safeText(value, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function createCloudRecoverySnapshot(storage, keys = syncStorageAllowlist, options = {}) {
  const snapshot = createSyncRestoreSnapshot(storage, keys, {
    now: options.now,
    reason: safeText(options.reason || 'cloud-recovery', 120),
  })
  appendCloudSyncHistoryEvent({
    eventType: 'recoveryStarted',
    safeSummary: 'Recovery snapshot skapades före riskfylld sync-mutation.',
  }, { now: options.now })
  return snapshot
}

export function rollbackCloudRecovery(snapshot, storage, options = {}) {
  const ok = rollbackSyncRestoreSnapshot(snapshot, storage)
  appendCloudSyncHistoryEvent({
    eventType: ok ? 'recoverySucceeded' : 'recoveryFailed',
    safeSummary: ok ? 'Rollback återställde berörda syncnycklar.' : 'Rollback kunde inte verifieras.',
    technicalCode: ok ? 'rollback_ok' : 'rollback_failed',
  }, { now: options.now })

  return {
    ok,
    recoveryStatus: ok ? 'recovered' : 'recoveryRequired',
    reason: ok ? '' : 'Rollback kunde inte verifieras.',
  }
}

export function applyWithCloudRecovery({ apply, keys = syncStorageAllowlist, now = new Date(), record = null, storage } = {}) {
  if (record) {
    const validation = validateIncomingSyncRecord(record)
    if (!validation.ok) {
      appendCloudSyncHistoryEvent({
        dataType: record.storageKey || record.storage_key,
        eventType: 'recoveryFailed',
        safeSummary: validation.reason,
        technicalCode: 'invalid_record',
      }, { now })
      return { applied: null, ok: false, reason: validation.reason, recoveryStatus: 'blocked' }
    }
  }

  const snapshot = createCloudRecoverySnapshot(storage, keys, { now, reason: 'cloud-recovery-apply' })
  try {
    const applied = typeof apply === 'function' ? apply() : null
    appendCloudSyncHistoryEvent({
      dataType: record?.storageKey || record?.storage_key,
      eventType: 'recoverySucceeded',
      safeSummary: 'Riskfylld sync-mutation applicerades efter snapshot.',
      technicalCode: 'apply_ok',
    }, { now })
    return { applied, ok: true, recoveryStatus: 'ok', snapshot }
  } catch (error) {
    const rollback = rollbackCloudRecovery(snapshot, storage, { now })
    return {
      applied: null,
      ok: false,
      reason: safeText(error?.message || rollback.reason || 'Sync-mutation kunde inte appliceras.'),
      recoveryStatus: rollback.ok ? 'recovered' : 'recoveryRequired',
      snapshot,
    }
  }
}

export function getCloudRecoveryStatus(storage) {
  try {
    const snapshots = JSON.parse(storage?.getItem?.(syncRestoreSnapshotStorageKey) || '[]')
    return {
      latestRecoveryAt: Array.isArray(snapshots) ? snapshots[0]?.createdAt || '' : '',
      recoveryStatus: 'ready',
      snapshotCount: Array.isArray(snapshots) ? snapshots.length : 0,
    }
  } catch {
    return {
      latestRecoveryAt: '',
      recoveryStatus: 'recoveryRequired',
      snapshotCount: 0,
    }
  }
}
