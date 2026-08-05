import { lazy } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import AppSection from '../app/AppSection.jsx'

const MonthlyReport = lazy(() => import('../MonthlyReport.jsx'))
const ProgressDashboard = lazy(() => import('../ProgressDashboard.jsx'))
const ProgressPhotos = lazy(() => import('../ProgressPhotos.jsx'))

function ProgressSection({
  activeSection,
  adaptiveCoachFeedback,
  afterPhoto,
  beforeAfterPhotos,
  beforePhoto,
  checkIn,
  createWeeklyReport,
  foods,
  healthSnapshot,
  meals,
  monthlyReport,
  nutritionGoals,
  onAfterPhotoIdChange,
  onBeforePhotoIdChange,
  onDeleteProgressPhoto,
  onProgressPhotoChange,
  onProgressPhotoNoteChange,
  onUpdateProgressPhoto,
  profile,
  progressPhotoComparison,
  progressPhotoComparisonImages,
  progressPhotoItems,
  progressPhotoNote,
  progressPhotoOptions,
  progressPhotos,
  selectedMealDate,
  weights,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
}) {
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
      />

      <MonthlyReport report={monthlyReport} />

      <AppErrorBoundary
        area="progress-dashboard"
        resetKey={`${selectedMealDate}-${weights.length}-${meals.length}`}
        title="Smart Progress Dashboard kunde inte visas"
      >
        <ProgressDashboard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          checkIn={checkIn}
          checkIns={[]}
          foods={foods}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onCreateWeeklyReport={createWeeklyReport}
          profile={profile}
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
