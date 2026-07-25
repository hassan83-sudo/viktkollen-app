import { useState } from 'react'
import { uploadUserData } from '../services/cloudSyncService.js'

function CloudBackupPanel({ isAuthenticated }) {
  const [backupStatus, setBackupStatus] = useState(null)
  const [isBackingUp, setIsBackingUp] = useState(false)

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

  return (
    <article className="panel settings-panel" id="molnbackup">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Molnbackup</p>
          <h2>Säkerhetskopiera appdata</h2>
        </div>
      </div>

      <p className="settings-note">
        Sparar en manuell kopia av din lokala Viktkollen-data till Supabase.
        LocalStorage är fortfarande appens primära datakälla.
      </p>

      <button type="button" onClick={handleBackup} disabled={isBackingUp}>
        {isBackingUp ? 'Säkerhetskopierar...' : 'Säkerhetskopiera till molnet'}
      </button>

      {backupStatus && (
        <p className={backupStatus.ok ? 'success-message' : 'form-error'} role="status">
          {backupStatus.message}
          {backupStatus.updatedAt ? ` Senast sparad: ${new Date(backupStatus.updatedAt).toLocaleString('sv-SE')}.` : ''}
        </p>
      )}
    </article>
  )
}

export default CloudBackupPanel
