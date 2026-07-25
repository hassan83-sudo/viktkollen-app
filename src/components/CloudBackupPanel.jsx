import { useState } from 'react'
import {
  downloadUserData,
  uploadUserData,
} from '../services/cloudSyncService.js'
import { restoreUserDataBackupSnapshot } from '../services/userDataRepository.js'

function CloudBackupPanel({ isAuthenticated }) {
  const [backupStatus, setBackupStatus] = useState(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  if (!isAuthenticated) {
    return null
  }

  async function handleBackup() {
    setIsBackingUp(true)
    setBackupStatus(null)

    const result = await uploadUserData()

    setBackupStatus({
      ok: Boolean(result.ok),
      message: result.ok
        ? 'Säkerhetskopiering lyckades.'
        : result.reason || 'Säkerhetskopiering misslyckades.',
      updatedAt: result.backupUpdatedAt,
    })
    setIsBackingUp(false)
  }

  async function handleRestore() {
    const shouldRestore = window.confirm(
      'Detta kommer att ersätta din lokala data med säkerhetskopian från molnet. Vill du fortsätta?',
    )

    if (!shouldRestore) {
      return
    }

    setIsRestoring(true)
    setBackupStatus(null)

    const result = await downloadUserData()

    if (!result.ok) {
      setBackupStatus({
        ok: false,
        message: result.reason || 'Återställning misslyckades.',
      })
      setIsRestoring(false)
      return
    }

    const restoreResult = restoreUserDataBackupSnapshot(result.backup)

    setBackupStatus({
      ok: Boolean(restoreResult.ok),
      message: restoreResult.ok
        ? 'Återställning lyckades. Appen laddas om...'
        : restoreResult.reason || 'Återställning misslyckades.',
      updatedAt: result.backupUpdatedAt,
    })
    setIsRestoring(false)

    if (restoreResult.ok) {
      window.setTimeout(() => {
        window.location.reload()
      }, 900)
    }
  }

  return (
    <article className="panel settings-panel" id="molnbackup">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Molnbackup</p>
          <h2>Säkerhetskopiera appdata</h2>
        </div>
      </div>

      <p className="settings-note">
        Sparar och återställer manuellt din lokala Viktkollen-data via Supabase.
        LocalStorage är fortfarande appens primära datakälla.
      </p>

      <div className="cloud-backup-actions">
        <button type="button" onClick={handleBackup} disabled={isBackingUp || isRestoring}>
          {isBackingUp ? 'Säkerhetskopierar...' : 'Säkerhetskopiera till molnet'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={handleRestore}
          disabled={isBackingUp || isRestoring}
        >
          {isRestoring ? 'Återställer...' : 'Återställ från molnet'}
        </button>
      </div>

      {backupStatus && (
        <p className={backupStatus.ok ? 'success-message' : 'form-error'} role="status">
          {backupStatus.message}
          {backupStatus.updatedAt
            ? ` Senast sparad: ${new Date(backupStatus.updatedAt).toLocaleString('sv-SE')}.`
            : ''}
        </p>
      )}
    </article>
  )
}

export default CloudBackupPanel
