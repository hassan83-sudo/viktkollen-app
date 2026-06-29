function BodyAnalysisTimeline({
  analysisHistory,
  expandedAnalysisIds,
  formatAnalysisDate,
  getResultSections,
  getResultSourceLabel,
  getTimelineSummary,
  importSummary,
  onAskDeleteAnalysis,
  onCancelClearHistory,
  onCancelDeleteAnalysis,
  onClearHistory,
  onDeleteAnalysis,
  onExportHistory,
  onImportHistory,
  onSelectAnalysis,
  onShowClearHistoryConfirm,
  onTimelineFilterChange,
  onToggleExpandedAnalysis,
  pendingDeleteAnalysisId,
  renderResultValue,
  showClearHistoryConfirm,
  timelineFilter,
  timelineFilters,
  visibleAnalysisHistory,
}) {
  return (
    <>
      <div className="body-analysis-filter">
        <button
          className="secondary-button"
          type="button"
          onClick={onExportHistory}
        >
          Exportera analystidslinje
        </button>
        <label className="secondary-button">
          Importera analystidslinje
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={onImportHistory}
          />
        </label>
        {analysisHistory.length > 0 && (
          <button
            className="secondary-button"
            type="button"
            onClick={onShowClearHistoryConfirm}
          >
            Rensa analystidslinje
          </button>
        )}
      </div>
      {importSummary && (
        <p className="progress-photo-safety">
          Import klar: {importSummary.imported} importerade,{' '}
          {importSummary.duplicates} dubletter och {importSummary.invalid}{' '}
          felaktiga poster.
        </p>
      )}
      {showClearHistoryConfirm && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Bekräfta rensning</p>
              <h3>Rensa hela analystidslinjen?</h3>
            </div>
            <span>Lokalt</span>
          </div>
          <p>
            Detta tar bort alla lokalt sparade analyser från den här
            webbläsaren.
          </p>
          <button type="button" onClick={onClearHistory}>
            Ja, rensa analystidslinjen
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
      {analysisHistory.length === 0 ? (
        <p className="progress-photo-safety">
          Ingen historik ännu. Skapa en analys eller importera en tidigare
          exporterad analystidslinje.
        </p>
      ) : (
        <>
          <div className="body-analysis-filter">
            {timelineFilters.map((filter) => (
              <button
                className={
                  timelineFilter === filter.value
                    ? 'secondary-button is-active'
                    : 'secondary-button'
                }
                key={filter.value}
                type="button"
                onClick={() => onTimelineFilterChange(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="body-analysis-timeline">
            {visibleAnalysisHistory.length > 0 ? (
              visibleAnalysisHistory.map((analysis) => {
                const isExpanded = expandedAnalysisIds.includes(
                  analysis.createdAt,
                )

                return (
                  <article key={analysis.createdAt}>
                    <span className="body-analysis-timeline-dot" />
                    <div className="body-analysis-timeline-content">
                      <div className="body-analysis-timeline-heading">
                        <strong>
                          Analys {analysis.analysisNumber} ·{' '}
                          {formatAnalysisDate(analysis.createdAt)}
                        </strong>
                        {analysis.createdAt === analysisHistory[0]?.createdAt && (
                          <span className="progress-photo-view-badge">
                            Senaste
                          </span>
                        )}
                      </div>
                      <p>{getTimelineSummary(analysis.result)}</p>
                      <span>{analysis.status || 'Analys klar'}</span>
                      <span>{getResultSourceLabel(analysis.result)}</span>
                      <div className="body-analysis-timeline-images">
                        {analysis.frontPhoto?.preview && (
                          <img
                            src={analysis.frontPhoto.preview}
                            alt="Miniatyr framifrån"
                          />
                        )}
                        {analysis.sidePhoto?.preview && (
                          <img
                            src={analysis.sidePhoto.preview}
                            alt="Miniatyr från sidan"
                          />
                        )}
                      </div>
                      {isExpanded && (
                        <div className="body-analysis-timeline-details">
                          {getResultSections(analysis.result).map((section) => (
                            <div key={section.key}>
                              <strong>{section.label}</strong>
                              {renderResultValue(section.key, section.value)}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onSelectAnalysis(analysis)}
                      >
                        Visa analys
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          onToggleExpandedAnalysis(analysis.createdAt)
                        }
                      >
                        {isExpanded ? 'Dölj detaljer' : 'Visa detaljer'}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onAskDeleteAnalysis(analysis.createdAt)}
                      >
                        Radera analys
                      </button>
                      {pendingDeleteAnalysisId === analysis.createdAt && (
                        <div className="progress-photo-ai-comparison">
                          <div className="progress-photo-ai-heading">
                            <div>
                              <p className="eyebrow">Bekräfta radering</p>
                              <h3>Radera den här analysen?</h3>
                            </div>
                            <span>Lokalt</span>
                          </div>
                          <p>
                            Analysen tas bort från den lokala tidslinjen i den
                            här webbläsaren.
                          </p>
                          <button
                            type="button"
                            onClick={() => onDeleteAnalysis(analysis.createdAt)}
                          >
                            Ja, radera analysen
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={onCancelDeleteAnalysis}
                          >
                            Avbryt
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })
            ) : (
              <p className="progress-photo-safety">
                Inga analyser finns i den valda perioden.
              </p>
            )}
          </div>
        </>
      )}
    </>
  )
}

export default BodyAnalysisTimeline
