import { useCallback, useEffect, useState } from 'react'
import {
  deleteUserBackup,
  downloadUserData,
  listUserBackups,
  uploadUserData,
} from '../services/cloudSyncService.js'
import { restoreUserDataBackupSnapshot } from '../services/userDataRepository.js'

function formatBackupDate(value) {
  if (!value) {
    return 'Okänt datum'
  }

  return new Date(value).toLocaleDateString('sv-SE')
}

function formatBackupTime(value) {
  if (!value) {
    return 'Okänd tid'
  }

  return new Date(value).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBackupSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return 'Storlek okänd'
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  return `${(sizeBytes / 1024).toFixed(1).replace('.', ',')} KB`
}

function CloudBackupPanel({ isAuthenticated }) {
  const [backupStatus, setBackupStatus] = useState(null)
  const [backups, setBackups] = useState([])
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState('')
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [isRestoringId, setIsRestoringId] = useState('')

  const refreshBackups = useCallback(async () => {
    if (!isAuthenticated) {
      setBackups([])
      return
    }

    setIsLoadingBackups(true)
    const result = await listUserBackups()

    if (result.ok) {
      setBackups(result.backups)
    } else {
      setBackupStatus({
        ok: false,
        message: result.reason || 'Kunde inte hämta säkerhetskopior.',
      })
    }

    setIsLoadingBackups(false)
  }, [isAuthenticated])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refreshBackups()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [refreshBackups])

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
      updatedAt: result.backupCreatedAt || result.backupUpdatedAt,
    })
    setIsBackingUp(false)

    if (result.ok) {
      await refreshBackups()
    }
  }

  async function handleRestore(backupId) {
    const shouldRestore = window.confirm(
      'Detta kommer att ersätta din lokala data med den valda säkerhetskopian från molnet. Vill du fortsätta?',
    )

    if (!shouldRestore) {
      return
    }

    setIsRestoringId(backupId)
    setBackupStatus(null)

    const result = await downloadUserData(backupId)

    if (!result.ok) {
      setBackupStatus({
        ok: false,
        message: result.reason || 'Återställning misslyckades.',
      })
      setIsRestoringId('')
      return
    }

    const restoreResult = restoreUserDataBackupSnapshot(result.backup)

    setBackupStatus({
      ok: Boolean(restoreResult.ok),
      message: restoreResult.ok
        ? 'Återställning lyckades. Appen laddas om...'
        : restoreResult.reason || 'Återställning misslyckades.',
      updatedAt: result.backupCreatedAt || result.backupUpdatedAt,
    })
    setIsRestoringId('')

    if (restoreResult.ok) {
      window.setTimeout(() => {
        window.location.reload()
      }, 900)
    }
  }

  async function handleDelete(backupId) {
    const shouldDelete = window.confirm(
      'Vill du ta bort den valda säkerhetskopian från molnet?',
    )

    if (!shouldDelete) {
      return
    }

    setIsDeletingId(backupId)
    setBackupStatus(null)

    const result = await deleteUserBackup(backupId)

    setBackupStatus({
      ok: Boolean(result.ok),
      message: result.ok
        ? 'Säkerhetskopian togs bort.'
        : result.reason || 'Borttagning misslyckades.',
    })
    setIsDeletingId('')

    if (result.ok) {
      await refreshBackups()
    }
  }

  const hasBusyAction = isBackingUp || Boolean(isDeletingId) || Boolean(isRestoringId)

  return (
    <article className="panel settings-panel" id="molnbackup">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Molnbackup</p>
          <h2>Säkerhetskopiera appdata</h2>
        </div>
      </div>

      <p className="settings-note">
        Skapar manuella säkerhetskopior av din lokala Viktkollen-data via Supabase.
        LocalStorage är fortfarande appens primära datakälla.
      </p>

      <div className="cloud-backup-actions">
        <button type="button" onClick={handleBackup} disabled={hasBusyAction}>
          {isBackingUp ? 'Säkerhetskopierar...' : 'Skapa ny backup'}
        </button>
      </div>

      {backupStatus && (
        <p className={backupStatus.ok ? 'success-message' : 'form-error'} role="status">
          {backupStatus.message}
          {backupStatus.updatedAt
            ? ` Tidpunkt: ${formatBackupDate(backupStatus.updatedAt)} ${formatBackupTime(backupStatus.updatedAt)}.`
            : ''}
        </p>
      )}

      <section className="backup-history" aria-label="Senaste säkerhetskopior">
        <div className="backup-history-heading">
          <div>
            <p className="eyebrow">Senaste säkerhetskopior</p>
            <h3>{backups.length} av max 10 visade</h3>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={refreshBackups}
            disabled={isLoadingBackups || hasBusyAction}
          >
            {isLoadingBackups ? 'Hämtar...' : 'Uppdatera lista'}
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="backup-empty-card">
            <strong>Inga säkerhetskopior finns ännu.</strong>
            <span>Skapa din första manuella backup när du vill spara en kopia i molnet.</span>
          </div>
        ) : (
          <div className="backup-history-list">
            {backups.map((backup) => (
              <div className="backup-history-item" key={backup.id}>
                <div className="backup-history-meta">
                  <strong>{formatBackupDate(backup.createdAt)}</strong>
                  <span>Tid: {formatBackupTime(backup.createdAt)}</span>
                  <span>Storlek: {formatBackupSize(backup.sizeBytes)}</span>
                  <span>{backup.storageKeyCount} datadelar sparade</span>
                </div>
                <div className="backup-history-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleRestore(backup.id)}
                    disabled={hasBusyAction}
                  >
                    {isRestoringId === backup.id ? 'Återställer...' : 'Återställ'}
                  </button>
                  <button
                    className="secondary-button danger-button"
                    type="button"
                    onClick={() => handleDelete(backup.id)}
                    disabled={hasBusyAction}
                  >
                    {isDeletingId === backup.id ? 'Tar bort...' : 'Ta bort backup'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}

export default CloudBackupPanel
