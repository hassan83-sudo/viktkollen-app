import { useState, useSyncExternalStore } from 'react'
import { loadCloudSyncEngine } from '../services/cloudRuntimeLoader.js'
import { clearCloudSyncHistory, getCloudSyncHistory, summarizeCloudSyncHistory } from '../services/sync/cloudSyncHistory.js'
import { exportSyncDiagnosticsReport } from '../services/sync/syncDiagnostics.js'
import { getSyncStatusSnapshot, subscribeSyncStatus } from '../services/sync/syncStatusStore.js'

function formatDateTime(value) {
  if (!value) return 'Aldrig'
  try {
    return new Date(value).toLocaleString('sv-SE')
  } catch {
    return 'Okänt'
  }
}

function SyncHealthDashboard({ isAuthenticated, onDataChanged, userId }) {
  const syncStatus = useSyncExternalStore(subscribeSyncStatus, getSyncStatusSnapshot, getSyncStatusSnapshot)
  const [message, setMessage] = useState('')
  const [, setHistoryVersion] = useState(0)
  const history = getCloudSyncHistory().slice(-8).reverse()
  const historySummary = summarizeCloudSyncHistory()
  const devices = syncStatus.multiDevice?.devices || []

  async function manualSync() {
    if (!isAuthenticated) return
    const { runCloudSync } = await loadCloudSyncEngine()
    const result = await runCloudSync({ force: true, userId })
    if (result.ok && (result.downloaded?.length || result.uploaded?.length)) onDataChanged?.()
    setMessage(result.ok ? 'Manuell sync klar.' : result.error || 'Sync kunde inte slutföras.')
    setHistoryVersion((current) => current + 1)
  }

  function copyReport() {
    const text = exportSyncDiagnosticsReport(syncStatus)
    navigator.clipboard?.writeText(text)
    setMessage('Anonymiserad syncrapport kopierad.')
  }

  function clearHistory() {
    clearCloudSyncHistory()
    setHistoryVersion((current) => current + 1)
    setMessage('Teknisk synkhistorik rensad för sessionen.')
  }

  if (!isAuthenticated) return null

  return (
    <details className="panel sync-diagnostics-panel" id="sync-health-dashboard">
      <summary>Sync Health Dashboard</summary>
      <div className="sync-diagnostics-grid">
        <div><dt>Sync health</dt><dd>{syncStatus.syncHealth || syncStatus.statusCode}</dd></div>
        <div><dt>Senast klar</dt><dd>{formatDateTime(syncStatus.lastSuccessfulSyncAt)}</dd></div>
        <div><dt>Uploads</dt><dd>{syncStatus.pendingUploads || 0}</dd></div>
        <div><dt>Downloads</dt><dd>{syncStatus.pendingDownloads || 0}</dd></div>
        <div><dt>Konflikter</dt><dd>{syncStatus.conflicts?.length || 0}</dd></div>
        <div><dt>Queue</dt><dd>{syncStatus.queueStatus?.queueHealth || 'ok'}</dd></div>
        <div><dt>Recovery</dt><dd>{syncStatus.recoveryStatus || 'ready'}</dd></div>
        <div><dt>Kända enheter</dt><dd>{syncStatus.multiDevice?.activeDeviceCount || 0}</dd></div>
      </div>

      {devices.length > 0 && (
        <ul className="sync-diagnostics-events">
          {devices.slice(0, 5).map((device) => (
            <li key={device.deviceIdMasked}>
              <strong>{device.deviceLabel}</strong>
              <span>{device.isCurrentDevice ? 'Denna enhet' : device.status}. Senast sedd {formatDateTime(device.lastSeenAt)}.</span>
            </li>
          ))}
        </ul>
      )}

      {syncStatus.conflicts?.length > 0 && (
        <ul className="sync-diagnostics-events">
          {syncStatus.conflicts.map((conflict) => (
            <li key={conflict.conflictId || conflict.storageKey}>
              <strong>{conflict.dataType || conflict.storageKey}</strong>
              <span>{conflict.conflictReason || conflict.reason || 'Konflikt kräver användarval.'}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="sync-diagnostics-actions">
        <button type="button" className="secondary-button" onClick={manualSync}>Manuell sync</button>
        <button type="button" className="secondary-button" onClick={copyReport}>Kopiera rapport</button>
        <button type="button" className="secondary-button" onClick={clearHistory}>Rensa historik</button>
      </div>

      <p className="estimate-note">
        Historik: {historySummary.size} säkra tekniska händelser. Rå payload, hälsodata, tokens och fullständiga deviceId:n visas inte.
      </p>
      <ul className="sync-diagnostics-events">
        {history.map((event) => (
          <li key={event.id}>
            <strong>{event.eventType}</strong>
            <span>{event.safeSummary || event.result} {event.dataType && `(${event.dataType})`}</span>
          </li>
        ))}
      </ul>
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
    </details>
  )
}

export default SyncHealthDashboard
