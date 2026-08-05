import { lazy, Suspense } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import Dashboard from '../Dashboard.jsx'
import AppSection from '../app/AppSection.jsx'
import LazySectionFallback from '../app/LazySectionFallback.jsx'

const HealthDashboardV2 = lazy(() => import('../HealthDashboardV2.jsx'))

function HomeSection({
  activeSection,
  adaptiveCoachFeedback,
  checkIn,
  dashboardActions,
  dashboardData,
  goalsHabits,
  healthDashboardPeriod,
  healthSnapshot,
  meals,
  nutritionGoals,
  onHealthDashboardPeriodChange,
  profile,
  selectedMealDate,
  weights,
}) {
  return (
    <AppSection
      activeSection={activeSection}
      id="home"
      label="Hem och översikt"
    >
      <AppErrorBoundary
        area="dashboard"
        resetKey={healthSnapshot.date}
        title="Översikten kunde inte visas"
      >
        <Dashboard actions={dashboardActions} dashboard={dashboardData} />
      </AppErrorBoundary>

      <Suspense fallback={<LazySectionFallback />}>
        <AppErrorBoundary
          area="health-dashboard"
          resetKey={`${healthSnapshot.date}-${healthDashboardPeriod}`}
          title="Hälsodashboarden kunde inte visas"
        >
          <HealthDashboardV2
            adaptiveCoachFeedback={adaptiveCoachFeedback}
            checkIn={checkIn}
            goalsHabits={goalsHabits}
            healthSnapshot={healthSnapshot}
            meals={meals}
            nutritionGoals={nutritionGoals}
            onPeriodChange={onHealthDashboardPeriodChange}
            period={healthDashboardPeriod}
            profile={profile}
            today={selectedMealDate}
            weights={weights}
          />
        </AppErrorBoundary>
      </Suspense>
    </AppSection>
  )
}

export default HomeSection
