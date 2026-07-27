import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteUserBackups,
  getSyncEvents,
  getUndoRestoreStatus,
  listUserBackups,
  previewCloudRestore,
  pushLocalDataToCloud,
  restoreCloudBackup,
  undoLatestRestore,
  updateUserBackup,
} from '../services/cloudSyncService.js'
import {
  createPreRestoreBackup,
  restoreCloudBackupPayload,
  validateCloudBackupPayload,
} from '../services/cloudBackupSchema.js'

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

function getBackupTitle(backup) {
  return backup.name || `Backup ${formatBackupDate(backup.createdAt)} ${formatBackupTime(backup.createdAt)}`
}

function getBackupContentSummary(backup) {
  const keys = backup.backup?.storageKeys || []

  if (!Array.isArray(keys) || keys.length === 0) {
    return ['Inga datadelar listade']
  }

  return keys.slice(0, 6).map((key) => key.replace('viktkollen.', ''))
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function CloudBackupPanel({ isAuthenticated }) {
  const fileInputRef = useRef(null)
  const [backupStatus, setBackupStatus] = useState(null)
  const [backups, setBackups] = useState([])
  const [filterMode, setFilterMode] = useState('alla')
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isRestoringId, setIsRestoringId] = useState('')
  const [lastPreview, setLastPreview] = useState(null)
  const [renameDrafts, setRenameDrafts] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBackupIds, setSelectedBackupIds] = useState([])
  const [sortMode, setSortMode] = useState('favorit-nyast')
  const [syncEvents, setSyncEvents] = useState([])
  const [totalBackupCount, setTotalBackupCount] = useState(0)
  const [undoRestore, setUndoRestore] = useState(() => getUndoRestoreStatus())

  const refreshBackups = useCallback(async () => {
    if (!isAuthenticated) {
      setBackups([])
      return
    }

    setIsLoadingBackups(true)
    const result = await listUserBackups()
    const eventResult = await getSyncEvents()

    if (result.ok) {
      setBackups(result.backups)
      setTotalBackupCount(result.backupCount ?? result.backups.length)
      setRenameDrafts((current) =>
        result.backups.reduce((drafts, backup) => ({
          ...drafts,
          [backup.id]: current[backup.id] ?? backup.name,
        }), {}),
      )
    } else {
      setBackupStatus({
        ok: false,
        message: result.reason || 'Kunde inte hämta säkerhetskopior.',
      })
      setTotalBackupCount(0)
    }

    if (eventResult.events) {
      setSyncEvents(eventResult.events)
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

  const visibleBackups = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('sv-SE')

    return backups
      .filter((backup) => {
        if (filterMode === 'favoriter' && !backup.isFavorite) {
          return false
        }

        if (filterMode === 'namngivna' && !backup.name) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        return [
          backup.id,
          backup.name,
          formatBackupDate(backup.createdAt),
          formatBackupTime(backup.createdAt),
        ]
          .join(' ')
          .toLocaleLowerCase('sv-SE')
          .includes(normalizedSearch)
      })
      .sort((first, second) => {
        if (sortMode === 'äldst') {
          return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
        }

        if (sortMode === 'störst') {
          return second.sizeBytes - first.sizeBytes
        }

        if (sortMode === 'favorit-nyast' && first.isFavorite !== second.isFavorite) {
          return first.isFavorite ? -1 : 1
        }

        return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
      })
  }, [backups, filterMode, searchTerm, sortMode])

  if (!isAuthenticated) {
    return null
  }

  const backupCount = totalBackupCount
  const latestBackup = [...backups]
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0]
  const totalBackupSize = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0)
  const hasBusyAction =
    isBackingUp ||
    isImporting ||
    isPreviewing ||
    Boolean(isDeletingId) ||
    Boolean(isRestoringId)
  const selectedVisibleIds = visibleBackups.map((backup) => backup.id)
  const allVisibleSelected =
    selectedVisibleIds.length > 0 &&
    selectedVisibleIds.every((id) => selectedBackupIds.includes(id))

  async function handleBackup() {
    setIsBackingUp(true)
    setBackupStatus(null)

    try {
      const result = await pushLocalDataToCloud()

      setBackupStatus({
        ok: Boolean(result.ok),
        message: result.ok
          ? result.reason || 'Säkerhetskopiering lyckades.'
          : result.reason || 'Säkerhetskopiering misslyckades.',
        updatedAt: result.backupCreatedAt || result.backupUpdatedAt,
      })

      if (result.ok) {
        await refreshBackups()
      }
    } catch {
      setBackupStatus({
        ok: false,
        message: 'Säkerhetskopiering misslyckades. Försök igen om en stund.',
      })
    } finally {
      setIsBackingUp(false)
    }
  }

  async function handleRename(backup) {
    const result = await updateUserBackup(backup.id, {
      name: renameDrafts[backup.id] || '',
    })

    setBackupStatus({
      ok: Boolean(result.ok),
      message: result.ok
        ? 'Namnet sparades.'
        : result.reason || 'Kunde inte byta namn.',
    })

    if (result.ok) {
      await refreshBackups()
    }
  }

  async function handleToggleFavorite(backup) {
    const result = await updateUserBackup(backup.id, {
      isFavorite: !backup.isFavorite,
    })

    setBackupStatus({
      ok: Boolean(result.ok),
      message: result.ok
        ? backup.isFavorite
          ? 'Favoritmarkering togs bort.'
          : 'Backupen favoritmarkerades.'
        : result.reason || 'Kunde inte uppdatera favorit.',
    })

    if (result.ok) {
      await refreshBackups()
    }
  }

  function makeRestoreConfirmText(preview) {
    const backup = preview?.backup
    const content = getBackupContentSummary(backup).join(', ')

    return [
      `Backup: ${getBackupTitle(backup)}`,
      `Datum: ${formatBackupDate(backup.createdAt)} ${formatBackupTime(backup.createdAt)}`,
      `Storlek: ${formatBackupSize(backup.sizeBytes)}`,
      `Schema: V${backup.schemaVersion || preview.preview?.schemaVersion || '?'}`,
      `Datadelar: ${backup.storageKeyCount}`,
      `Innehåller: ${content}`,
      `Konfliktstatus: ${preview.conflict?.status || 'UNKNOWN'}`,
      `Rekommendation: ${preview.conflict?.recommendation || 'Förhandsgranska manuellt.'}`,
      '',
      'Detta kommer att ersätta din lokala data med den valda säkerhetskopian från molnet. En lokal ångra-backup skapas först. Vill du fortsätta?',
    ].join('\n')
  }

  async function handlePreview(backup = null) {
    setIsPreviewing(true)
    setBackupStatus(null)

    const result = await previewCloudRestore(backup?.id || '')

    if (result.ok) {
      setLastPreview(result)
      setBackupStatus({
        ok: true,
        message: result.reason || 'Molnversionen förhandsgranskades.',
      })
    } else {
      setBackupStatus({
        ok: false,
        message: result.reason || 'Förhandsgranskning misslyckades.',
      })
    }

    setIsPreviewing(false)
  }

  async function handleRestore(backup = null) {
    const preview =
      backup && lastPreview?.backup?.id === backup.id
        ? lastPreview
        : await previewCloudRestore(backup?.id || lastPreview?.backup?.id || '')

    if (!preview.ok) {
      setBackupStatus({
        ok: false,
        message: preview.reason || 'Återställning misslyckades.',
      })
      return
    }

    const shouldRestore = window.confirm(makeRestoreConfirmText(preview))

    if (!shouldRestore) {
      return
    }

    setIsRestoringId(preview.backup.id)
    setBackupStatus(null)

    const restoreResult = await restoreCloudBackup(preview.backup.id)

    setBackupStatus({
      ok: Boolean(restoreResult.ok),
      message: restoreResult.ok
        ? 'Återställning lyckades. Appen laddas om...'
        : restoreResult.reason || 'Återställning misslyckades.',
      updatedAt: preview.backup.createdAt || preview.backup.updatedAt,
    })
    setIsRestoringId('')
    setUndoRestore(getUndoRestoreStatus())

    if (restoreResult.ok) {
      window.setTimeout(() => {
        window.location.reload()
      }, 900)
    }
  }

  async function handleDelete(ids) {
    const uniqueIds = [...new Set(ids.filter(Boolean))]

    if (uniqueIds.length === 0) {
      setBackupStatus({
        ok: false,
        message: 'Välj minst en backup först.',
      })
      return
    }

    const shouldDelete = window.confirm(
      uniqueIds.length === 1
        ? 'Vill du ta bort den valda säkerhetskopian från molnet?'
        : `Vill du ta bort ${uniqueIds.length} säkerhetskopior från molnet?`,
    )

    if (!shouldDelete) {
      return
    }

    setIsDeletingId(uniqueIds.join(','))
    setBackupStatus(null)

    const result = await deleteUserBackups(uniqueIds)

    setBackupStatus({
      ok: Boolean(result.ok),
      message: result.ok
        ? result.reason
        : result.reason || 'Borttagning misslyckades.',
    })
    setIsDeletingId('')

    if (result.ok) {
      setSelectedBackupIds((current) => current.filter((id) => !uniqueIds.includes(id)))
      await refreshBackups()
    }
  }

  function handleToggleSelected(id) {
    setSelectedBackupIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
  }

  function handleSelectAllVisible() {
    setSelectedBackupIds((current) => [...new Set([...current, ...selectedVisibleIds])])
  }

  function handleClearSelected() {
    setSelectedBackupIds([])
  }

  function handleExportBackup(backup) {
    downloadJsonFile(`viktkollen-backup-${backup.id}.json`, {
      ...backup.backup,
      exportedAt: backup.backup?.exportedAt || new Date().toISOString(),
      metadata: {
        ...(backup.backup?.metadata || {}),
        exportedFromCloudBackupId: backup.id,
      },
    })
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setBackupStatus({
        ok: false,
        message: 'JSON-filen är för stor för lokal import i den här versionen.',
      })
      event.target.value = ''
      return
    }

    setIsImporting(true)
    setBackupStatus(null)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const validation = validateCloudBackupPayload(parsed?.backup || parsed)

      if (!validation.ok) {
        setBackupStatus({
          ok: false,
          message: validation.reason || 'JSON-filen är inte en giltig Viktkollen-backup.',
        })
        return
      }

      const shouldImport = window.confirm(
        `Backupen innehåller ${validation.payload.metadata.storageKeyCount} datadelar och är cirka ${formatBackupSize(validation.payload.metadata.sizeBytes)}. Detta kommer att ers?tta din lokala data med innehållet i JSON-filen. En lokal ångra-backup skapas först. Vill du fortsätta?`,
      )

      if (!shouldImport) {
        return
      }

      createPreRestoreBackup()
      const restoreResult = restoreCloudBackupPayload(validation.payload)
      setUndoRestore(getUndoRestoreStatus())

      setBackupStatus({
        ok: Boolean(restoreResult.ok),
        message: restoreResult.ok
          ? 'Import lyckades. Appen laddas om...'
          : restoreResult.reason || 'Import misslyckades.',
      })

      if (restoreResult.ok) {
        window.setTimeout(() => {
          window.location.reload()
        }, 900)
      }
    } catch {
      setBackupStatus({
        ok: false,
        message: 'JSON-filen kunde inte läsas eller tolkas.',
      })
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  async function handleUndoRestore() {
    const shouldUndo = window.confirm(
      'Detta återställer den lokala datan som fanns precis före senaste molnrestore/import. Vill du fortsätta?',
    )

    if (!shouldUndo) {
      return
    }

    setIsRestoringId('undo')
    setBackupStatus(null)

    const result = await undoLatestRestore()

    setBackupStatus({
      ok: Boolean(result.ok),
      message: result.ok
        ? 'Senaste återställning ångrades. Appen laddas om...'
        : result.reason || 'Kunde inte ångra återställningen.',
    })
    setUndoRestore(getUndoRestoreStatus())
    setIsRestoringId('')

    if (result.ok) {
      window.setTimeout(() => {
        window.location.reload()
      }, 900)
    }
  }

  return (
    <article className="panel settings-panel cloud-backup-panel" id="molnbackup">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Molnbackup</p>
          <h2>Cloud Platform</h2>
        </div>
      </div>

      <p className="settings-note">
        Skapar, hanterar och återställer manuella säkerhetskopior. LocalStorage
        är fortfarande appens primära datakälla.
      </p>

      <div className="cloud-stat-grid">
        <div>
          <span>Antal backuper</span>
          <strong>{backupCount}</strong>
        </div>
        <div>
          <span>Senaste backup</span>
          <strong>{latestBackup ? formatBackupDate(latestBackup.createdAt) : 'Saknas'}</strong>
        </div>
        <div>
          <span>Total storlek</span>
          <strong>{formatBackupSize(totalBackupSize)}</strong>
        </div>
      </div>

      <div className="cloud-backup-actions">
        <button type="button" onClick={handleBackup} disabled={hasBusyAction}>
          {isBackingUp ? 'Säkerhetskopierar...' : 'Spara lokal data i molnet'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => handlePreview()}
          disabled={hasBusyAction}
        >
          {isPreviewing ? 'Förhandsgranskar...' : 'Förhandsgranska molnversion'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => handleRestore()}
          disabled={hasBusyAction || !lastPreview?.ok}
        >
          Återställ från molnet
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={hasBusyAction}
        >
          {isImporting ? 'Importerar...' : 'Importera JSON'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={handleUndoRestore}
          disabled={hasBusyAction || !undoRestore.ok}
        >
          Ångra senaste återställning
        </button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
        />
      </div>

      <div className="cloud-sync-overview">
        <div>
          <span>Inloggad</span>
          <strong>{isAuthenticated ? 'Ja' : 'Nej'}</strong>
        </div>
        <div>
          <span>Lokal lagring</span>
          <strong>Aktiv</strong>
        </div>
        <div>
          <span>Senaste ångra-backup</span>
          <strong>{undoRestore.createdAt ? formatBackupDate(undoRestore.createdAt) + ' ' + formatBackupTime(undoRestore.createdAt) : 'Saknas'}</strong>
        </div>
      </div>

      {lastPreview?.ok && (
        <section className="cloud-conflict-card" aria-label="Konfliktanalys">
          <div>
            <p className="eyebrow">Konfliktkontroll</p>
            <h3>{lastPreview.conflict?.status || 'UNKNOWN'}</h3>
          </div>
          <p>{lastPreview.conflict?.recommendation}</p>
          <div className="cloud-preview-grid">
            <div>
              <span>Lokal version</span>
              <strong>{formatBackupDate(lastPreview.local?.exportedAt)} {formatBackupTime(lastPreview.local?.exportedAt)}</strong>
            </div>
            <div>
              <span>Molnversion</span>
              <strong>{formatBackupDate(lastPreview.preview?.createdAt)} {formatBackupTime(lastPreview.preview?.createdAt)}</strong>
            </div>
            <div>
              <span>Schema</span>
              <strong>V{lastPreview.preview?.schemaVersion}</strong>
            </div>
            <div>
              <span>Storlek</span>
              <strong>{formatBackupSize(lastPreview.preview?.sizeBytes)}</strong>
            </div>
          </div>
        </section>
      )}

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
            <h3>{visibleBackups.length} visas av {backupCount}</h3>
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

        <div className="backup-toolbar">
          <label className="field">
            <span>Sök backup</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Sök på namn, datum eller ID"
            />
          </label>
          <label className="field">
            <span>Sortering</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="favorit-nyast">Favoriter först</option>
              <option value="nyast">Nyast först</option>
              <option value="äldst">Äldst först</option>
              <option value="störst">Störst först</option>
            </select>
          </label>
          <label className="field">
            <span>Filter</span>
            <select value={filterMode} onChange={(event) => setFilterMode(event.target.value)}>
              <option value="alla">Alla</option>
              <option value="favoriter">Favoriter</option>
              <option value="namngivna">Namngivna</option>
            </select>
          </label>
        </div>

        <div className="backup-bulk-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={allVisibleSelected ? handleClearSelected : handleSelectAllVisible}
            disabled={visibleBackups.length === 0 || hasBusyAction}
          >
            {allVisibleSelected ? 'Avmarkera alla' : 'Markera alla'}
          </button>
          <button
            className="secondary-button danger-button"
            type="button"
            onClick={() => handleDelete(selectedBackupIds)}
            disabled={selectedBackupIds.length === 0 || hasBusyAction}
          >
            Ta bort valda ({selectedBackupIds.length})
          </button>
        </div>

        {isLoadingBackups ? (
          <div className="backup-empty-card is-loading">
            <strong>Hämtar säkerhetskopior...</strong>
            <span>Väntar på Supabase.</span>
          </div>
        ) : visibleBackups.length === 0 ? (
          <div className="backup-empty-card">
            <strong>Inga säkerhetskopior finns ännu.</strong>
            <span>Skapa en ny backup eller justera sökning och filter.</span>
          </div>
        ) : (
          <div className="backup-history-list">
            {visibleBackups.map((backup) => (
              <div
                className={`backup-history-item${backup.isFavorite ? ' is-favorite' : ''}`}
                key={backup.id}
              >
                <label className="backup-select">
                  <input
                    type="checkbox"
                    checked={selectedBackupIds.includes(backup.id)}
                    onChange={() => handleToggleSelected(backup.id)}
                  />
                  <span>Välj</span>
                </label>

                <div className="backup-history-meta">
                  <strong>{getBackupTitle(backup)}</strong>
                  <span>Datum: {formatBackupDate(backup.createdAt)}</span>
                  <span>Tid: {formatBackupTime(backup.createdAt)}</span>
                  <span>Storlek: {formatBackupSize(backup.sizeBytes)}</span>
                  <span>Schema: V{backup.schemaVersion || 1}</span>
                  <span>Källa: {backup.clientId ? 'Registrerad enhet' : 'Äldre backup'}</span>
                  <span>{backup.storageKeyCount} datadelar sparade</span>
                  <code>{backup.id}</code>
                </div>

                <div className="backup-rename-row">
                  <input
                    type="text"
                    value={renameDrafts[backup.id] || ''}
                    onChange={(event) =>
                      setRenameDrafts((current) => ({
                        ...current,
                        [backup.id]: event.target.value,
                      }))
                    }
                    placeholder="Namnge backup"
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleRename(backup)}
                    disabled={hasBusyAction}
                  >
                    Spara namn
                  </button>
                </div>

                <div className="backup-preview">
                  <span>Innehåller: {getBackupContentSummary(backup).join(', ')}</span>
                </div>

                <div className="backup-history-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleToggleFavorite(backup)}
                    disabled={hasBusyAction}
                  >
                    {backup.isFavorite ? 'Ta bort favorit' : 'Favorit'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleExportBackup(backup)}
                    disabled={hasBusyAction}
                  >
                    Exportera JSON
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handlePreview(backup)}
                    disabled={hasBusyAction}
                  >
                    Förhandsgranska
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleRestore(backup)}
                    disabled={hasBusyAction}
                  >
                    {isRestoringId === backup.id ? 'Återställer...' : 'Återställ'}
                  </button>
                  <button
                    className="secondary-button danger-button"
                    type="button"
                    onClick={() => handleDelete([backup.id])}
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

      <section className="backup-history" aria-label="Molnhändelser">
        <div className="backup-history-heading">
          <div>
            <p className="eyebrow">Synkhändelser</p>
            <h3>Senaste manuella åtgärder</h3>
          </div>
        </div>

        {syncEvents.length === 0 ? (
          <div className="backup-empty-card">
            <strong>Ingen synkhistorik ännu.</strong>
            <span>Händelser visas här efter backup, preview, restore eller radering.</span>
          </div>
        ) : (
          <div className="cloud-event-list">
            {syncEvents.slice(0, 10).map((event) => (
              <div className="cloud-event-item" key={event.id}>
                <span>{event.eventType}</span>
                <strong>{event.status}</strong>
                <p>{event.message}</p>
                <small>{formatBackupDate(event.createdAt)} {formatBackupTime(event.createdAt)}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}

export default CloudBackupPanel
