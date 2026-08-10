import { lazy } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import ChatPanel from '../ChatPanel.jsx'
import AppSection from '../app/AppSection.jsx'

const AICoach = lazy(() => import('../AICoach.jsx'))
const AINutritionInsights = lazy(() => import('../AINutritionInsights.jsx'))
const NutritionCoachCenter = lazy(() => import('../NutritionCoachCenter.jsx'))
const PredictionCenter = lazy(() => import('../PredictionCenter.jsx'))
const AdaptiveCoachPanel = lazy(() => import('../AdaptiveCoachPanel.jsx'))
const CoachPlanCenter = lazy(() => import('../CoachPlanCenter.jsx'))
const InsightsCenter = lazy(() => import('../InsightsCenter.jsx'))
const HealthJourneyCenter = lazy(() => import('../HealthJourneyCenter.jsx'))
const GoalsHabitsPanel = lazy(() => import('../GoalsHabitsPanel.jsx'))
const HabitGoalCenter = lazy(() => import('../HabitGoalCenter.jsx'))
const AchievementCenter = lazy(() => import('../AchievementCenter.jsx'))
const SocialCenter = lazy(() => import('../SocialCenter.jsx'))

function CoachSection({
  activeSection,
  adaptiveCoachFeedback,
  aiStarterPrompts,
  canClearChat,
  chatEngineStatus,
  chatInput,
  chatMessages,
  chatThreadRef,
  checkIn,
  coachMessage,
  coachReport,
  coachReports,
  coachStatus,
  goalsHabits,
  healthSnapshot,
  isGeneratingCoachReport,
  isListening,
  isVoiceConversationActive,
  meals,
  messagesEndRef,
  nutritionGoals,
  onAdaptiveCoachFeedbackChange,
  onChatInputChange,
  onClearChat,
  onClearCoachReports,
  onCoachQuestion,
  onCreateCoachReport,
  onDeleteCoachReport,
  onGoalsHabitsChange,
  onReminderStateChange,
  onSendChatMessage,
  onStartVoiceInput,
  onStarterPrompt,
  profile,
  reminderState,
  selectedMealDate,
  voiceStatus,
  weights,
}) {
  return (
    <AppSection
      activeSection={activeSection}
      id="coach"
      label="Coach och insikter"
    >
      <AppErrorBoundary
        area="ai"
        resetKey={chatMessages.length}
        title="AI-coachen kunde inte visas"
      >
        <ChatPanel
          canClearChat={canClearChat}
          chatEngineStatus={chatEngineStatus}
          chatInput={chatInput}
          chatMessages={chatMessages}
          chatThreadRef={chatThreadRef}
          isListening={isListening}
          isVoiceConversationActive={isVoiceConversationActive}
          messagesEndRef={messagesEndRef}
          onChatInputChange={onChatInputChange}
          onClearChat={onClearChat}
          onSendChatMessage={onSendChatMessage}
          onStartVoiceInput={onStartVoiceInput}
          onStarterPrompt={onStarterPrompt}
          starterPrompts={aiStarterPrompts}
          voiceStatus={voiceStatus}
        />

        <AICoach
          coachMessage={coachMessage}
          coachReport={coachReport}
          coachReports={coachReports}
          coachStatus={coachStatus}
          isGeneratingReport={isGeneratingCoachReport}
          onClearCoachReports={onClearCoachReports}
          onCreateCoachReport={onCreateCoachReport}
          onDeleteCoachReport={onDeleteCoachReport}
        />

        <AINutritionInsights
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onCoachQuestion={onCoachQuestion}
          profile={profile}
          weights={weights}
        />

        <NutritionCoachCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />

        <PredictionCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          today={selectedMealDate}
          weights={weights}
        />

        <AdaptiveCoachPanel
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onAdaptiveCoachFeedbackChange={onAdaptiveCoachFeedbackChange}
          onGoalsHabitsChange={onGoalsHabitsChange}
          onReminderStateChange={onReminderStateChange}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />

        <CoachPlanCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onAdaptiveCoachFeedbackChange={onAdaptiveCoachFeedbackChange}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />

        <InsightsCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          today={selectedMealDate}
          weights={weights}
        />

        <HealthJourneyCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          today={selectedMealDate}
          weights={weights}
        />

        <GoalsHabitsPanel
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onGoalsHabitsChange={onGoalsHabitsChange}
          profile={profile}
          weights={weights}
        />

        <HabitGoalCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          today={selectedMealDate}
          weights={weights}
        />

        <AchievementCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onGoalsHabitsChange={onGoalsHabitsChange}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />

        <SocialCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedMealDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />
      </AppErrorBoundary>
    </AppSection>
  )
}

export default CoachSection
