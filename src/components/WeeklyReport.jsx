import { buildSharedReportUiModel } from '../services/sharedReportUiModel.js'
import ReportAttentionItems from './reports/ReportAttentionItems.jsx'
import ReportComparisonCard from './reports/ReportComparisonCard.jsx'
import ReportCoverage from './reports/ReportCoverage.jsx'
import ReportGoalsHabits from './reports/ReportGoalsHabits.jsx'
import ReportHighlights from './reports/ReportHighlights.jsx'
import ReportNextActions from './reports/ReportNextActions.jsx'
import ReportOverview from './reports/ReportOverview.jsx'
import ReportTrendCard from './reports/ReportTrendCard.jsx'

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
  const reportModel = hasStructuredReport && weeklyReportData.sharedAnalytics
    ? buildSharedReportUiModel(weeklyReportData, { reportType: 'weekly' })
    : null
  const printReport = () => {
    if (typeof window !== 'undefined') window.print()
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
                  <ReportOverview model={reportModel} onPrint={printReport} />
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
