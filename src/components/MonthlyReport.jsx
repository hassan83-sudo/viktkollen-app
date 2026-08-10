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

function MetricCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MonthlyReport({ report }) {
  const [activeDrilldown, setActiveDrilldown] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const triggerRef = useRef(null)
  if (!report) {
    return null
  }
  const reportModel = report.sharedAnalytics
    ? buildSharedReportUiModel(report, { reportType: 'monthly' })
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
    try {
      const { exportReportText } = await import('../services/reportExportService.js')
      const result = exportReportText(report, { reportType: 'monthly' })
      setExportStatus(`Exporterade ${result.filename}.`)
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Exporten misslyckades.')
    }
  }

  return (
    <article className="panel report-panel" id="manadsrapport">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Lokal AI-rapport</p>
          <h2>Månadsrapport</h2>
        </div>
      </div>

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
                aria-controls="monthly-report-drilldown"
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
            <div id="monthly-report-drilldown">
              <Suspense fallback={<div className="report-v3-card" role="status">Laddar detaljvy...</div>}>
                <ReportDrilldown
                  onClose={closeDrilldown}
                  report={report}
                  reportType="monthly"
                  sectionId={activeDrilldown}
                />
              </Suspense>
            </div>
          )}
          <ReportCoverage coverage={reportModel.coverage} dataQuality={reportModel.dataQuality} />
          <div className="report-v3-grid">
            {reportModel.trendCards.slice(0, 5).map((card) => <ReportTrendCard card={card} key={card.id} />)}
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

      <div className="stats-grid">
        <MetricCard
          label="Viktförändring 30 dagar"
          value={report.weightChangeLabel}
        />
        <MetricCard label="Antal invägningar" value={report.weighInCount} />
        <MetricCard label="Genomsnittlig vikt" value={report.averageWeightLabel} />
        <MetricCard label="Bästa veckan" value={report.bestWeek} />
        <MetricCard label="Totalt antal måltider" value={report.totalMeals} />
        <MetricCard label="Vanligaste måltid" value={report.commonMealType} />
        <MetricCard
          label="Genomsnittligt proteinbetyg"
          value={report.averageProteinRating}
        />
        <MetricCard
          label="Genomsnittligt grönsaksbetyg"
          value={report.averageVegetableRating}
        />
      </div>

      <div className="report-card">
        <p className="report-heading">AI-sammanfattning</p>
        {report.aiSummary.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>

      <div className="report-card">
        <p className="report-heading">Tre största styrkor</p>
        {report.strengths.map((strength) => (
          <p key={strength}>✓ {strength}</p>
        ))}
      </div>

      <div className="report-card">
        <p className="report-heading">Tre förbättringsområden</p>
        {report.improvements.map((improvement) => (
          <p key={improvement}>• {improvement}</p>
        ))}
      </div>

      <div className="report-card">
        <p className="report-heading">Månadens prestation</p>
        <p>{report.monthlyAchievement}</p>
      </div>

      <div className="report-card">
        <p className="report-heading">Motivation</p>
        <p>{report.motivation}</p>
      </div>

      {report.goalsHabits && (
        <div className="report-card">
          <p className="report-heading">Mål & vanor</p>
          <p>{report.goalsHabits.summary}</p>
          <p>{report.goalsHabits.positiveProgress}</p>
        </div>
      )}

      {report.coachEffectiveness && (
        <div className="report-card">
          <p className="report-heading">Coach effectiveness</p>
          <p>{report.coachEffectiveness.effectivenessLabel}</p>
          <p>
            Hjälpte mest: {report.coachEffectiveness.helpedMost}. Ignorerades mest: {report.coachEffectiveness.ignoredMost}.
          </p>
          <p>
            Coverage: {Math.round(report.coachEffectiveness.coverage * 100).toLocaleString('sv-SE')}%.
            Confidence: {Math.round(report.coachEffectiveness.confidence * 100).toLocaleString('sv-SE')}%.
          </p>
        </div>
      )}

      {report.coachActions && (
        <div className="report-card">
          <p className="report-heading">Coach action conversion</p>
          <p>
            Actions: {report.coachActions.total}. Completion rate: {report.coachActions.completionRate === null ? 'Saknas' : `${report.coachActions.completionRate}%`}.
          </p>
          <p>
            Goal: {report.coachActions.byType.goal || 0}. Habit: {report.coachActions.byType.habit || 0}. Reminder: {report.coachActions.byType.reminder || 0}. Veckofokus: {report.coachActions.byType.weeklyFocus || 0}.
          </p>
        </div>
      )}

      {report.coachTimeline && (
        <div className="report-card">
          <p className="report-heading">Coachens förändrade fokus</p>
          <p>{report.coachTimeline.latestEvent?.summary || 'Ingen tydlig fokusförändring i perioden.'}</p>
          <p>
            Pågående actions: {report.coachTimeline.activeActions}. Vanligaste actiontyp: {report.coachTimeline.topActionType}.
          </p>
        </div>
      )}

      {report.coachPatterns && (
        <div className="report-card">
          <p className="report-heading">Återkommande coachmönster</p>
          <p>{report.coachPatterns.text}</p>
          <p>Supported: {report.coachPatterns.supportedCount}. Tentative: {report.coachPatterns.tentativeCount}.</p>
        </div>
      )}

      {report.coachStrategy && (
        <div className="report-card">
          <p className="report-heading">Coachstrategi</p>
          <p>{report.coachStrategy.title}</p>
          <p>{report.coachStrategy.explanation}</p>
        </div>
      )}

      {report.photoAnalysis && (
        <div className="report-card">
          <p className="report-heading">Fotoanalys och datakvalitet</p>
          <p>{report.photoAnalysis.text}</p>
          <p>Remote: {report.photoAnalysis.providerCounts?.remote ?? 0}. Lokal: {(report.photoAnalysis.providerCounts?.mock ?? 0) + (report.photoAnalysis.providerCounts?.local ?? 0)}. Matdatabas: {report.photoAnalysis.dataSourceCounts?.nutritionDatabase ?? 0}.</p>
          <p>
            Hög: {report.photoAnalysis.confidenceCounts.high}. Medel: {report.photoAnalysis.confidenceCounts.medium}.
            Låg/otillräcklig: {report.photoAnalysis.lowConfidenceCount}.
          </p>
        </div>
      )}

      {report.insights && (
        <div className="report-card">
          <p className="report-heading">Långtidstrender och milestones</p>
          <p>Insight Score: {report.insights.score}. Momentum: {report.insights.momentum}. Consistency: {report.insights.consistency}.</p>
          <p>{report.insights.milestones[0]?.text || 'Milstolpar visas när underlaget räcker.'}</p>
          <p>{report.insights.improvementSignals[0]?.text || 'Inga tydliga förbättringssignaler ännu.'}</p>
        </div>
      )}

      {report.predictions && (
        <div className="report-card">
          <p className="report-heading">Predicted trajectory</p>
          <p>{report.predictions.predictedTrajectory}</p>
          <p>Confidence: {report.predictions.confidence}%.</p>
          <p>{report.predictions.opportunities[0]?.nextStep || 'Möjligheter visas när underlaget räcker.'}</p>
          <p>{report.predictions.cautionSignals[0]?.support || 'Inga försiktiga varningssignaler just nu.'}</p>
        </div>
      )}

      {report.journey && (
        <div className="report-card">
          <p className="report-heading">Månadens health journey</p>
          <p>{report.journey.summary}</p>
          <p>Viktigaste förändring: {report.journey.keyEvent}</p>
          <p>Milstolpe: {report.journey.milestone}</p>
          <p>Nästa fokus: {report.journey.opportunity}</p>
          <p>Confidence: {report.journey.confidence}%. Coverage: {report.journey.coverage}%.</p>
        </div>
      )}

      {report.smartGoals && (
        <div className="report-card">
          <p className="report-heading">Smart habit & goal trend</p>
          <p>{report.smartGoals.summary}</p>
          <p>Veckomål: {report.smartGoals.recommendedWeeklyGoal}</p>
          <p>Vana: {report.smartGoals.recommendedHabit}</p>
          <p>Sannolikhet: {report.smartGoals.probability}</p>
          <p>Nästa steg: {report.smartGoals.nextStep}</p>
        </div>
      )}

      {report.achievements && (
        <div className="report-card">
          <p className="report-heading">Achievements och delmål</p>
          <p>Nivå {report.achievements.level}: {report.achievements.levelTitle}. {report.achievements.totalXp} XP totalt.</p>
          <p>{report.achievements.unlockedCount} upplåsta och {report.achievements.activeChallengeCount} aktiva små utmaningar.</p>
          <p>Coverage: {report.achievements.coverage}%. Confidence: {report.achievements.confidence}%.</p>
        </div>
      )}

      {report.social && (
        <div className="report-card">
          <p className="report-heading">Social & accountability</p>
          <p>{report.social.friendCount} vänner och {report.social.partnerCount} accountability partners.</p>
          <p>Delade mål: {report.social.sharedGoalCount}. Delade challenges: {report.social.sharedChallengeCount}.</p>
          <p>Privacy: {report.social.privacyLabel}. Sharing: {report.social.sharingReady ? 'redo' : 'privat'}.</p>
        </div>
      )}

      <p className="estimate-note">
        Rapporten skapas lokalt från sparad data och är allmänt stöd för vanor,
        inte medicinsk rådgivning.
      </p>
    </article>
  )
}

export default MonthlyReport
