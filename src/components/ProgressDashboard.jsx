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
    [checkIn, checkIns, foods, generatedMealPlans, healthSnapshot, mealPlans, meals, nutritionGoals, period, profile, today, weeklyReportData, weights],
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
