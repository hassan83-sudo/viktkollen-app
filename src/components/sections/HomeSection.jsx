import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import AppSection from '../app/AppSection.jsx'
import OverviewDashboard from '../app/OverviewDashboard.jsx'
import HomeNoticeShortcuts from '../app/HomeNoticeShortcuts.jsx'

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
  navigationIntent,
  nutritionGoals,
  onAddMeal,
  onAvatarLiveContextChange,
  onAvatarSurfaceChange,
  onChatInputChange,
  onEditProfile,
  onLogWeight,
  onNavigateSection,
  onNavigationIntentConsumed,
  onOpenAiCoach,
  onOpenWellbeing,
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
  userId,
  voiceStatus,
  weights,
}) {
  const { t } = useTranslation('home')
  const openNotices = (target) => {
    onNavigateSection?.('notices')

    if (!target) return

    const roomByTarget = {
      alarm: 'bedroom',
      bathroom: 'bathroom',
      timer: 'kitchen',
    }

    const openTarget = () => {
      if (target === 'reminder') {
        const heading = document.getElementById('quick-reminders-heading')
        heading?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
        heading?.focus?.({ preventScroll: true })
        return Boolean(heading)
      }

      const roomId = roomByTarget[target]
      const button = roomId ? document.querySelector(`[data-notice-room="${roomId}"]`) : null
      if (!button) return false
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
      button.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      button.focus?.({ preventScroll: true })
      return true
    }

    window.requestAnimationFrame(() => {
      if (openTarget()) return
      window.setTimeout(openTarget, 120)
    })
  }

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
          navigationIntent={navigationIntent}
          nutritionGoals={nutritionGoals}
          onAddMeal={onAddMeal}
          onAvatarLiveContextChange={onAvatarLiveContextChange}
          onAvatarSurfaceChange={onAvatarSurfaceChange}
          onChatInputChange={onChatInputChange}
          onEditProfile={onEditProfile}
          onLogWeight={onLogWeight}
          onNavigateSection={onNavigateSection}
          onNavigationIntentConsumed={onNavigationIntentConsumed}
          onOpenAiCoach={onOpenAiCoach}
          onOpenWellbeing={onOpenWellbeing}
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
          userId={userId}
          voiceStatus={voiceStatus}
          weeklyWeightChange={dashboardData?.weeklyWeightChange}
          weights={weights}
        />
        <HomeNoticeShortcuts onOpenNotices={openNotices} />
      </AppErrorBoundary>
    </AppSection>
  )
}

export default HomeSection
