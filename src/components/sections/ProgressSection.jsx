import { lazy } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import { useEffect } from 'react'
import AppSection from '../app/AppSection.jsx'

const MonthlyReport = lazy(() => import('../MonthlyReport.jsx'))
const ProgressDashboard = lazy(() => import('../ProgressDashboard.jsx'))
const ProgressPhotos = lazy(() => import('../ProgressPhotos.jsx'))
const ReportCenter = lazy(() => import('../ReportCenter.jsx'))

function ProgressSection({
  activeSection,
  adaptiveCoachFeedback,
  afterPhoto,
  beforeAfterPhotos,
  beforePhoto,
  bodyAnalysisHistory,
  checkIn,
  createWeeklyReport,
  foods,
  goalsHabits,
  healthSnapshot,
  meals,
  monthlyReport,
  navigationIntent,
  nutritionGoals,
  onAfterPhotoIdChange,
  onBeforePhotoIdChange,
  onDeleteProgressPhoto,
  onProgressPhotoChange,
  onProgressPhotoNoteChange,
  onScrollToTarget,
  onUpdateProgressPhoto,
  profile,
  progressPhotoComparison,
  progressPhotoComparisonImages,
  progressPhotoItems,
  progressPhotoNote,
  progressPhotoOptions,
  progressPhotos,
  selectedMealDate,
  userId,
  weights,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
}) {
  useEffect(() => {
    if (activeSection !== 'progress' || navigationIntent?.targetId !== 'body-analysis') return

    const scrollToBodyAnalysis = () => {
      const target = document.getElementById('body-analysis')
      if (onScrollToTarget) {
        onScrollToTarget(target)
      } else {
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      target?.focus?.({ preventScroll: true })
    }

    const scrollTimers = [120, 420, 820].map((delay) => window.setTimeout(scrollToBodyAnalysis, delay))

    return () => {
      scrollTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [activeSection, navigationIntent, onScrollToTarget])

  return (
    <AppSection
      activeSection={activeSection}
      id="progress"
      label="Framsteg och statistik"
    >
      <ProgressPhotos
        afterPhotoId={afterPhoto ? String(afterPhoto.id) : ''}
        beforeAfterPhotos={beforeAfterPhotos}
        beforePhotoId={beforePhoto ? String(beforePhoto.id) : ''}
        bodyAnalysisHistory={bodyAnalysisHistory}
        hasProgressPhotos={progressPhotos.length > 0}
        onAfterPhotoIdChange={onAfterPhotoIdChange}
        onBeforePhotoIdChange={onBeforePhotoIdChange}
        onDeleteProgressPhoto={onDeleteProgressPhoto}
        onProgressPhotoChange={onProgressPhotoChange}
        onProgressPhotoNoteChange={onProgressPhotoNoteChange}
        onUpdateProgressPhoto={onUpdateProgressPhoto}
        progressPhotoComparison={progressPhotoComparison}
        progressPhotoComparisonImages={progressPhotoComparisonImages}
        progressPhotoCountLabel={`${progressPhotos.length} sparade bilder`}
        progressPhotoItems={progressPhotoItems}
        progressPhotoNote={progressPhotoNote}
        progressPhotoOptions={progressPhotoOptions}
        profile={profile}
        userId={userId}
        weights={weights}
      />

      <MonthlyReport report={monthlyReport} />

      <ReportCenter
        adaptiveCoachFeedback={adaptiveCoachFeedback}
        checkIn={checkIn}
        foods={foods}
        goalsHabits={goalsHabits}
        healthSnapshot={healthSnapshot}
        meals={meals}
        monthlyReport={monthlyReport}
        nutritionGoals={nutritionGoals}
        profile={profile}
        progressPhotoItems={progressPhotoItems}
        progressPhotos={progressPhotos}
        selectedMealDate={selectedMealDate}
        weeklyReportData={weeklyReportData}
        weights={weights}
      />

      <AppErrorBoundary
        area="progress-dashboard"
        resetKey={`${selectedMealDate}-${weights.length}-${meals.length}`}
        title="Din utveckling kunde inte visas"
      >
        <ProgressDashboard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          bodyAnalysisHistory={bodyAnalysisHistory}
          checkIn={checkIn}
          checkIns={[]}
          foods={foods}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onCreateWeeklyReport={createWeeklyReport}
          profile={profile}
          progressPhotoItems={progressPhotoItems}
          today={selectedMealDate}
          weights={weights}
          weeklyReportData={weeklyReportData}
          weeklyReportLines={weeklyReportLines}
          weeklyReportStatus={weeklyReportStatus}
        />
      </AppErrorBoundary>
    </AppSection>
  )
}

export default ProgressSection
