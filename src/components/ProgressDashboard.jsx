import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  readGeneratedMealPlans,
  readMealPlans,
} from '../services/nutrition/nutritionEngine.js'
import {
  buildProgressDashboardAnalytics,
  progressPeriods,
} from '../services/progress/progressAnalytics.js'
import { buildProgressInsightsModel } from '../services/progressInsights/progressInsightsEngine.js'
import { formatNumber } from '../i18n/format.js'
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
  high: 'high',
  insufficient: 'insufficient',
  low: 'low',
  medium: 'medium',
}

function readStoredPeriod() {
  const stored = readStorage(periodStorageKey, '30d')
  return progressPeriods.some((period) => period.id === stored) ? stored : '30d'
}

function writeStoredPeriod(period) {
  writeStorage(periodStorageKey, period)
}

function formatSignedNumber(value) {
  const formatted = formatNumber(value)
  if (!formatted) return ''
  return value >= 0 ? `+${formatted}` : formatted
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
  const { t } = useTranslation('progress')
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

  const forecastConfidenceKey = confidenceLabels[analysis.forecast.confidence]
  const bodyScanConfidenceKey = analysis.bodyScan.latest
    ? confidenceLabels[analysis.bodyScan.latest.confidence]
    : null

  return (
    <article className="panel progress-dashboard-panel" id="framsteg">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2>{t('dashboard.title')}</h2>
          <span>{t('dashboard.intro')}</span>
        </div>
      </div>

      <div className="segmented-control progress-period-toggle" aria-label={t('dashboard.periodAria')}>
        {progressPeriods.map((entry) => (
          <button
            aria-pressed={period === entry.id}
            className={period === entry.id ? 'active' : ''}
            key={entry.id}
            type="button"
            onClick={() => changePeriod(entry.id)}
          >
            {t(`dashboard.periods.${entry.id}`)}
          </button>
        ))}
      </div>

      <ProgressSummaryCards analysis={analysis} />

      <details className="progress-hub-more">
        <summary>{t('dashboard.showMoreDevelopment')}</summary>
      <div className="progress-dashboard-grid">
        <ProgressTrendCard weight={analysis.weight} />
        <NutritionProgressCard nutrition={analysis.nutrition} planning={analysis.planning} />
        <HabitProgressCard habits={analysis.habits} />
        <GoalForecastCard forecast={analysis.forecast} />
        <section className="nutrition-card progress-card" aria-labelledby="progress-comparison-title">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">{t('dashboard.comparisonEyebrow')}</p>
              <h3 id="progress-comparison-title">{t('dashboard.comparisonTitle')}</h3>
            </div>
          </div>
          {analysis.comparison.hasComparison ? (
            <dl className="progress-detail-grid">
              <div>
                <dt>{t('dashboard.weightTrend')}</dt>
                <dd>
                  {analysis.comparison.weightChangeDelta === null
                    ? t('dashboard.missing')
                    : t('dashboard.weightChangeDelta', {
                      value: formatNumber(analysis.comparison.weightChangeDelta),
                    })}
                </dd>
              </div>
              <div>
                <dt>{t('dashboard.weighIns')}</dt>
                <dd>{t('dashboard.weighInsInPeriod', { count: analysis.weight.registrationCount })}</dd>
              </div>
              <div>
                <dt>{t('dashboard.meals')}</dt>
                <dd>{formatSignedNumber(analysis.comparison.mealCountDelta)}</dd>
              </div>
              <div>
                <dt>{t('dashboard.proteinGoal')}</dt>
                <dd>
                  {t('dashboard.percentagePoints', {
                    value: formatSignedNumber(analysis.comparison.proteinGoalPercentDelta),
                  })}
                </dd>
              </div>
              <div>
                <dt>{t('dashboard.steps')}</dt>
                <dd>
                  {analysis.comparison.stepAverageDelta === null
                    ? t('dashboard.missing')
                    : t('dashboard.stepsPerDay', {
                      value: formatSignedNumber(analysis.comparison.stepAverageDelta),
                    })}
                </dd>
              </div>
              <div>
                <dt>{t('dashboard.checkIns')}</dt>
                <dd>{formatSignedNumber(analysis.comparison.checkInDelta)}</dd>
              </div>
            </dl>
          ) : (
            <div className="nutrition-empty">
              <strong>{t('dashboard.noComparisonTitle')}</strong>
              <span>{analysis.comparison.reason || t('dashboard.noComparisonFallback')}</span>
            </div>
          )}
        </section>
        <section className="nutrition-card progress-card" aria-labelledby="progress-body-scan-title">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">{t('dashboard.bodyScanEyebrow')}</p>
              <h3 id="progress-body-scan-title">{t('dashboard.bodyScanTitle')}</h3>
            </div>
            <span className="nutrition-pill">{t('dashboard.scanCount', { count: analysis.bodyScan.scanCount })}</span>
          </div>
          {analysis.bodyScan.latest ? (
            <>
              <dl className="progress-detail-grid">
                <div><dt>{t('dashboard.latestScan')}</dt><dd>{analysis.bodyScan.latest.date}</dd></div>
                <div><dt>{t('dashboard.aiWeightRange')}</dt><dd>{analysis.bodyScan.latestEstimatedWeightLabel}</dd></div>
                <div>
                  <dt>{t('dashboard.confidenceLabel')}</dt>
                  <dd>
                    {bodyScanConfidenceKey
                      ? t(`dashboard.confidence.${bodyScanConfidenceKey}`)
                      : analysis.bodyScan.latest.confidence}
                  </dd>
                </div>
                <div>
                  <dt>{t('dashboard.imagesAngles')}</dt>
                  <dd>
                    {t('dashboard.imagesAnglesValue', {
                      images: analysis.bodyScan.latest.imageCount || t('dashboard.missing'),
                      views: analysis.bodyScan.latest.viewCount || t('dashboard.missing'),
                    })}
                  </dd>
                </div>
              </dl>
              <div className="coach-note">{analysis.bodyScan.comparisonText}</div>
            </>
          ) : (
            <div className="nutrition-empty">
              <strong>{t('dashboard.noBodyScanTitle')}</strong>
              <span>{t('dashboard.noBodyScanHint')}</span>
            </div>
          )}
        </section>
        <section className="nutrition-card progress-card" aria-labelledby="progress-data-quality-title">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">{t('dashboard.dataQualityEyebrow')}</p>
              <h3 id="progress-data-quality-title">{t('dashboard.dataQualityTitle')}</h3>
            </div>
            <span className="nutrition-pill">{analysis.dataQuality.label}</span>
          </div>
          <dl className="progress-detail-grid">
            <div>
              <dt>{t('dashboard.score')}</dt>
              <dd>{t('dashboard.scoreValue', { score: analysis.dataQuality.score })}</dd>
            </div>
            <div>
              <dt>{t('dashboard.forecastConfidence')}</dt>
              <dd>
                {forecastConfidenceKey
                  ? t(`dashboard.confidence.${forecastConfidenceKey}`)
                  : t('dashboard.confidence.uncertain')}
              </dd>
            </div>
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
      </details>

      <details className="progress-hub-more">
        <summary>{t('dashboard.showMoreWeeklyReport')}</summary>
      <WeeklyReport
        onCreateWeeklyReport={onCreateWeeklyReport}
        weeklyReportData={weeklyReportData}
        weeklyReportLines={weeklyReportLines}
        weeklyReportStatus={weeklyReportStatus}
      />
      </details>
    </article>
  )
}

export default ProgressDashboard
