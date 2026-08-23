import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import AppSection from '../app/AppSection.jsx'
import ProgressHub, { progressHubTargetFolders } from '../progress/ProgressHub.jsx'
import { analyzeWeights, formatKg, formatSignedKg } from '../../services/progressService.js'
import { getLatestAnalysis } from '../../services/bodyAnalysisHistory.js'

const BodyAnalysisCard = lazy(() => import('../BodyAnalysisCard.jsx'))
const MonthlyReport = lazy(() => import('../MonthlyReport.jsx'))
const ProgressCenter = lazy(() => import('../ProgressCenter.jsx'))
const ProgressDashboard = lazy(() => import('../ProgressDashboard.jsx'))
const ProgressPhotos = lazy(() => import('../ProgressPhotos.jsx'))
const ReportCenter = lazy(() => import('../ReportCenter.jsx'))

function latestPhotoLabel(items = []) {
  const latest = items[0]
  if (!latest) return 'Inga bilder ännu'
  if (latest.createdAtLabel?.includes('idag') || latest.createdAtLabel?.toLocaleLowerCase?.('sv-SE').includes('idag')) {
    return 'Senast idag'
  }
  return latest.createdAtLabel || 'Senaste bild sparad'
}

function ProgressSection({
  activeSection,
  adaptiveCoachFeedback,
  afterPhoto,
  beforeAfterPhotos,
  beforePhoto,
  bodyAnalysisHistory,
  bodyMeasurements,
  checkIn,
  createWeeklyReport,
  foods,
  goalSettings,
  goalsHabits,
  healthSnapshot,
  meals,
  monthlyReport,
  navigationIntent,
  nutritionGoals,
  onAfterPhotoIdChange,
  onBeforePhotoIdChange,
  onBodyMeasurementsChange,
  onDeleteProgressPhoto,
  onGoalSettingsChange,
  onProgressPhotoChange,
  onProgressPhotoNoteChange,
  onProgressReportsChange,
  onScrollToTarget,
  onUpdateProgressPhoto,
  onWeightsChange,
  profile,
  progressPhotoComparison,
  progressPhotoComparisonImages,
  progressPhotoItems,
  progressPhotoNote,
  progressPhotoOptions,
  progressPhotos,
  progressReports,
  selectedMealDate,
  userId,
  weights,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
}) {
  const [activeFolder, setActiveFolder] = useState(null)
  const weightAnalysis = useMemo(() => analyzeWeights(weights, profile), [profile, weights])
  const latestScan = useMemo(() => {
    const list = Array.isArray(bodyAnalysisHistory) ? bodyAnalysisHistory : []
    return list[0] || getLatestAnalysis()
  }, [bodyAnalysisHistory])
  const summaries = useMemo(() => ({
    weight: {
      primary: formatKg(weightAnalysis.latest?.value, 'Ingen vikt'),
      secondary: `${formatSignedKg(weightAnalysis.changeTotal, 'Ingen förändring')} totalt`,
    },
    'body-scan': {
      primary: latestScan ? 'Senaste scanning finns' : 'Ingen scanning ännu',
      secondary: 'Starta ny',
    },
    photos: {
      primary: `${progressPhotos.length} ${progressPhotos.length === 1 ? 'bild' : 'bilder'}`,
      secondary: latestPhotoLabel(progressPhotoItems),
    },
    reports: {
      primary: 'Månadsrapport',
      secondary: 'AI-insikter',
    },
    tools: {
      primary: 'Filter, export m.m.',
      secondary: 'Historik och övriga verktyg',
    },
  }), [latestScan, progressPhotoItems, progressPhotos.length, weightAnalysis.changeTotal, weightAnalysis.latest?.value])

  useEffect(() => {
    if (activeSection !== 'progress') return

    const targetId = navigationIntent?.targetId || String(window.location.hash || '').replace(/^#/, '')
    const folder = progressHubTargetFolders[targetId]
    if (folder) setActiveFolder(folder)
  }, [activeSection, navigationIntent])

  useEffect(() => {
    if (activeSection !== 'progress' || activeFolder !== 'body-scan') return
    if (navigationIntent?.targetId !== 'body-analysis') return

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
  }, [activeFolder, activeSection, navigationIntent, onScrollToTarget])

  const progressCenter = (
    <ProgressCenter
      bodyAnalysisHistory={bodyAnalysisHistory}
      bodyMeasurements={bodyMeasurements}
      goalSettings={goalSettings}
      onBodyMeasurementsChange={onBodyMeasurementsChange}
      onGoalSettingsChange={onGoalSettingsChange}
      onProgressReportsChange={onProgressReportsChange}
      onWeightsChange={onWeightsChange}
      profile={profile}
      progressPhotos={progressPhotos}
      progressReports={progressReports}
      view={activeFolder === 'weight' ? 'weight' : activeFolder === 'tools' ? 'tools' : activeFolder === 'body-scan' ? 'measurements' : activeFolder === 'reports' ? 'insights' : 'all'}
      weights={weights}
    />
  )

  return (
    <AppSection
      activeSection={activeSection}
      id="progress"
      label="Framsteg och statistik"
    >
      <ProgressHub
        activeFolder={activeFolder}
        summaries={summaries}
        onBack={() => setActiveFolder(null)}
        onOpen={setActiveFolder}
      >
        <Suspense fallback={<p className="progress-hub-loading">Laddar mappen…</p>}>
        {activeFolder === 'weight' && progressCenter}

        {activeFolder === 'body-scan' && (
          <>
            <BodyAnalysisCard
              bodyAnalysisHistoryContext={bodyAnalysisHistory}
              profile={profile}
              userId={userId}
              weights={weights}
            />
            {progressCenter}
          </>
        )}

        {activeFolder === 'photos' && (
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
            showBodyAnalysis={false}
            userId={userId}
            weights={weights}
          />
        )}

        {activeFolder === 'reports' && (
          <>
            {progressCenter}
            <details className="progress-hub-more" open>
              <summary>Månadsrapport</summary>
              <MonthlyReport report={monthlyReport} />
            </details>
            <details className="progress-hub-more">
              <summary>Visa mer om rapportcenter</summary>
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
            </details>
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
          </>
        )}

        {activeFolder === 'tools' && progressCenter}
        </Suspense>
      </ProgressHub>
    </AppSection>
  )
}

export default ProgressSection
