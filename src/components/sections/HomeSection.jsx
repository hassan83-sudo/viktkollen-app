import { lazy, Suspense } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import Dashboard from '../Dashboard.jsx'
import AppSection from '../app/AppSection.jsx'
import LazySectionFallback from '../app/LazySectionFallback.jsx'
import OverviewDashboard from '../app/OverviewDashboard.jsx'

const HealthDashboardV2 = lazy(() => import('../HealthDashboardV2.jsx'))

function HomeSection({
  activeSection,
  adaptiveCoachFeedback,
  calorieGoal,
  caloriesToday,
  checkIn,
  currentWeight,
  dashboardActions,
  dashboardData,
  email,
  foods,
  goalsHabits,
  healthDashboardPeriod,
  healthSnapshot,
  meals,
  nutritionGoals,
  onAddMeal,
  onEditProfile,
  onHealthDashboardPeriodChange,
  onLogWeight,
  onScanFood,
  profile,
  progressInsights,
  proteinGoal,
  proteinToday,
  reminderState,
  selectedMealDate,
  syncStatus,
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
        <OverviewDashboard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          calorieGoal={calorieGoal}
          caloriesToday={caloriesToday}
          checkIn={checkIn}
          currentWeight={currentWeight}
          email={email}
          foods={foods}
          goalsHabits={goalsHabits}
          healthScore={dashboardData?.healthScore?.score}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onAddMeal={onAddMeal}
          onEditProfile={onEditProfile}
          onLogWeight={onLogWeight}
          onScanFood={onScanFood}
          profile={profile}
          progressInsights={progressInsights}
          proteinGoal={proteinGoal}
          proteinToday={proteinToday}
          reminderState={reminderState}
          selectedDate={selectedMealDate}
          syncStatus={syncStatus}
          weeklyWeightChange={dashboardData?.weeklyWeightChange}
          weights={weights}
        />
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
