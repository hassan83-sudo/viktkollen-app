import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

function latestPhotoLabel(items = [], t) {
  const latest = items[0]
  if (!latest) return t('summaries.noPhotosYet')
  if (latest.createdAtLabel?.includes('idag') || latest.createdAtLabel?.toLocaleLowerCase?.('sv-SE').includes('idag')) {
    return t('summaries.latestToday')
  }
  return latest.createdAtLabel || t('summaries.latestPhotoSaved')
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
  const { t } = useTranslation(['progress'])
  const [activeFolder, setActiveFolder] = useState(null)
  const weightAnalysis = useMemo(() => analyzeWeights(weights, profile), [profile, weights])
  const latestScan = useMemo(() => {
    const list = Array.isArray(bodyAnalysisHistory) ? bodyAnalysisHistory : []
    return list[0] || getLatestAnalysis()
  }, [bodyAnalysisHistory])
  const summaries = useMemo(() => ({
    weight: {
      primary: formatKg(weightAnalysis.latest?.value, t('summaries.noWeight')),
      secondary: t('summaries.totalChange', {
        change: formatSignedKg(weightAnalysis.changeTotal, t('summaries.noChange')),
      }),
    },
    'body-scan': {
      primary: latestScan ? t('summaries.latestScanExists') : t('summaries.noScanYet'),
      secondary: t('summaries.startNew'),
    },
    photos: {
      primary: t('summaries.photoCount', { count: progressPhotos.length }),
      secondary: latestPhotoLabel(progressPhotoItems, t),
    },
    reports: {
      primary: t('summaries.monthlyReport'),
      secondary: t('summaries.aiInsights'),
    },
    tools: {
      primary: t('summaries.filterExport'),
      secondary: t('summaries.historyTools'),
    },
  }), [latestScan, progressPhotoItems, progressPhotos.length, t, weightAnalysis.changeTotal, weightAnalysis.latest?.value])

  useEffect(() => {
    if (activeSection !== 'progress') return

    const targetId = navigationIntent?.targetId || String(window.location.hash || '').replace(/^#/, '')
    const folder = progressHubTargetFolders[targetId]
    if (!folder) return

    const timer = window.setTimeout(() => {
      setActiveFolder(folder)
    }, 0)

    return () => window.clearTimeout(timer)
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
      label={t('sectionLabel')}
    >
      <ProgressHub
        activeFolder={activeFolder}
        summaries={summaries}
        onBack={() => setActiveFolder(null)}
        onOpen={setActiveFolder}
      >
        <Suspense fallback={<p className="progress-hub-loading">{t('loading')}</p>}>
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
            progressPhotoCountLabel={t('photos.savedCount', { count: progressPhotos.length })}
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
              <summary>{t('reports.monthlySummary')}</summary>
              <MonthlyReport report={monthlyReport} />
            </details>
            <details className="progress-hub-more">
              <summary>{t('reports.showMoreReportCenter')}</summary>
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
              title={t('reports.dashboardError')}
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
