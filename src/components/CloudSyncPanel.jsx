import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCloudSyncStatusModel,
  resolveStoredSyncConflict,
  runCloudSync,
  setCloudSyncEnabled,
} from '../services/sync/cloudSyncEngine.js'

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

function CloudSyncPanel({ isAuthenticated, userId }) {
  const [status, setStatus] = useState(() => getCloudSyncStatusModel())
  const [isSyncing, setIsSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const hasAutoSyncedRef = useRef(false)

  const refreshStatus = useCallback(() => {
    setStatus(getCloudSyncStatusModel())
  }, [])

  const syncNow = useCallback(async () => {
    if (!isAuthenticated) return

    setIsSyncing(true)
    setMessage('')
    const result = await runCloudSync({ force: true, userId })

    setMessage(result.ok ? 'Sync klar.' : result.error || 'Sync kunde inte slutföras.')
    refreshStatus()
    setIsSyncing(false)
  }, [isAuthenticated, refreshStatus, userId])

  const toggleEnabled = useCallback(async () => {
    const next = !status.enabled
    setCloudSyncEnabled(next)
    refreshStatus()

    if (next && isAuthenticated) {
      setIsSyncing(true)
      const result = await runCloudSync({ force: true, userId })
      setMessage(result.ok ? 'Automatisk sync är på.' : result.error || 'Sync kunde inte startas.')
      refreshStatus()
      setIsSyncing(false)
      return
    }

    setMessage('Automatisk sync är av.')
  }, [isAuthenticated, refreshStatus, status.enabled, userId])

  const resolveConflict = useCallback(async (storageKey, choice) => {
    setIsSyncing(true)
    const result = await resolveStoredSyncConflict(storageKey, choice, { userId })

    setMessage(result.ok ? 'Konflikten är löst.' : result.error || 'Konflikten kunde inte lösas.')
    refreshStatus()
    setIsSyncing(false)
  }, [refreshStatus, userId])

  useEffect(() => {
    if (!isAuthenticated || !status.enabled) return undefined

    const handleOnline = () => {
      syncNow()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [isAuthenticated, status.enabled, syncNow])

  useEffect(() => {
    if (!status.enabled) {
      hasAutoSyncedRef.current = false
      return undefined
    }
    if (!isAuthenticated || isSyncing || hasAutoSyncedRef.current) return undefined

    const timeoutId = window.setTimeout(() => {
      hasAutoSyncedRef.current = true
      syncNow()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [isAuthenticated, isSyncing, status.enabled, syncNow])

  const conflicts = useMemo(() => status.conflicts || [], [status.conflicts])

  if (!isAuthenticated) return null

  return (
    <article className="panel cloud-sync-panel" id="cloud-sync">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cloud Sync V2</p>
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
          <span>Senast klar</span>
          <strong>{formatDateTime(status.lastSuccessfulSyncAt)}</strong>
        </div>
        <div>
          <span>Väntande</span>
          <strong>{status.pendingCount}</strong>
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
      </div>

      {(message || status.lastError) && (
        <p className={status.lastError ? 'form-error' : 'form-success'} role="status">
          {message || status.lastError}
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="cloud-sync-conflicts">
          <h3>Konflikter</h3>
          {conflicts.map((conflict) => (
            <div className="cloud-sync-conflict" key={conflict.storageKey}>
              <div>
                <strong>{conflict.storageKey}</strong>
                <span>{conflict.reason || 'Lokal data och molndata skiljer sig.'}</span>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default CloudSyncPanel
