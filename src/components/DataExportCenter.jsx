import { useMemo, useRef, useState } from 'react'
import { buildDataExportDraft, exportFormats } from '../services/export/dataExportEngine.js'
import { downloadExportDraft } from '../services/export/downloadService.js'
import { getDefaultExportSectionIds, getExportableSections } from '../services/export/exportSchema.js'

const formatLabels = {
  csvCheckIns: 'CSV check-ins',
  csvGoalsHabitsSummary: 'CSV mål/vanor',
  csvMeals: 'CSV måltider',
  csvWeight: 'CSV vikt',
  jsonSelected: 'Valda sektioner JSON',
  textSummary: 'Textsammanfattning',
  viktkollenBackup: 'Full Viktkollen-backup',
}

function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
}

function DataExportCenter({ userId = '' }) {
  const headingRef = useRef(null)
  const [confirmed, setConfirmed] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState('')
  const [format, setFormat] = useState('viktkollenBackup')
  const [history, setHistory] = useState([])
  const [selectedSections, setSelectedSections] = useState(() => getDefaultExportSectionIds())
  const sections = useMemo(() => getExportableSections(), [])
  const draft = useMemo(() => buildDataExportDraft({
    exportDate: new Date(),
    format,
    selectedSections,
  }), [format, selectedSections])
  const verificationStatus = draft.validation.verification?.status || 'invalid'

  function toggleSection(sectionId) {
    setConfirmed(false)
    setSelectedSections((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    )
    window.setTimeout(() => headingRef.current?.focus(), 0)
  }

  function handleFormatChange(event) {
    setConfirmed(false)
    setFormat(event.target.value)
  }

  function cancelExport() {
    setConfirmed(false)
    setDownloadStatus('Exporten avbröts. Ingen fil skapades.')
  }

  function clearHistory() {
    setHistory([])
    setDownloadStatus('Exporthistoriken för sessionen rensades.')
  }

  function handleDownload() {
    if (!confirmed || !draft.validation.ok) return
    const result = downloadExportDraft(draft, {
      currentUserId: userId,
      expectedUserId: userId,
    })
    setDownloadStatus(result.reason)
    if (result.ok) {
      setHistory((current) => [{
        approximateSize: draft.estimatedSize,
        exportedAt: new Date().toISOString(),
        format: draft.format,
        recordCount: Object.values(draft.recordCounts).reduce((sum, count) => sum + count, 0),
        result: 'downloaded',
        sectionCount: draft.sectionSummaries.length,
        verified: verificationStatus,
      }, ...current].slice(0, 5))
      setConfirmed(false)
    }
  }

  return (
    <section className="panel data-export-center" id="data-export">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Export och dataportabilitet</p>
          <h2 tabIndex="-1" ref={headingRef}>Dataexport</h2>
        </div>
      </div>

      <div className="inline-form">
        <label>
          <span>Exporttyp</span>
          <select aria-label="Välj exportformat" value={format} onChange={handleFormatChange}>
            {exportFormats.filter((entry) => entry !== 'csvGoalsHabitsSummary').map((entry) => (
              <option key={entry} value={entry}>{formatLabels[entry]}</option>
            ))}
          </select>
        </label>
      </div>

      {!format.startsWith('csv') && (
        <div className="meal-list" aria-label="Valbara exportsektioner">
          {sections.map((section) => (
            <article key={section.id} className="report-card">
              <label className="checkbox-row">
                <input
                  checked={selectedSections.includes(section.id)}
                  onChange={() => toggleSection(section.id)}
                  type="checkbox"
                />
                <span>{section.label}</span>
              </label>
              <p>{section.storageKeys.length} datanycklar · {section.dependencies.length ? `Beroenden: ${section.dependencies.join(', ')}` : 'Inga beroenden'}</p>
            </article>
          ))}
        </div>
      )}

      <div className="summary-grid">
        <div className="metric">
          <span>Format</span>
          <strong>{formatLabels[draft.format]}</strong>
        </div>
        <div className="metric">
          <span>Storlek</span>
          <strong>{formatBytes(draft.estimatedSize)}</strong>
        </div>
        <div className="metric">
          <span>Sektioner</span>
          <strong>{draft.sectionSummaries.length}</strong>
        </div>
        <div className="metric">
          <span>Verifiering</span>
          <strong>{verificationStatus}</strong>
        </div>
      </div>

      <div className="report-card">
        <h3>Preview</h3>
        <p>Filnamn: {draft.filename}</p>
        <p>Schema: V{draft.schemaVersion}</p>
        <p>Poster: {Object.values(draft.recordCounts).reduce((sum, count) => sum + count, 0)}</p>
        {draft.sectionSummaries.map((section) => (
          <p key={section.id}>{section.label}: {section.recordCount} poster</p>
        ))}
      </div>

      <div className="report-card">
        <h3>Ingår aldrig</h3>
        <p>{draft.excludedFields.slice(0, 12).join(', ')}</p>
      </div>

      {draft.warnings.length > 0 && (
        <div className="analysis-list" aria-live="polite">
          {draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      {draft.validation.errors.length > 0 && (
        <div className="form-error" role="alert">
          {draft.validation.errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}

      <label className="checkbox-row">
        <input
          checked={confirmed}
          disabled={!draft.validation.ok}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        <span>Jag har granskat preview och vill skapa nedladdningsfilen.</span>
      </label>

      <div className="inline-actions">
        <button type="button" className="secondary-button" onClick={cancelExport}>Avbryt</button>
        <button type="button" disabled={!confirmed || !draft.validation.ok} onClick={handleDownload}>
          Ladda ned export
        </button>
      </div>

      {downloadStatus && <p className="analysis-status" role="status" aria-live="polite">{downloadStatus}</p>}

      {history.length > 0 && (
        <div className="report-card">
          <h3>Sessionshistorik</h3>
          {history.map((entry) => (
            <p key={`${entry.exportedAt}-${entry.format}`}>
              {formatLabels[entry.format]} · {entry.recordCount} poster · {formatBytes(entry.approximateSize)}
            </p>
          ))}
          <button type="button" className="secondary-button" onClick={clearHistory}>Rensa sessionshistorik</button>
        </div>
      )}
    </section>
  )
}

export default DataExportCenter
