import { useMemo, useState } from 'react'
import { buildLaunchReadinessReport } from '../services/launchReadiness.js'

function LaunchReadinessPanel({ authSession, healthSnapshot, reminderState, syncStatus }) {
  const [copied, setCopied] = useState(false)
  const report = useMemo(() => buildLaunchReadinessReport({
    authSession,
    healthSnapshot,
    reminderState,
    syncStatus,
  }), [authSession, healthSnapshot, reminderState, syncStatus])
  const reportText = JSON.stringify(report, null, 2)

  async function copyReport() {
    try {
      await navigator.clipboard?.writeText(reportText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <details className="panel launch-readiness-panel">
      <summary>Launch readiness</summary>
      <div className="reminder-summary-grid">
        <span>Version: {report.appVersion}</span>
        <span>Build: {report.buildMode}</span>
        <span>Auth: {report.auth.configured ? 'Konfigurerad' : 'Saknas'}</span>
        <span>Storage: {report.diagnostics.storageHealth}</span>
        <span>SW: {report.pwa.serviceWorker}</span>
        <span>Reminders: {report.reminders.enabledCount} aktiva</span>
        <span>Notifications: {report.notifications.pendingCount} kommande</span>
        <span>Quiet hours: {report.notifications.quietHours}</span>
        <span>Sync reminders: {report.diagnostics.syncAllowedReminders ? 'Ja' : 'Nej'}</span>
        <span>Snapshot: {report.healthSnapshot.date}</span>
        <span>Photo AI: {report.photoAnalysis.remoteAnalysisEnabled ? 'Aktiv' : 'Av'}</span>
        <span>Photo route: {report.photoAnalysis.routeConfigured}</span>
        <span>Sync health: {report.sync.syncHealth}</span>
        <span>Sync queue: {report.sync.queueHealth}</span>
        <span>Analytics: {report.diagnostics.analyticsHealth}</span>
        <span>Trend coverage: {report.diagnostics.trendCoverage}</span>
        <span>Import: {report.diagnostics.importEngineHealth}</span>
        <span>Import rollback: {report.diagnostics.importRollbackHealth}</span>
      </div>
      <pre className="diagnostics-output">{reportText}</pre>
      <button type="button" className="secondary-button" onClick={copyReport}>
        Kopiera anonymiserad readinessrapport
      </button>
      {copied && <p className="form-success" role="status">Rapport kopierad.</p>}
    </details>
  )
}

export default LaunchReadinessPanel
