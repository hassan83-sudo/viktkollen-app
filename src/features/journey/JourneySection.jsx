import { lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../../components/AppErrorBoundary.jsx'
import AppSection from '../../components/app/AppSection.jsx'
import ActivitySection from '../activity/ActivitySection.jsx'

const GoalsHabitsPanel = lazy(() => import('../../components/GoalsHabitsPanel.jsx'))
const HabitGoalCenter = lazy(() => import('../../components/HabitGoalCenter.jsx'))

const journeyTabIds = ['overview', 'progress', 'nutrition', 'activity', 'goals']

function JourneySection({
  activeSection,
  coachSectionProps,
  NutritionSectionComponent,
  nutritionSectionProps,
  ProgressSectionComponent,
  progressSectionProps,
}) {
  const { t } = useTranslation('journey')
  const [activeTab, setActiveTab] = useState('overview')

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
            <p>{t('overviewPlaceholder')}</p>
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
      </div>
    </AppSection>
  )
}

export default JourneySection
