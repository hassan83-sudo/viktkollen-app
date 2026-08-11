import { useCallback, useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import { getSafeErrorMessage } from '../services/appErrorService.js'
import { loadCloudSyncEngine } from '../services/cloudRuntimeLoader.js'
import { globalSyncCoordinator } from '../services/sync/crossTabSyncCoordinator.js'
import { readSyncMetadata } from '../services/sync/syncMetadata.js'
import { getSyncStatusSnapshot, subscribeSyncStatus } from '../services/sync/syncStatusStore.js'

const defaultCloudSyncStatus = {
  conflicts: [],
  deviceId: '',
  enabled: false,
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  lastError: '',
  lastSuccessfulSyncAt: '',
  pendingCount: 0,
  queue: { items: [] },
  status: 'Automatisk synk är av',
  statusCode: 'disabled',
  statusLabel: 'Automatisk synk är av',
  waitingRetryCount: 0,
}

function getInitialCloudSyncStatus() {
  const metadata = readSyncMetadata()

  return {
    ...defaultCloudSyncStatus,
    conflicts: metadata.conflicts,
    deviceId: metadata.deviceId,
    enabled: metadata.enabled,
    lastError: metadata.lastError,
    lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt,
    pendingCount: metadata.pendingKeys.length,
    status: metadata.enabled ? 'Synkar...' : 'Automatisk synk är av',
    statusCode: metadata.enabled ? 'pending' : 'disabled',
    statusLabel: metadata.enabled ? 'Synkar...' : 'Automatisk synk är av',
  }
}

function formatDateTime(value) {
  if (!value) return 'Aldrig'

  try {
    return new Date(value).toLocaleString('sv-SE')
  } catch {
    return 'Okänt'
  }
}

function shortDeviceId(deviceId) {
  if (!deviceId) return 'Saknas'

  return `${deviceId.slice(0, 12)}...`
}

function CloudSyncPanel({ isAuthenticated, onDataChanged, userId }) {
  const syncStatusSnapshot = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatusSnapshot,
    getSyncStatusSnapshot,
  )
  const [status, setStatus] = useState(() => getInitialCloudSyncStatus())
  const [isSyncing, setIsSyncing] = useState(false)
  const [message, setMessage] = useState('')

  const refreshStatus = useCallback(async () => {
    const { getCloudSyncStatusModel } = await loadCloudSyncEngine()
    setStatus(getCloudSyncStatusModel())
  }, [])

  const syncNow = useCallback(async () => {
    if (!isAuthenticated) return

    setIsSyncing(true)
    setMessage('')

    try {
      const result = await globalSyncCoordinator.syncNow('manual')

      if (result.ok && (result.downloaded?.length || result.merged?.length)) {
        onDataChanged?.()
      }
      setMessage(result.ok ? 'Sync klar.' : result.error || 'Sync kunde inte slutföras.')
    } catch (error) {
      setMessage(getSafeErrorMessage(error, { area: 'network' }))
    } finally {
      void refreshStatus().catch(() => {})
      setIsSyncing(false)
    }
  }, [isAuthenticated, onDataChanged, refreshStatus])

  const toggleEnabled = useCallback(async () => {
    const next = !status.enabled

    try {
      const { runCloudSync, setCloudSyncEnabled } = await loadCloudSyncEngine()

      setCloudSyncEnabled(next)
      await refreshStatus()

      if (next && isAuthenticated) {
        setIsSyncing(true)
        const result = await runCloudSync({ force: true, userId })
        if (result.ok && (result.downloaded?.length || result.merged?.length)) {
          onDataChanged?.()
        }
        setMessage(result.ok ? 'Automatisk sync är på.' : result.error || 'Sync kunde inte startas.')
        return
      }

      setMessage('Automatisk sync är av.')
    } catch (error) {
      setMessage(getSafeErrorMessage(error, { area: 'network' }))
    } finally {
      void refreshStatus().catch(() => {})
      setIsSyncing(false)
    }
  }, [isAuthenticated, onDataChanged, refreshStatus, status.enabled, userId])

  const resolveConflict = useCallback(async (storageKey, choice) => {
    setIsSyncing(true)

    try {
      const { resolveStoredSyncConflict } = await loadCloudSyncEngine()
      const result = await resolveStoredSyncConflict(storageKey, choice, { userId })

      if (result.ok && result.downloaded?.length) {
        onDataChanged?.()
      }
      setMessage(result.ok ? 'Konflikten är löst.' : result.error || 'Konflikten kunde inte lösas.')
    } catch (error) {
      setMessage(getSafeErrorMessage(error, { area: 'network' }))
    } finally {
      void refreshStatus().catch(() => {})
      setIsSyncing(false)
    }
  }, [onDataChanged, refreshStatus, userId])

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      try {
        const { getCloudSyncStatusModel } = await loadCloudSyncEngine()

        if (!cancelled) {
          setStatus(getCloudSyncStatusModel())
        }
      } catch {
        if (!cancelled) {
          setStatus(defaultCloudSyncStatus)
        }
      }
    }

    void loadStatus()

    return () => {
      cancelled = true
    }
  }, [])

  const conflicts = useMemo(() => status.conflicts || [], [status.conflicts])

  if (!isAuthenticated) return null

  return (
    <article className="panel cloud-sync-panel" id="cloud-sync">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cloud Sync V2/V3</p>
          <h2>Automatisk sync</h2>
        </div>
        <div className="cloud-sync-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={toggleEnabled}
            disabled={isSyncing}
            aria-pressed={status.enabled}
          >
            {status.enabled ? 'Stäng av' : 'Slå på'}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={syncNow}
            disabled={isSyncing}
          >
            {isSyncing ? 'Synkar...' : 'Synca nu'}
          </button>
        </div>
      </div>

      <p className="panel-copy">
        Automatisk sync speglar godkända appdata nyckel för nyckel. Manuell Cloud Backup finns kvar separat.
      </p>

      <div className="cloud-status-grid">
        <div>
          <span>Autosync</span>
          <strong>{status.enabled ? 'På' : 'Av'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{syncStatusSnapshot.statusLabel || status.statusLabel || status.status}</strong>
        </div>
        <div>
          <span>Senast klar</span>
          <strong>{formatDateTime(status.lastSuccessfulSyncAt)}</strong>
        </div>
        <div>
          <span>Ändringar i kö</span>
          <strong>{status.pendingCount ? `${status.pendingCount} väntar på synk` : 'Inga'}</strong>
        </div>
        <div>
          <span>Nätverk</span>
          <strong>{status.isOnline ? 'Online' : 'Offline'}</strong>
        </div>
        <div>
          <span>Enhet</span>
          <strong>{shortDeviceId(status.deviceId)}</strong>
        </div>
        <div>
          <span>Konflikter</span>
          <strong>{conflicts.length}</strong>
        </div>
        <div>
          <span>Synkstatus</span>
          <strong>{status.statusCode === 'pending' || status.statusCode === 'dirty' ? 'På väg' : syncStatusSnapshot.statusLabel || status.statusLabel || status.status}</strong>
        </div>
        <div>
          <span>Enheter</span>
          <strong>{status.activeDeviceCount ?? 1}</strong>
        </div>
      </div>

      {(message || status.lastError) && (
        <p
          aria-live={status.lastError ? 'assertive' : 'polite'}
          className={status.lastError ? 'form-error' : 'form-success'}
          role="status"
        >
          {message || status.lastError}
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="cloud-sync-conflicts">
          <h3>Konflikter</h3>
          {conflicts.map((conflict) => (
            <div className="cloud-sync-conflict" key={conflict.storageKey}>
              <div>
                <strong>{conflict.dataType || conflict.storageKey}</strong>
                <span>{conflict.conflictReason || conflict.reason || 'Lokal data och molndata skiljer sig.'}</span>
                <span>Lokalt: {formatDateTime(conflict.localUpdatedAt)}. Moln: {formatDateTime(conflict.remoteUpdatedAt)}.</span>
              </div>
              <div className="cloud-sync-conflict-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => resolveConflict(conflict.storageKey, 'local')}
                  disabled={isSyncing}
                >
                  Behåll lokal
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => resolveConflict(conflict.storageKey, 'remote')}
                  disabled={isSyncing}
                >
                  Använd moln
                </button>
                {conflict.mergeEligibility === 'safe' && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => resolveConflict(conflict.storageKey, 'merge')}
                    disabled={isSyncing}
                  >
                    Säker merge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default CloudSyncPanel
