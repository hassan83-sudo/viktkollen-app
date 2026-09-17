import { lazy, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../../components/AppErrorBoundary.jsx'
import AppSection from '../../components/app/AppSection.jsx'
import ActivitySection from '../activity/ActivitySection.jsx'
import { analyzeWeights, formatKg } from '../../services/progressService.js'
import { normalizeMeals, normalizeNutritionGoals, summarizeDay } from '../../services/nutritionService.js'

const GoalsHabitsPanel = lazy(() => import('../../components/GoalsHabitsPanel.jsx'))
const HabitGoalCenter = lazy(() => import('../../components/HabitGoalCenter.jsx'))

const journeyTabIds = ['overview', 'progress', 'nutrition', 'activity', 'goals', 'coach', 'reports']
const shortcutTabIds = ['progress', 'nutrition', 'activity', 'goals', 'coach', 'reports']

// Existing navigation-intent target id that ProgressSection's own folder
// router already maps to its "reports" folder (see progressHubModel.js).
// Reusing it lets Min resa -> Rapporter open the exact same report views
// as Mer -> Framsteg -> Rapporter, with no new report code.
const reportsNavigationIntent = { targetId: 'rapportcenter' }

function JourneySection({
  activeSection,
  coachSectionProps,
  NutritionSectionComponent,
  nutritionSectionProps,
  ProgressSectionComponent,
  progressSectionProps,
  CoachSectionComponent,
}) {
  const { t } = useTranslation('journey')
  const [activeTab, setActiveTab] = useState('overview')

  const weightAnalysis = useMemo(
    () => analyzeWeights(progressSectionProps?.weights, progressSectionProps?.profile),
    [progressSectionProps?.weights, progressSectionProps?.profile],
  )

  const normalizedGoals = useMemo(
    () => normalizeNutritionGoals(nutritionSectionProps?.nutritionGoals),
    [nutritionSectionProps?.nutritionGoals],
  )

  const dailySummary = useMemo(
    () => summarizeDay(
      normalizeMeals(nutritionSectionProps?.meals),
      nutritionSectionProps?.selectedMealDate,
      normalizedGoals,
    ),
    [nutritionSectionProps?.meals, nutritionSectionProps?.selectedMealDate, normalizedGoals],
  )

  const todaysTotals = dailySummary.totals || {}
  const goalWeight = weightAnalysis.target?.goalWeight

  const statTiles = []

  if (weightAnalysis.latest) {
    statTiles.push({
      key: 'latestWeight',
      label: t('overview.latestWeight'),
      value: formatKg(weightAnalysis.latest.value),
    })
  }

  statTiles.push({
    key: 'proteinToday',
    label: t('overview.proteinToday'),
    value: normalizedGoals.protein
      ? `${Math.round(todaysTotals.protein || 0)} / ${Math.round(normalizedGoals.protein)} g`
      : `${Math.round(todaysTotals.protein || 0)} g`,
  })

  statTiles.push({
    key: 'caloriesToday',
    label: t('overview.caloriesToday'),
    value: normalizedGoals.calories
      ? `${Math.round(todaysTotals.calories || 0)} / ${Math.round(normalizedGoals.calories)} kcal`
      : `${Math.round(todaysTotals.calories || 0)} kcal`,
  })

  if (goalWeight) {
    statTiles.push({
      key: 'goalWeight',
      label: t('overview.goalWeight'),
      value: formatKg(goalWeight),
    })
  } else if (weightAnalysis.latest) {
    statTiles.push({
      key: 'trend',
      label: t('overview.trend'),
      value: weightAnalysis.trend,
    })
  }

  return (
    <AppSection activeSection={activeSection} id="journey" label={t('sectionLabel')}>
      <div className="journey-section">
        <header className="journey-heading panel">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </header>

        <div className="segmented-control journey-tabs" aria-label={t('tabsAriaLabel')}>
          {journeyTabIds.map((tabId) => (
            <button
              key={tabId}
              type="button"
              className={activeTab === tabId ? 'active' : ''}
              onClick={() => setActiveTab(tabId)}
            >
              {t(`tabs.${tabId}`)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="journey-overview panel">
            {statTiles.length > 0 && (
              <div className="more-goals-cards">
                {statTiles.map((tile) => (
                  <div className="more-goals-card" key={tile.key}>
                    <span>{tile.label}</span>
                    <strong>{tile.value}</strong>
                  </div>
                ))}
              </div>
            )}

            <p className="journey-overview-continue-heading">{t('overview.continueTitle')}</p>
            <nav className="more-hub-folders" aria-label={t('overview.continueTitle')}>
              {shortcutTabIds.map((tabId) => (
                <button
                  key={tabId}
                  type="button"
                  className="more-hub-folder"
                  onClick={() => setActiveTab(tabId)}
                >
                  <span className="more-hub-folder-copy">
                    <strong>{t(`tabs.${tabId}`)}</strong>
                  </span>
                  <span className="more-hub-folder-chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {activeTab === 'progress' && ProgressSectionComponent && (
          <AppErrorBoundary area="progress" title={t('progressError')}>
            <ProgressSectionComponent {...progressSectionProps} activeSection="progress" />
          </AppErrorBoundary>
        )}

        {activeTab === 'nutrition' && NutritionSectionComponent && (
          <AppErrorBoundary area="nutrition" title={t('nutritionError')}>
            <NutritionSectionComponent {...nutritionSectionProps} activeSection="nutrition" />
          </AppErrorBoundary>
        )}

        {activeTab === 'activity' && (
          <AppErrorBoundary area="activity" title={t('activityError')}>
            <ActivitySection />
          </AppErrorBoundary>
        )}

        {activeTab === 'goals' && coachSectionProps && (
          <AppErrorBoundary area="goals" title={t('goalsError')}>
            <GoalsHabitsPanel
              analysisDate={coachSectionProps.selectedMealDate}
              checkIn={coachSectionProps.checkIn}
              goalsHabits={coachSectionProps.goalsHabits}
              meals={coachSectionProps.meals}
              nutritionGoals={coachSectionProps.nutritionGoals}
              onGoalsHabitsChange={coachSectionProps.onGoalsHabitsChange}
              profile={coachSectionProps.profile}
              weights={coachSectionProps.weights}
            />
            <HabitGoalCenter
              adaptiveCoachFeedback={coachSectionProps.adaptiveCoachFeedback}
              checkIn={coachSectionProps.checkIn}
              goalsHabits={coachSectionProps.goalsHabits}
              healthSnapshot={coachSectionProps.healthSnapshot}
              meals={coachSectionProps.meals}
              nutritionGoals={coachSectionProps.nutritionGoals}
              profile={coachSectionProps.profile}
              reminderState={coachSectionProps.reminderState}
              today={coachSectionProps.selectedMealDate}
              weights={coachSectionProps.weights}
            />
          </AppErrorBoundary>
        )}

        {activeTab === 'coach' && CoachSectionComponent && (
          <AppErrorBoundary area="coach" title={t('coachError')}>
            <CoachSectionComponent {...coachSectionProps} activeSection="coach" />
          </AppErrorBoundary>
        )}

        {activeTab === 'reports' && ProgressSectionComponent && (
          <AppErrorBoundary area="reports" title={t('reportsError')}>
            <ProgressSectionComponent
              {...progressSectionProps}
              activeSection="progress"
              navigationIntent={reportsNavigationIntent}
            />
          </AppErrorBoundary>
        )}
      </div>
    </AppSection>
  )
}

export default JourneySection
