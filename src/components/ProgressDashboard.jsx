import { useMemo, useState } from 'react'
import {
  readGeneratedMealPlans,
  readMealPlans,
} from '../services/nutrition/nutritionEngine.js'
import {
  buildProgressDashboardAnalytics,
  progressPeriods,
} from '../services/progress/progressAnalytics.js'
import GoalForecastCard from './progress/GoalForecastCard.jsx'
import HabitProgressCard from './progress/HabitProgressCard.jsx'
import NutritionProgressCard from './progress/NutritionProgressCard.jsx'
import ProgressInsights from './progress/ProgressInsights.jsx'
import ProgressSummaryCards from './progress/ProgressSummaryCards.jsx'
import ProgressTrendCard from './progress/ProgressTrendCard.jsx'
import WeeklyReport from './WeeklyReport.jsx'

const periodStorageKey = 'viktkollen.progressDashboard.period'

function readStoredPeriod() {
  try {
    const stored = window.localStorage.getItem(periodStorageKey)
    return progressPeriods.some((period) => period.id === stored) ? stored : '30d'
  } catch {
    return '30d'
  }
}

function writeStoredPeriod(period) {
  try {
    window.localStorage.setItem(periodStorageKey, period)
  } catch {
    // Period choice is only a UI preference.
  }
}

function ProgressDashboard({
  checkIn,
  checkIns,
  foods,
  meals,
  nutritionGoals,
  onCreateWeeklyReport,
  profile,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
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
      mealPlans,
      meals,
      nutritionGoals,
      profile,
      weeklyReportData,
      weights,
    }, { period }),
    [checkIn, checkIns, foods, generatedMealPlans, mealPlans, meals, nutritionGoals, period, profile, weeklyReportData, weights],
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
          <h2>Smart Progress Dashboard</h2>
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
          comparison={analysis.comparison}
          insights={analysis.insights}
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
