import { useState, useSyncExternalStore } from 'react'
import { appStorageChangedEvent } from '../services/appStorageService.js'
import { globalSyncCoordinator } from '../services/sync/crossTabSyncCoordinator.js'
import {
  buildSyncDiagnosticsSnapshot,
  clearSyncDiagnosticEvents,
  exportSyncDiagnosticsReport,
  getSyncDiagnosticsSnapshot,
  subscribeSyncDiagnostics,
} from '../services/sync/syncDiagnostics.js'
import { getSyncStatusSnapshot, subscribeSyncStatus } from '../services/sync/syncStatusStore.js'

function formatBoolean(value) {
  return value ? 'Ja' : 'Nej'
}

function SyncDiagnosticsPanel() {
  const syncStatus = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatusSnapshot,
    getSyncStatusSnapshot,
  )
  useSyncExternalStore(
    subscribeSyncDiagnostics,
    getSyncDiagnosticsSnapshot,
    getSyncDiagnosticsSnapshot,
  )
  const [message, setMessage] = useState('')

  const diagnostics = buildSyncDiagnosticsSnapshot(syncStatus)

  if (!import.meta.env.DEV) return null

  function simulateDirtyEvent() {
    const EventConstructor = window.CustomEvent || CustomEvent
    window.dispatchEvent(new EventConstructor(appStorageChangedEvent, {
      detail: { key: 'viktkollen.profile' },
    }))
    setMessage('Dirty-event simulerat.')
  }

  async function requestManualSync() {
    setMessage('Begär sync...')
    const result = await globalSyncCoordinator.syncNow('diagnostics-manual')
    setMessage(result.ok ? 'Syncbegäran klar.' : 'Sync kunde inte startas.')
  }

  async function copyReport() {
    const report = exportSyncDiagnosticsReport(syncStatus)
    try {
      await navigator.clipboard?.writeText?.(report)
      setMessage('Anonymiserad rapport kopierad.')
    } catch {
      setMessage('Rapport skapad men kunde inte kopieras automatiskt.')
    }
  }

  function clearEvents() {
    clearSyncDiagnosticEvents()
    setMessage('Diagnostics-historik rensad.')
  }

  return (
    <details className="sync-diagnostics-panel">
      <summary>Sync diagnostics</summary>
      <dl className="sync-diagnostics-grid" aria-live="polite">
        <div><dt>Roll</dt><dd>{diagnostics.coordination.role}</dd></div>
        <div><dt>Leader hittad</dt><dd>{formatBoolean(diagnostics.coordination.hasLeader)}</dd></div>
        <div><dt>Transport</dt><dd>{diagnostics.coordination.transportType}</dd></div>
        <div><dt>Tabs</dt><dd>{diagnostics.coordination.activeTabCount}</dd></div>
        <div><dt>Scheduler</dt><dd>{diagnostics.coordination.schedulerActive ? 'Aktiv' : 'Inaktiv'}</dd></div>
        <div><dt>Senaste trigger</dt><dd>{diagnostics.coordination.latestTrigger || 'Saknas'}</dd></div>
        <div><dt>Dirty</dt><dd>{formatBoolean(diagnostics.sync.dirty)}</dd></div>
        <div><dt>Kö</dt><dd>{diagnostics.sync.pendingCount}</dd></div>
        <div><dt>Retry</dt><dd>{diagnostics.sync.retryAt || 'Saknas'}</dd></div>
        <div><dt>Konflikt</dt><dd>{formatBoolean(diagnostics.sync.conflict)}</dd></div>
        <div><dt>Cloud engine</dt><dd>{formatBoolean(diagnostics.cloudRuntime.cloudSyncEngineLoaded)}</dd></div>
        <div><dt>Cloud service</dt><dd>{formatBoolean(diagnostics.cloudRuntime.cloudSyncServiceLoaded)}</dd></div>
        <div><dt>Nätverk</dt><dd>{diagnostics.browser.online ? 'Online' : 'Offline'}</dd></div>
        <div><dt>Synlighet</dt><dd>{diagnostics.browser.visibility}</dd></div>
        <div><dt>PWA</dt><dd>{diagnostics.browser.pwaStandalone ? 'Standalone' : 'Browser'}</dd></div>
        <div><dt>SW</dt><dd>{diagnostics.browser.serviceWorkerStatus}</dd></div>
      </dl>

      <div className="sync-diagnostics-actions">
        <button type="button" onClick={requestManualSync}>Begär manuell sync</button>
        <button type="button" onClick={simulateDirtyEvent}>Simulera dirty-event</button>
        <button type="button" onClick={copyReport}>Kopiera rapport</button>
        <button type="button" onClick={clearEvents}>Rensa historik</button>
      </div>

      {message && <p role="status">{message}</p>}

      <ol className="sync-diagnostics-events" aria-label="Senaste syncdiagnostik">
        {diagnostics.events.slice(-12).reverse().map((event) => (
          <li key={`${event.timestamp}-${event.category}-${event.message}`}>
            <time dateTime={event.timestamp}>{event.timestamp}</time>
            <strong>{event.category}</strong>
            <span>{event.message}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

export default SyncDiagnosticsPanel
