import { useMemo, useState } from 'react'
import {
  readGeneratedMealPlans,
  readMealPlans,
} from '../services/nutrition/nutritionEngine.js'
import {
  buildProgressDashboardAnalytics,
  progressPeriods,
} from '../services/progress/progressAnalytics.js'
import { buildProgressInsightsModel } from '../services/progressInsights/progressInsightsEngine.js'
import GoalForecastCard from './progress/GoalForecastCard.jsx'
import HabitProgressCard from './progress/HabitProgressCard.jsx'
import NutritionProgressCard from './progress/NutritionProgressCard.jsx'
import ProgressInsights from './progress/ProgressInsights.jsx'
import ProgressSummaryCards from './progress/ProgressSummaryCards.jsx'
import ProgressTrendCard from './progress/ProgressTrendCard.jsx'
import WeeklyReport from './WeeklyReport.jsx'
import { readStorage, writeStorage } from '../services/appStorageService.js'

const periodStorageKey = 'viktkollen.progressDashboard.period'
const confidenceLabels = {
  high: 'Hög',
  insufficient: 'Otillräcklig',
  low: 'Låg',
  medium: 'Medel',
}

function readStoredPeriod() {
  const stored = readStorage(periodStorageKey, '30d')
  return progressPeriods.some((period) => period.id === stored) ? stored : '30d'
}

function writeStoredPeriod(period) {
  writeStorage(periodStorageKey, period)
}

function ProgressDashboard({
  checkIn,
  checkIns,
  bodyAnalysisHistory,
  foods,
  healthSnapshot,
  meals,
  nutritionGoals,
  onCreateWeeklyReport,
  profile,
  progressPhotoItems,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
  today,
  weights,
}) {
  const [period, setPeriod] = useState(readStoredPeriod)
  const mealPlans = useMemo(() => readMealPlans(), [])
  const generatedMealPlans = useMemo(() => readGeneratedMealPlans(), [])
  const analysis = useMemo(
    () => buildProgressDashboardAnalytics({
      bodyAnalysisHistory,
      checkIn,
      checkIns,
      foods,
      generatedMealPlans,
      healthSnapshot,
      mealPlans,
      meals,
      nutritionGoals,
      profile,
      today,
      weeklyReportData,
      weights,
    }, { period }),
    [bodyAnalysisHistory, checkIn, checkIns, foods, generatedMealPlans, healthSnapshot, mealPlans, meals, nutritionGoals, period, profile, today, weeklyReportData, weights],
  )
  const progressInsights = useMemo(
    () => buildProgressInsightsModel({
      bodyAnalysisHistory,
      checkIn,
      checkIns,
      foods,
      generatedMealPlans,
      healthSnapshot,
      mealPlans,
      meals,
      nutritionGoals,
      profile,
      progressPhotoItems,
      today,
      weeklyReportData,
      weights,
    }, { period, today }),
    [bodyAnalysisHistory, checkIn, checkIns, foods, generatedMealPlans, healthSnapshot, mealPlans, meals, nutritionGoals, period, profile, progressPhotoItems, today, weeklyReportData, weights],
  )

  function changePeriod(nextPeriod) {
    setPeriod(nextPeriod)
    writeStoredPeriod(nextPeriod)
  }

  return (
    <article className="panel progress-dashboard-panel" id="framsteg">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Framsteg</p>
          <h2>Din utveckling</h2>
          <span>Faktiskt intag, planering, vanor och vikttrend hålls separerade.</span>
        </div>
      </div>

      <div className="segmented-control progress-period-toggle" aria-label="Välj period för framsteg">
        {progressPeriods.map((entry) => (
          <button
            aria-pressed={period === entry.id}
            className={period === entry.id ? 'active' : ''}
            key={entry.id}
            type="button"
            onClick={() => changePeriod(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <ProgressSummaryCards analysis={analysis} />

      <div className="progress-dashboard-grid">
        <ProgressTrendCard weight={analysis.weight} />
        <NutritionProgressCard nutrition={analysis.nutrition} planning={analysis.planning} />
        <HabitProgressCard habits={analysis.habits} />
        <GoalForecastCard forecast={analysis.forecast} />
        <section className="nutrition-card progress-card" aria-labelledby="progress-comparison-title">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">Period mot period</p>
              <h3 id="progress-comparison-title">Jämförelse</h3>
            </div>
          </div>
          {analysis.comparison.hasComparison ? (
            <dl className="progress-detail-grid">
              <div><dt>Vikttrend</dt><dd>{analysis.comparison.weightChangeDelta === null ? 'Saknas' : `${analysis.comparison.weightChangeDelta.toLocaleString('sv-SE')} kg skillnad`}</dd></div>
              <div><dt>Vägningar</dt><dd>{analysis.weight.registrationCount} i vald period</dd></div>
              <div><dt>Måltider</dt><dd>{analysis.comparison.mealCountDelta >= 0 ? '+' : ''}{analysis.comparison.mealCountDelta}</dd></div>
              <div><dt>Proteinmål</dt><dd>{analysis.comparison.proteinGoalPercentDelta >= 0 ? '+' : ''}{analysis.comparison.proteinGoalPercentDelta} procentenheter</dd></div>
              <div><dt>Steg</dt><dd>{analysis.comparison.stepAverageDelta === null ? 'Saknas' : `${analysis.comparison.stepAverageDelta >= 0 ? '+' : ''}${analysis.comparison.stepAverageDelta.toLocaleString('sv-SE')} steg/dag`}</dd></div>
              <div><dt>Check-ins</dt><dd>{analysis.comparison.checkInDelta >= 0 ? '+' : ''}{analysis.comparison.checkInDelta}</dd></div>
            </dl>
          ) : (
            <div className="nutrition-empty">
              <strong>Ingen säker periodjämförelse ännu.</strong>
              <span>{analysis.comparison.reason || 'Föregående period saknar tillräcklig data.'}</span>
            </div>
          )}
        </section>
        <section className="nutrition-card progress-card" aria-labelledby="progress-body-scan-title">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">Body Scan-historik</p>
              <h3 id="progress-body-scan-title">AI-estimat separat</h3>
            </div>
            <span className="nutrition-pill">{analysis.bodyScan.scanCount} scans</span>
          </div>
          {analysis.bodyScan.latest ? (
            <>
              <dl className="progress-detail-grid">
                <div><dt>Senaste scan</dt><dd>{analysis.bodyScan.latest.date}</dd></div>
                <div><dt>AI-viktintervall</dt><dd>{analysis.bodyScan.latestEstimatedWeightLabel}</dd></div>
                <div><dt>Confidence</dt><dd>{analysis.bodyScan.latest.confidence}</dd></div>
                <div><dt>Bilder/vinklar</dt><dd>{analysis.bodyScan.latest.imageCount || 'Saknas'} / {analysis.bodyScan.latest.viewCount || 'Saknas'}</dd></div>
              </dl>
              <div className="coach-note">{analysis.bodyScan.comparisonText}</div>
            </>
          ) : (
            <div className="nutrition-empty">
              <strong>Ingen kroppsscanning i vald period.</strong>
              <span>Gör en ny kroppsscanning för att se AI-estimat separat från uppmätt vikt.</span>
            </div>
          )}
        </section>
        <section className="nutrition-card progress-card" aria-labelledby="progress-data-quality-title">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">Datakvalitet</p>
              <h3 id="progress-data-quality-title">Underlag</h3>
            </div>
            <span className="nutrition-pill">{analysis.dataQuality.label}</span>
          </div>
          <dl className="progress-detail-grid">
            <div><dt>Score</dt><dd>{analysis.dataQuality.score}/100</dd></div>
            <div><dt>Prognos-confidence</dt><dd>{confidenceLabels[analysis.forecast.confidence] || 'Osäker'}</dd></div>
          </dl>
          <ul className="progress-quality-list">
            {analysis.dataQuality.signals.map((signal) => <li key={signal}>{signal}</li>)}
          </ul>
        </section>
        <ProgressInsights
          model={progressInsights}
          weeklySummary={analysis.weeklySummary}
        />
      </div>

      <WeeklyReport
        onCreateWeeklyReport={onCreateWeeklyReport}
        weeklyReportData={weeklyReportData}
        weeklyReportLines={weeklyReportLines}
        weeklyReportStatus={weeklyReportStatus}
      />
    </article>
  )
}

export default ProgressDashboard
