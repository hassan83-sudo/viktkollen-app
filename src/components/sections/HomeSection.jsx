import AppErrorBoundary from '../AppErrorBoundary.jsx'
import AppSection from '../app/AppSection.jsx'
import OverviewDashboard from '../app/OverviewDashboard.jsx'

function HomeSection({
  activeSection,
  adaptiveCoachFeedback,
  calorieGoal,
  caloriesToday,
  checkIn,
  currentWeight,
  dashboardData,
  email,
  foods,
  goalsHabits,
  healthSnapshot,
  meals,
  nutritionGoals,
  onAddMeal,
  onEditProfile,
  onLogWeight,
  onNavigateSection,
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
          onNavigateSection={onNavigateSection}
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
      </AppErrorBoundary>
    </AppSection>
  )
}

export default HomeSection
