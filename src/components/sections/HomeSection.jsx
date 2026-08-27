import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import AppSection from '../app/AppSection.jsx'
import OverviewDashboard from '../app/OverviewDashboard.jsx'

function HomeSection({
  activeSection,
  adaptiveCoachFeedback,
  calorieGoal,
  caloriesToday,
  chatInput,
  checkIn,
  currentWeight,
  dashboardData,
  email,
  foods,
  goalsHabits,
  healthSnapshot,
  isAiSpeaking,
  isAuthenticated,
  isListening,
  isVoiceConversationActive,
  isVoiceMuted,
  meals,
  nutritionGoals,
  onAddMeal,
  onAvatarLiveContextChange,
  onAvatarSurfaceChange,
  onChatInputChange,
  onEditProfile,
  onLogWeight,
  onNavigateSection,
  onOpenAiCoach,
  onScanFood,
  onSendChatMessage,
  onStartVoiceInput,
  onStopAiVoiceResponse,
  onToggleVoiceMute,
  onVoiceCleanup,
  profile,
  progressInsights,
  proteinGoal,
  proteinToday,
  reminderState,
  selectedMealDate,
  syncStatus,
  voiceStatus,
  weights,
}) {
  const { t } = useTranslation('home')

  return (
    <AppSection
      activeSection={activeSection}
      id="home"
      label={t('sectionLabel')}
    >
      <AppErrorBoundary
        area="dashboard"
        resetKey={healthSnapshot.date}
        title={t('overviewError')}
      >
        <OverviewDashboard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          calorieGoal={calorieGoal}
          caloriesToday={caloriesToday}
          chatInput={chatInput}
          checkIn={checkIn}
          currentWeight={currentWeight}
          email={email}
          foods={foods}
          goalsHabits={goalsHabits}
          healthScore={dashboardData?.healthScore?.score}
          healthSnapshot={healthSnapshot}
          isAiSpeaking={isAiSpeaking}
          isAuthenticated={isAuthenticated}
          isListening={isListening}
          isVoiceConversationActive={isVoiceConversationActive}
          isVoiceMuted={isVoiceMuted}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onAddMeal={onAddMeal}
          onAvatarLiveContextChange={onAvatarLiveContextChange}
          onAvatarSurfaceChange={onAvatarSurfaceChange}
          onChatInputChange={onChatInputChange}
          onEditProfile={onEditProfile}
          onLogWeight={onLogWeight}
          onNavigateSection={onNavigateSection}
          onOpenAiCoach={onOpenAiCoach}
          onScanFood={onScanFood}
          onSendChatMessage={onSendChatMessage}
          onStartVoiceInput={onStartVoiceInput}
          onStopAiVoiceResponse={onStopAiVoiceResponse}
          onToggleVoiceMute={onToggleVoiceMute}
          onVoiceCleanup={onVoiceCleanup}
          profile={profile}
          progressInsights={progressInsights}
          proteinGoal={proteinGoal}
          proteinToday={proteinToday}
          reminderState={reminderState}
          selectedDate={selectedMealDate}
          syncStatus={syncStatus}
          voiceStatus={voiceStatus}
          weeklyWeightChange={dashboardData?.weeklyWeightChange}
          weights={weights}
        />
      </AppErrorBoundary>
    </AppSection>
  )
}

export default HomeSection
