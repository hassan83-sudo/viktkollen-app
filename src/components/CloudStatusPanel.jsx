import { useCallback, useEffect, useState } from 'react'
import { getCloudDashboardStatus } from '../services/cloudSyncService.js'

function formatDateTime(value) {
  if (!value) {
    return 'Saknas'
  }

  return new Date(value).toLocaleString('sv-SE')
}

function CloudStatusPanel({ isAuthenticated }) {
  const [cloudStatus, setCloudStatus] = useState({
    backupCount: 0,
    databaseStatus: 'Väntar',
    latestBackup: null,
    latestRestoreAt: null,
    reason: '',
    syncStatus: 'Endast manuell',
  })
  const [isLoading, setIsLoading] = useState(false)

  const refreshCloudStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setCloudStatus((current) => ({
        ...current,
        backupCount: 0,
        databaseStatus: 'Ej inloggad',
        latestBackup: null,
        syncStatus: 'Inaktiv',
      }))
      return
    }

    setIsLoading(true)
    const result = await getCloudDashboardStatus()

    setCloudStatus(result)
    setIsLoading(false)
  }, [isAuthenticated])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refreshCloudStatus()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [refreshCloudStatus])

  return (
    <article className="panel cloud-status-panel" id="molnstatus">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Molnstatus</p>
          <h2>Manuell molnbackup</h2>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={refreshCloudStatus}
          disabled={isLoading}
        >
          {isLoading ? 'Kontrollerar...' : 'Uppdatera'}
        </button>
      </div>

      <div className="cloud-status-grid">
        <div>
          <span>Inloggad</span>
          <strong>{isAuthenticated ? 'Ja' : 'Nej'}</strong>
        </div>
        <div>
          <span>Antal backuper</span>
          <strong>{cloudStatus.backupCount}</strong>
        </div>
        <div>
          <span>Senaste backup</span>
          <strong>{formatDateTime(cloudStatus.latestBackup?.createdAt)}</strong>
        </div>
        <div>
          <span>Senaste restore</span>
          <strong>{formatDateTime(cloudStatus.latestRestoreAt)}</strong>
        </div>
        <div>
          <span>Synkstatus</span>
          <strong>{cloudStatus.syncStatus}</strong>
        </div>
        <div>
          <span>Databasstatus</span>
          <strong>{cloudStatus.databaseStatus}</strong>
        </div>
      </div>

      {!cloudStatus.ok && cloudStatus.reason && (
        <p className="form-error" role="status">
          {cloudStatus.reason}
        </p>
      )}
    </article>
  )
}

export default CloudStatusPanel
