import { useMemo, useRef, useState } from 'react'
import { applyImportPlan, buildPreviewImportPlan, parseDataImportText } from '../services/import/dataImportEngine.js'
import { buildImportPlan, mergeStrategies } from '../services/import/importPlanBuilder.js'

const strategyLabels = {
  append: 'Lägg till',
  manualReview: 'Manuell granskning',
  replace: 'Ersätt',
  safeMerge: 'Säker merge',
  skip: 'Hoppa över',
}

function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
}

function DataImportCenter({ onDataImported, userId = '' }) {
  const fileInputRef = useRef(null)
  const headingRef = useRef(null)
  const [confirmationChecked, setConfirmationChecked] = useState(false)
  const [importSession, setImportSession] = useState(null)
  const [isApplying, setIsApplying] = useState(false)
  const [selectedSections, setSelectedSections] = useState([])
  const [status, setStatus] = useState('')
  const [strategies, setStrategies] = useState({})

  const plan = useMemo(() => {
    if (!importSession?.sections?.length) return null
    return buildImportPlan(importSession, { selectedSections, strategies })
  }, [importSession, selectedSections, strategies])

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    setConfirmationChecked(false)
    setStatus('')

    if (!file) return

    try {
      const text = await file.text()
      const nextSession = parseDataImportText({
        file,
        importDate: new Date(),
        text,
      })
      const previewSession = buildPreviewImportPlan(nextSession)
      setImportSession(previewSession)
      setSelectedSections(previewSession.sections.map((section) => section.id))
      setStrategies({})
      setStatus(previewSession.errors.length ? 'Filen kunde inte förberedas för import.' : 'Förhandsgranskning klar. Ingen data har sparats.')
      window.setTimeout(() => headingRef.current?.focus(), 0)
    } catch {
      setImportSession(null)
      setStatus('Filen kunde inte läsas.')
    } finally {
      event.target.value = ''
    }
  }

  function toggleSection(sectionId) {
    setSelectedSections((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    )
  }

  function changeStrategy(key, value) {
    setStrategies((current) => ({ ...current, [key]: value }))
  }

  function cancelImport() {
    setConfirmationChecked(false)
    setImportSession(null)
    setSelectedSections([])
    setStrategies({})
    setStatus('Importen avbröts. Ingen data sparades.')
  }

  async function applyImport() {
    if (!importSession || !plan || !confirmationChecked) return

    setIsApplying(true)
    setStatus('Importen körs...')

    const result = applyImportPlan(importSession, plan, {
      currentUserId: userId,
      expectedUserId: userId,
      now: new Date(),
    })

    setIsApplying(false)
    setStatus(result.reason)

    if (result.ok) {
      onDataImported?.(result)
      setImportSession({
        ...importSession,
        mergePlan: plan,
        status: 'completed',
      })
      setConfirmationChecked(false)
    }
  }

  const hasBlockingErrors = Boolean(plan?.blockingErrors?.length || importSession?.errors?.length)

  return (
    <section className="panel data-import-center" id="data-import">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Import och återställning</p>
          <h2 tabIndex="-1" ref={headingRef}>Dataimport</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
          Välj fil
        </button>
      </div>

      <input
        accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain"
        aria-label="Välj Viktkollen-backup eller CSV-fil för säker import"
        className="sr-only"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      <p className="helper-text">
        Importen skapar alltid en förhandsgranskning först. Data sparas först efter uttrycklig bekräftelse.
      </p>

      {status && <p className="analysis-status" role="status" aria-live="polite">{status}</p>}

      {importSession && (
        <div className="import-preview-stack">
          <div className="summary-grid">
            <div className="metric">
              <span>Format</span>
              <strong>{importSession.detectedFormat}</strong>
            </div>
            <div className="metric">
              <span>Storlek</span>
              <strong>{formatBytes(importSession.fileMetadata.size)}</strong>
            </div>
            <div className="metric">
              <span>Datadelar</span>
              <strong>{importSession.summary.sectionCount}</strong>
            </div>
            <div className="metric">
              <span>Poster</span>
              <strong>{importSession.summary.totalItems}</strong>
            </div>
          </div>

          {importSession.errors.length > 0 && (
            <div className="form-error" role="alert">
              {importSession.errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}

          {importSession.warnings.length > 0 && (
            <div className="analysis-list">
              {importSession.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}

          {importSession.sections.length > 0 && (
            <div className="meal-list">
              {importSession.sections.map((section) => (
                <article key={section.id} className="report-card">
                  <label className="checkbox-row">
                    <input
                      checked={selectedSections.includes(section.id)}
                      onChange={() => toggleSection(section.id)}
                      type="checkbox"
                    />
                    <span>{section.label}</span>
                  </label>
                  <p>{section.itemCount} poster · {section.key}</p>
                  <label>
                    <span>Strategi</span>
                    <select
                      aria-label={`Importstrategi för ${section.label}`}
                      onChange={(event) => changeStrategy(section.key, event.target.value)}
                      value={strategies[section.key] || plan?.strategies?.[section.key] || 'safeMerge'}
                    >
                      {mergeStrategies.map((strategy) => (
                        <option key={strategy} value={strategy}>{strategyLabels[strategy]}</option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          )}

          {plan && (
            <div className="report-card">
              <h3>Importplan</h3>
              <p>
                {plan.additions} tillägg, {plan.updates} uppdateringar, {plan.unchanged} oförändrade,
                {' '}{plan.skipped} hoppas över. Beräknade skrivningar: {plan.estimatedWrites}.
              </p>
              {plan.requiresSnapshot && <p>Snapshot skapas före import och rollback används vid fel.</p>}
              {plan.blockingErrors.length > 0 && (
                <div className="form-error" role="alert">
                  {plan.blockingErrors.map((error, index) => (
                    <p key={`${error.sectionId || error.storageKey || 'error'}-${index}`}>{error.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="checkbox-row">
            <input
              checked={confirmationChecked}
              disabled={!plan || hasBlockingErrors || plan.estimatedWrites === 0}
              onChange={(event) => setConfirmationChecked(event.target.checked)}
              type="checkbox"
            />
            <span>Jag har granskat importplanen och vill skriva valda datadelar.</span>
          </label>

          <div className="inline-actions">
            <button type="button" className="secondary-button" onClick={cancelImport}>
              Avbryt
            </button>
            <button
              type="button"
              disabled={!confirmationChecked || !plan?.okToApply || isApplying}
              onClick={applyImport}
            >
              {isApplying ? 'Importerar...' : 'Importera valda delar'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default DataImportCenter
