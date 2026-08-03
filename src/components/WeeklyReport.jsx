import { lazy, Suspense, useRef, useState } from 'react'
import { buildSharedReportUiModel } from '../services/sharedReportUiModel.js'
import ReportAttentionItems from './reports/ReportAttentionItems.jsx'
import ReportComparisonCard from './reports/ReportComparisonCard.jsx'
import ReportCoverage from './reports/ReportCoverage.jsx'
import ReportGoalsHabits from './reports/ReportGoalsHabits.jsx'
import ReportHighlights from './reports/ReportHighlights.jsx'
import ReportNextActions from './reports/ReportNextActions.jsx'
import ReportOverview from './reports/ReportOverview.jsx'
import ReportTrendCard from './reports/ReportTrendCard.jsx'

const ReportDrilldown = lazy(() => import('./reports/ReportDrilldown.jsx'))

const reportSections = [
  ['summary', 'Veckans sammanfattning'],
  ['weightTrend', 'Vikttrend'],
  ['mealPattern', 'Matmönster'],
  ['nutritionStatus', 'Protein/grönsaksstatus'],
  ['movement', 'Rörelse/steg'],
  ['recovery', 'Återhämtning'],
  ['biggestProgress', 'Största framsteg'],
  ['biggestRisk', 'Största risk'],
  ['focusNextWeek', 'Fokus för nästa vecka'],
]

function LegacyReport({ weeklyReportLines }) {
  if (weeklyReportLines.length === 0) {
    return null
  }

  return (
    <>
      {weeklyReportLines.map((line) => (
        <p className={line.isHeading ? 'report-heading' : ''} key={line.id}>
          {line.text}
        </p>
      ))}
    </>
  )
}

function WeeklyReport({
  onCreateWeeklyReport,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
}) {
  const hasStructuredReport = Boolean(weeklyReportData)
  const [activeDrilldown, setActiveDrilldown] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const triggerRef = useRef(null)
  const reportModel = hasStructuredReport && weeklyReportData.sharedAnalytics
    ? buildSharedReportUiModel(weeklyReportData, { reportType: 'weekly' })
    : null
  const printReport = () => {
    if (typeof window !== 'undefined') window.print()
  }
  const openDrilldown = (sectionId, event) => {
    triggerRef.current = event.currentTarget
    setActiveDrilldown(sectionId)
  }
  const closeDrilldown = () => {
    setActiveDrilldown('')
    triggerRef.current?.focus()
  }
  const exportText = async () => {
    if (!weeklyReportData) return
    try {
      const { exportReportText } = await import('../services/reportExportService.js')
      const result = exportReportText(weeklyReportData, { reportType: 'weekly' })
      setExportStatus(`Exporterade ${result.filename}.`)
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Exporten misslyckades.')
    }
  }

  return (
    <div className="weekly-report">
      <button type="button" onClick={onCreateWeeklyReport}>
        Skapa AI-veckorapport
      </button>
      {weeklyReportStatus && (
        <p className="analysis-status">{weeklyReportStatus}</p>
      )}
      {(hasStructuredReport || weeklyReportLines.length > 0) && (
        <div className="report-card">
          {hasStructuredReport ? (
            <>
              {reportModel && (
                <div className="shared-report-v3" aria-live="polite">
                  <div className="report-v3-actions">
                    {[
                      ['weight', 'Vikt'],
                      ['nutrition', 'Nutrition'],
                      ['activity', 'Aktivitet'],
                      ['goals', 'Mål & vanor'],
                      ['attention', 'Highlights'],
                      ['coverage', 'Datakvalitet'],
                    ].map(([sectionId, label]) => (
                      <button
                        aria-controls="weekly-report-drilldown"
                        aria-expanded={activeDrilldown === sectionId}
                        className="secondary-button"
                        key={sectionId}
                        type="button"
                        onClick={(event) => openDrilldown(sectionId, event)}
                      >
                        {label}
                      </button>
                    ))}
                    <button className="secondary-button" type="button" onClick={exportText}>Exportera text</button>
                  </div>
                  {exportStatus && <p className="analysis-status" aria-live="polite">{exportStatus}</p>}
                  <ReportOverview model={reportModel} onPrint={printReport} />
                  {activeDrilldown && (
                    <div id="weekly-report-drilldown">
                      <Suspense fallback={<div className="report-v3-card" role="status">Laddar detaljvy...</div>}>
                        <ReportDrilldown
                          onClose={closeDrilldown}
                          report={weeklyReportData}
                          reportType="weekly"
                          sectionId={activeDrilldown}
                        />
                      </Suspense>
                    </div>
                  )}
                  <ReportCoverage coverage={reportModel.coverage} dataQuality={reportModel.dataQuality} />
                  <div className="report-v3-grid">
                    {reportModel.trendCards.slice(0, 4).map((card) => <ReportTrendCard card={card} key={card.id} />)}
                  </div>
                  <h3>Jämförelse</h3>
                  <div className="report-v3-grid compact">
                    {reportModel.comparisonCards.map((card) => <ReportComparisonCard card={card} key={card.id} />)}
                  </div>
                  <div className="report-v3-grid compact">
                    <ReportHighlights items={reportModel.highlights} />
                    <ReportAttentionItems items={reportModel.attentionItems} />
                    <ReportGoalsHabits goalsHabits={reportModel.goalsHabits} />
                    <ReportNextActions items={reportModel.nextActions} />
                  </div>
                </div>
              )}
              {reportSections.map(([key, heading]) => (
                <div key={key}>
                  <p className="report-heading">{heading}</p>
                  <p>{weeklyReportData[key]}</p>
                </div>
              ))}
              <div>
                <p className="report-heading">3 konkreta nästa steg</p>
                {(weeklyReportData.nextSteps || []).slice(0, 3).map((step) => (
                  <p key={step}>• {step}</p>
                ))}
              </div>
              {weeklyReportData.goalsHabits && (
                <div>
                  <p className="report-heading">Mål & vanor</p>
                  <p>{weeklyReportData.goalsHabits.summary}</p>
                  <p>{weeklyReportData.goalsHabits.positiveProgress}</p>
                </div>
              )}
              {weeklyReportData.coachFeedback && (
                <div>
                  <p className="report-heading">Coachens genomförandegrad</p>
                  <p>{weeklyReportData.coachFeedback.completionRateLabel}</p>
                  <p>
                    Accepterade: {weeklyReportData.coachFeedback.accepted}. Klara: {weeklyReportData.coachFeedback.completed}.
                    Uppskjutna: {weeklyReportData.coachFeedback.postponed}. Avfärdade: {weeklyReportData.coachFeedback.dismissed}.
                  </p>
                </div>
              )}
              {weeklyReportData.coachActions && (
                <div>
                  <p className="report-heading">Skapade coach actions</p>
                  <p>
                    Skapade: {weeklyReportData.coachActions.total}. Klara: {weeklyReportData.coachActions.completed}.
                    Conversion: {weeklyReportData.coachActions.conversionRate === null ? 'Saknas' : `${weeklyReportData.coachActions.conversionRate}%`}.
                  </p>
                  <p>Nästa rekommenderade action: {weeklyReportData.nextSteps?.[0] || weeklyReportData.focusNextWeek}</p>
                </div>
              )}
              {weeklyReportData.coachTimeline && (
                <div>
                  <p className="report-heading">Coachens fokusförändring</p>
                  <p>{weeklyReportData.coachTimeline.latestEvent?.summary || 'Ingen tydlig coachhändelse i perioden.'}</p>
                  <p>Uppskjutna: {weeklyReportData.coachTimeline.postponed}. Avfärdade: {weeklyReportData.coachTimeline.dismissed}.</p>
                </div>
              )}
              <p className="estimate-note">
                Rapporten är allmänt stöd för hälsa och vanor, inte medicinsk
                rådgivning.
              </p>
            </>
          ) : (
            <LegacyReport weeklyReportLines={weeklyReportLines} />
          )}
        </div>
      )}
    </div>
  )
}

export default WeeklyReport
