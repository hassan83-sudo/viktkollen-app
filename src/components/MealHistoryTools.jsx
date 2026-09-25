import { useRef } from 'react'

function MealHistoryTools({
  importSummary,
  onCancelClearHistory,
  onClearHistory,
  onCreateDemoMealDay,
  onExportHistory,
  onImportHistory,
  onShowClearHistory,
  showClearHistoryConfirm,
}) {
  const fileInputRef = useRef(null)

  return (
    <div className="chart-card">
      <div className="chart-toolbar">
        <div>
          <span>Lokal historik</span>
          <strong>Mathistorik</strong>
        </div>
      </div>
      <p className="estimate-note">
        Bilder skickas bara när du kör analysen. Mathistoriken sparas lokalt i
        webbläsaren och är inte medicinsk rådgivning.
      </p>
      <div className="body-analysis-filter">
        <button
          className="secondary-button"
          type="button"
          aria-label="Exportera mathistorik som JSON"
          onClick={onExportHistory}
        >
          Exportera mathistorik
        </button>
        {/* A11Y-8P (8M A-N6): a real button opens the file chooser. A <label>
            around a display:none input was no Tab stop at all. The native
            input is visually hidden and not a Tab stop of its own. */}
        <button
          className="secondary-button"
          type="button"
          aria-label="Importera mathistorik från JSON"
          onClick={() => fileInputRef.current?.click()}
        >
          Importera mathistorik
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          aria-hidden="true"
          className="sr-only"
          tabIndex={-1}
          onChange={onImportHistory}
        />
        <button
          className="secondary-button"
          type="button"
          aria-label="Rensa lokal mathistorik"
          onClick={onShowClearHistory}
        >
          Rensa mathistorik
        </button>
        {import.meta.env.DEV && (
          <button
            className="secondary-button"
            type="button"
            aria-label="Skapa demo-måltidsdag"
            onClick={onCreateDemoMealDay}
          >
            Skapa demo-måltidsdag
          </button>
        )}
      </div>
      {importSummary && (
        <p className="estimate-note">
          Import klar: {importSummary.imported} importerade,{' '}
          {importSummary.duplicates} dubletter och {importSummary.invalid}{' '}
          felaktiga poster.
        </p>
      )}
      {showClearHistoryConfirm && (
        <div className="photo-meal-feedback">
          <p>
            <strong>Rensa mathistorik?</strong> Detta tar bort lokalt sparade
            måltidsanalyser från den här webbläsaren.
          </p>
          <button type="button" onClick={onClearHistory}>
            Ja, rensa mathistorik
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onCancelClearHistory}
          >
            Avbryt
          </button>
        </div>
      )}
    </div>
  )
}

export default MealHistoryTools
