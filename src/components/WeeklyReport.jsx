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
              {weeklyReportData.coachPatterns && (
                <div>
                  <p className="report-heading">Observerade coachmönster</p>
                  <p>{weeklyReportData.coachPatterns.text}</p>
                  <p>Supported: {weeklyReportData.coachPatterns.supportedCount}. Tentative: {weeklyReportData.coachPatterns.tentativeCount}.</p>
                </div>
              )}
              {weeklyReportData.coachStrategy && (
                <div>
                  <p className="report-heading">Coachstrategi</p>
                  <p>{weeklyReportData.coachStrategy.title}</p>
                  <p>{weeklyReportData.coachStrategy.explanation}</p>
                </div>
              )}
              {weeklyReportData.photoAnalysis && (
                <div>
                  <p className="report-heading">Fotoanalyserad mat</p>
                  <p>{weeklyReportData.photoAnalysis.text}</p>
                  <p>Remote: {weeklyReportData.photoAnalysis.providerCounts?.remote ?? 0}. Lokal: {(weeklyReportData.photoAnalysis.providerCounts?.mock ?? 0) + (weeklyReportData.photoAnalysis.providerCounts?.local ?? 0)}. Matdatabas: {weeklyReportData.photoAnalysis.dataSourceCounts?.nutritionDatabase ?? 0}.</p>
                  <p>Låg confidence: {weeklyReportData.photoAnalysis.lowConfidenceCount}. Bilddata sparas inte i rapporten.</p>
                </div>
              )}
              {weeklyReportData.insights && (
                <div>
                  <p className="report-heading">Insights & consistency</p>
                  <p>Insight Score: {weeklyReportData.insights.score}. Momentum: {weeklyReportData.insights.momentum}. Consistency: {weeklyReportData.insights.consistency}.</p>
                  <p>{weeklyReportData.insights.improvementSignals[0]?.text || 'Inga tydliga förbättringssignaler ännu.'}</p>
                  <p>{weeklyReportData.insights.regressionSignals[0]?.text || 'Inga tydliga regressionssignaler just nu.'}</p>
                </div>
              )}
              {weeklyReportData.predictions && (
                <div>
                  <p className="report-heading">Predictive health</p>
                  <p>{weeklyReportData.predictions.predictedTrajectory}</p>
                  <p>Confidence: {weeklyReportData.predictions.confidence}%.</p>
                  <p>{weeklyReportData.predictions.opportunities[0]?.explanation || 'Inga tydliga möjligheter ännu.'}</p>
                  <p>{weeklyReportData.predictions.cautionSignals[0]?.support || 'Inga försiktiga varningssignaler just nu.'}</p>
                </div>
              )}
              {weeklyReportData.journey && (
                <div>
                  <p className="report-heading">Veckans health journey</p>
                  <p>{weeklyReportData.journey.summary}</p>
                  <p>Viktigaste event: {weeklyReportData.journey.keyEvent}</p>
                  <p>Milstolpe: {weeklyReportData.journey.milestone}</p>
                  <p>Opportunity: {weeklyReportData.journey.opportunity}</p>
                  <p>Caution: {weeklyReportData.journey.caution || weeklyReportData.journey.limitations?.[0]}</p>
                </div>
              )}
              {weeklyReportData.smartGoals && (
                <div>
                  <p className="report-heading">Smarta mål och vanor</p>
                  <p>{weeklyReportData.smartGoals.summary}</p>
                  <p>Rekommenderat mål: {weeklyReportData.smartGoals.recommendedWeeklyGoal}</p>
                  <p>Rekommenderad vana: {weeklyReportData.smartGoals.recommendedHabit}</p>
                  <p>Sannolikhet: {weeklyReportData.smartGoals.probability}</p>
                  <p>Nästa steg: {weeklyReportData.smartGoals.nextStep}</p>
                </div>
              )}
              {weeklyReportData.achievements && (
                <div>
                  <p className="report-heading">Achievements</p>
                  <p>Nivå {weeklyReportData.achievements.level}: {weeklyReportData.achievements.levelTitle}.</p>
                  <p>{weeklyReportData.achievements.unlockedCount} upplåsta. {weeklyReportData.achievements.milestoneCount} delmål passerade.</p>
                  <p>Coverage: {weeklyReportData.achievements.coverage}%. Confidence: {weeklyReportData.achievements.confidence}%.</p>
                </div>
              )}
              {weeklyReportData.social && (
                <div>
                  <p className="report-heading">Social delning</p>
                  <p>{weeklyReportData.social.friendCount} vänner och {weeklyReportData.social.partnerCount} accountability partners.</p>
                  <p>Delade mål: {weeklyReportData.social.sharedGoalCount}. Sharing: {weeklyReportData.social.sharingReady ? 'redo' : 'privat'}.</p>
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
