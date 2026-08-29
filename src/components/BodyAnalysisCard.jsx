import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate } from '../i18n/format.js'
import { getAnalysisComparison } from '../services/bodyAnalysisComparison'
import {
  canCompleteBodyAnalysisScan,
  getAngleMatchedComparison,
  revokeBodyScanPreview,
} from '../services/bodyAnalysisGuidedScan'
import {
  addAnalysis,
  clearAnalysisHistory,
  deleteAnalysis,
  exportHistory,
  getAnalysisHistory,
  getHistoryStats,
  getLatestAnalysis,
  importHistory,
} from '../services/bodyAnalysisHistory'
import { buildBodyAnalysisContext } from '../services/bodyAnalysisEstimates'
import { analyzeBodyWithAI } from '../services/bodyAnalysisService'
import { getBodyAnalysisProgressStats } from '../services/bodyAnalysisStats'
import { safeLogger } from '../services/safeLogger'
import {
  createDefaultEntitlementSnapshot,
  entitlementFeatures,
  fetchVerifiedEntitlementSnapshot,
  freeFeatureLimits,
  getFeatureAccess,
} from '../services/entitlements'
import { getCurrentAiAuthorization } from '../services/ai/aiAuthTransport'
import {
  incrementPremiumAnalyticsCounter,
  premiumAnalyticsCounters,
} from '../services/premiumAnalytics'
import BodyAnalysisDevChecklist from './BodyAnalysisDevChecklist'
import BodyAnalysisOnboarding from './BodyAnalysisOnboarding'
import BodyAnalysisPrivacy from './BodyAnalysisPrivacy'
import BodyAnalysisPremiumPreview from './BodyAnalysisPremiumPreview'
import BodyAnalysisQuality from './BodyAnalysisQuality'
import BodyAnalysisResult from './BodyAnalysisResult'
import BodyAnalysisStats from './BodyAnalysisStats'
import BodyAnalysisTimeline from './BodyAnalysisTimeline'
import BodyAnalysisUnlockCard from './BodyAnalysisUnlockCard'
import BodyScanGuidedCapture from './BodyScanGuidedCapture'

const bodyOverviewMarkerDefs = [
  { id: 'shoulders', x: 50, y: 25 },
  { id: 'arms', x: 25, y: 42 },
  { id: 'waist', x: 50, y: 47 },
  { id: 'hips', x: 50, y: 61 },
  { id: 'legs', x: 56, y: 80 },
]

const resultModelFieldKeys = [
  'status',
  'source',
  'generatedAt',
  'summary',
  'bodyComposition',
  'posture',
  'strengths',
  'improvementAreas',
  'recommendations',
  'nextSteps',
  'comparison',
  'progressSummary',
  'visualConsistency',
  'routineFeedback',
  'monthlyFocus',
  'confidenceLevel',
  'limitations',
  'sourceReason',
  'confidence',
  'safetyNote',
]

function formatAnalysisDate(date) {
  return formatDate(date, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatShortDate(date) {
  return formatDate(date, {
    day: 'numeric',
    month: 'short',
  })
}

function getDaysSince(date) {
  const createdAt = new Date(date).getTime()

  if (Number.isNaN(createdAt)) {
    return null
  }

  return Math.max(
    0,
    Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)),
  )
}

function getNextAnalysisDate(date) {
  const createdAt = new Date(date).getTime()

  if (Number.isNaN(createdAt)) {
    return null
  }

  return new Date(createdAt + 7 * 24 * 60 * 60 * 1000)
}

function isAnalysisWithinDays(analysis, days) {
  const createdAt = new Date(analysis.createdAt).getTime()

  if (Number.isNaN(createdAt)) {
    return false
  }

  return createdAt >= Date.now() - days * 24 * 60 * 60 * 1000
}

function getTimelineSummary(result, t) {
  return result.summary || result.comparison?.unchanged || t('card.timelineSummaryFallback')
}

function formatResultValue(key, value) {
  if (key === 'generatedAt') {
    return formatAnalysisDate(value)
  }

  return value
}

function renderResultValue(key, value) {
  if (Array.isArray(value)) {
    return (
      <ul>
        {value.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }

  if (value && typeof value === 'object') {
    return (
      <ul>
        {Object.entries(value).map(([itemKey, itemValue]) => (
          <li key={itemKey}>{itemValue}</li>
        ))}
      </ul>
    )
  }

  return <p>{formatResultValue(key, value)}</p>
}

function getResultSections(result, t) {
  return resultModelFieldKeys
    .map((key) => ({
      key,
      label: t(`card.fields.${key}`),
      value: result[key],
    }))
    .filter(({ value }) => {
      if (Array.isArray(value)) {
        return value.length > 0
      }

      return value !== undefined && value !== null && value !== ''
    })
}

/**
 * One consistent provenance label per result, so an AI estimate is never
 * presented as a measurement and demo data is never presented as a result.
 */
function getResultSourceLabel(result, t) {
  const source = result?.source || ''
  if (result?.status === 'failed' || source === 'error') return t('card.sourceLabel.failed')
  if (source === 'ai') return t('card.sourceLabel.ai')
  if (source === 'local') return t('card.sourceLabel.local')
  if (source === 'measured') return t('card.sourceLabel.measured')
  return t('card.sourceLabel.mock')
}

function getLatestAiStatus(analysis, t) {
  if (!analysis?.result) {
    return {
      label: t('card.aiStatus.none'),
      reason: 'ingen_historik',
    }
  }

  return {
    label:
      analysis.result.source === 'ai'
        ? t('card.aiStatus.aiOk')
        : t('card.aiStatus.mockUsed'),
    reason: analysis.result.sourceReason || 'api_error',
  }
}

function getNextAnalysisRecommendation(daysSinceLatestAnalysis, t) {
  if (daysSinceLatestAnalysis === null) {
    return t('card.nextRec.first')
  }

  if (daysSinceLatestAnalysis < 7) {
    return t('card.nextRec.wait')
  }

  return t('card.nextRec.due')
}

function getLatestInsights(analysis, t) {
  if (!analysis?.result) {
    return [
      t('card.emptyInsights.create'),
      t('card.emptyInsights.twoPhotos'),
      t('card.emptyInsights.consistent'),
    ]
  }

  return [
    analysis.result.strengths?.[0],
    analysis.result.improvementAreas?.[0],
    analysis.result.nextSteps?.[0],
  ]
    .filter(Boolean)
    .slice(0, 3)
}

function createDemoBodyAnalysisResult(previousAnalysis, context = null, t) {
  return {
    bodyComposition: t('card.demo.bodyComposition'),
    comparison: previousAnalysis
      ? {
          better: t('card.demo.comparisonBetter'),
          nextFocus: t('card.demo.comparisonNextFocus'),
          unchanged: t('card.demo.comparisonUnchanged'),
        }
      : {
          better: t('card.demo.firstBetter'),
          nextFocus: t('card.demo.firstNextFocus'),
          unchanged: t('card.demo.firstUnchanged'),
        },
    confidence: t('card.demo.confidenceMedium'),
    confidenceLevel: t('card.demo.confidenceMedium'),
    dataQuality: 'low',
    estimatedMeasurements: {
      chestCm: null,
      hipCm: null,
      shoulderWidthCm: null,
      waistCm: null,
    },
    estimatedWeight: null,
    generatedAt: new Date().toISOString(),
    improvementAreas: [t('card.demo.improvement')],
    limitations: [t('card.demo.limitation')],
    monthlyFocus: t('card.demo.monthlyFocus'),
    nextSteps: [t('card.demo.nextStep')],
    posture: t('card.demo.posture'),
    progressSummary: t('card.demo.progressSummary'),
    recommendations: [
      t('card.goals.nextPhoto'),
      t('card.goals.sameAngle'),
      t('card.goals.logWeight'),
      t('card.goals.keepHabits'),
    ],
    routineFeedback: t('card.demo.routineFeedback'),
    safetyNote: t('card.demo.safetyNote'),
    measuredWeight: context?.latestMeasuredWeight || null,
    scanInput: {
      angles: ['front', 'side', 'back'],
      imageCount: 3,
      requiredAngles: ['front', 'side', 'back'],
    },
    schemaVersion: 2,
    source: 'mock',
    sourceReason: 'demo',
    status: 'completed',
    strengths: [t('card.demo.strength')],
    summary: t('card.demo.summary'),
    visualConsistency: t('card.demo.visualConsistency'),
  }
}

function BodyAnalysisCard({
  bodyAnalysisHistoryContext = [],
  hideChrome = false,
  onAnalysisHistoryChange = () => {},
  onClose,
  profile = {},
  userId = 'local-user',
  weights = [],
}) {
  const { t } = useTranslation(['bodyScan', 'common'])
  const timelineFilters = useMemo(
    () => [
      { label: t('card.timelineFilters.all'), value: 'all' },
      { label: t('card.timelineFilters.days30'), value: '30' },
      { label: t('card.timelineFilters.days90'), value: '90' },
    ],
    [t],
  )
  const bodyOverviewMarkers = useMemo(
    () =>
      bodyOverviewMarkerDefs.map(({ id, x, y }) => ({
        id,
        label: t(`card.markers.${id}.label`),
        text: t(`card.markers.${id}.text`),
        x,
        y,
      })),
    [t],
  )
  const [activeBodyMarkerId, setActiveBodyMarkerId] = useState(
    () => bodyOverviewMarkerDefs[0].id,
  )
  const [analysisHistory, setAnalysisHistory] = useState(() =>
    getAnalysisHistory(),
  )
  const [analysisError, setAnalysisError] = useState('')
  const [analysisStatus, setAnalysisStatus] = useState(() =>
    t('card.status.waitingPhotos'),
  )
  const [expandedAnalysisIds, setExpandedAnalysisIds] = useState([])
  const [backPhoto, setBackPhoto] = useState(null)
  const [frontPhoto, setFrontPhoto] = useState(null)
  const [hasApprovedAnalysis, setHasApprovedAnalysis] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isPremiumPreviewEnabled, setIsPremiumPreviewEnabled] = useState(false)
  const [pendingDeleteAnalysisId, setPendingDeleteAnalysisId] = useState('')
  const [savedAnalysis, setSavedAnalysis] = useState(() => getLatestAnalysis())
  const [showAnalysisConsent, setShowAnalysisConsent] = useState(false)
  // Photo mode stays the default so the stabilized iPhone flow is unchanged.
  const [scanMode, setScanMode] = useState('photo')
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false)
  const [sidePhoto, setSidePhoto] = useState(null)
  const [timelineFilter, setTimelineFilter] = useState('all')
  const analysisCount = analysisHistory.length
  const [entitlementSnapshot, setEntitlementSnapshot] = useState(() =>
    createDefaultEntitlementSnapshot({ userId }))

  useEffect(() => {
    let active = true

    fetchVerifiedEntitlementSnapshot({
      getAuthorization: getCurrentAiAuthorization,
      userId,
    }).then((result) => {
      if (active) {
        setEntitlementSnapshot(result.entitlement)
      }
    })

    return () => {
      active = false
    }
  }, [userId])

  const bodyAnalysisAccess = getFeatureAccess(entitlementSnapshot, entitlementFeatures.bodyAnalysis, {
    devPreviewEnabled: isPremiumPreviewEnabled,
    usage: { bodyAnalysisScans: analysisCount },
  })
  const isFreeLimitReached = !bodyAnalysisAccess.allowed
  const scanPhotos = {
    back: backPhoto,
    front: frontPhoto,
    side: sidePhoto,
  }
  const analysisContext = buildBodyAnalysisContext({
    bodyAnalysisHistory: bodyAnalysisHistoryContext.length ? bodyAnalysisHistoryContext : analysisHistory,
    profile,
    weights,
  })
  const canAnalyze =
    canCompleteBodyAnalysisScan(scanPhotos) && !isAnalyzing && !isFreeLimitReached
  const analyzeDisabledReason = isFreeLimitReached
    ? t('card.freeLimitReason')
    : ''
  const latestAnalysisDate = analysisHistory[0]?.createdAt
  const historyStats = getHistoryStats(analysisHistory)
  const daysSinceLatestAnalysis = latestAnalysisDate
    ? getDaysSince(latestAnalysisDate)
    : null
  const nextAnalysisDate = latestAnalysisDate
    ? getNextAnalysisDate(latestAnalysisDate)
    : null
  const currentAnalysisStatus = isAnalyzing
    ? analysisStatus
    : analysisError
      ? t('card.status.failed')
      : isFreeLimitReached
        ? t('card.status.freeLimit')
      : analysisStatus === t('card.status.resultReady')
        ? t('card.status.resultReady')
        : canAnalyze
          ? t('card.status.ready')
          : t('card.status.waitingAngles')
  const summaryText = latestAnalysisDate
    ? t('card.summaryWithDate', { date: formatAnalysisDate(latestAnalysisDate) })
    : t('card.summaryEmpty')
  const nextRecommendedSteps =
    analysisCount === 0
      ? [
          t('card.nextSteps.first1'),
          t('card.nextSteps.first2'),
          t('card.nextSteps.first3'),
        ]
      : analysisCount === 1
        ? [
            t('card.nextSteps.second1'),
            t('card.nextSteps.second2'),
            t('card.nextSteps.second3'),
          ]
        : [
            t('card.nextSteps.ongoing1'),
            t('card.nextSteps.ongoing2'),
            t('card.nextSteps.ongoing3'),
          ]
  const weeklyFocus =
    savedAnalysis?.result?.monthlyFocus || t('card.weeklyFocusFallback')
  const nextAnalysisRecommendation =
    getNextAnalysisRecommendation(daysSinceLatestAnalysis, t)
  const analysisQualityItems = [
    {
      label: t('card.quality.frontLabel'),
      status: frontPhoto ? 'positive' : 'neutral',
      value: frontPhoto ? t('card.quality.done') : t('card.quality.waiting'),
    },
    {
      label: t('card.quality.sideLabel'),
      status: sidePhoto ? 'positive' : 'neutral',
      value: sidePhoto ? t('card.quality.done') : t('card.quality.waiting'),
    },
    {
      label: t('card.quality.backLabel'),
      status: backPhoto ? 'positive' : 'neutral',
      value: backPhoto ? t('card.quality.done') : t('card.quality.waiting'),
    },
    {
      label: t('card.quality.sameLightLabel'),
      status: 'warning',
      value: t('card.quality.sameLightValue'),
    },
    {
      label: t('card.quality.sameDistanceLabel'),
      status: 'warning',
      value: t('card.quality.sameDistanceValue'),
    },
    {
      label: t('card.quality.similarClothesLabel'),
      status: 'warning',
      value: t('card.quality.similarClothesValue'),
    },
  ]
  const progressIndicators = [
    {
      label: t('card.progress.weightTrend'),
      status: 'neutral',
      value: t('card.progress.weightTrendValue'),
    },
    {
      label: t('card.progress.frequency'),
      status:
        analysisCount === 0
          ? 'neutral'
          : analysisCount === 1 || daysSinceLatestAnalysis > 14
            ? 'warning'
            : 'positive',
      value:
        analysisCount === 0
          ? t('card.progress.noDataYet')
          : analysisCount === 1
            ? t('card.progress.needsAnother')
            : t('card.progress.goodRhythm'),
    },
    {
      label: t('card.progress.photoConsistency'),
      status: analysisCount >= 2 ? 'positive' : 'warning',
      value:
        analysisCount >= 2
          ? t('card.progress.trackedOverTime')
          : t('card.progress.buildRoutine'),
    },
    {
      label: t('card.progress.nextRecommended'),
      status:
        daysSinceLatestAnalysis === null
          ? 'neutral'
          : daysSinceLatestAnalysis > 7
            ? 'warning'
            : 'positive',
      value: nextAnalysisDate
        ? formatShortDate(nextAnalysisDate)
        : t('card.progress.afterFirst'),
    },
  ]
  const progressStats = [
    { label: t('card.progress.totalAnalyses'), value: historyStats.total || '-' },
    {
      label: t('card.progress.latestDate'),
      value: historyStats.latestDate
        ? formatShortDate(historyStats.latestDate)
        : t('card.progress.noAnalysis'),
    },
    {
      label: t('card.progress.daysSinceLatest'),
      value:
        historyStats.daysSinceLatest !== null
          ? t('card.progress.daysCount', { count: historyStats.daysSinceLatest })
          : t('card.progress.noAnalysisYet'),
    },
    { label: t('card.progress.aiResults'), value: historyStats.ai },
    { label: t('card.progress.mockResults'), value: historyStats.mock },
    {
      label: t('card.progress.averageInterval'),
      value:
        historyStats.averageIntervalDays !== null
          ? t('card.progress.daysCount', { count: historyStats.averageIntervalDays })
          : '-',
    },
    {
      label: t('card.progress.nextAnalysis'),
      value: nextAnalysisDate
        ? formatShortDate(nextAnalysisDate)
        : t('card.progress.createFirst'),
    },
  ]
  const visibleAnalysisHistory =
    timelineFilter === 'all'
      ? analysisHistory.slice(0, 10)
      : analysisHistory
          .filter((analysis) =>
            isAnalysisWithinDays(analysis, Number(timelineFilter)),
          )
          .slice(0, 10)
  const selectedComparison = getAnalysisComparison(savedAnalysis, analysisHistory)
  const angleComparison = getAngleMatchedComparison(savedAnalysis, analysisHistory)
  const progressOverviewStats = getBodyAnalysisProgressStats(analysisHistory)
  const progressGraphItems = analysisHistory.slice(0, 5).map((analysis) => ({
    analysisNumber: analysis.analysisNumber,
    date: formatShortDate(analysis.createdAt),
    id: analysis.createdAt,
    status: analysis.result?.source === 'ai' ? 'positive' : 'warning',
  }))
  const latestAiStatus = getLatestAiStatus(savedAnalysis, t)
  const resolvedActiveBodyMarker =
    bodyOverviewMarkers.find((marker) => marker.id === activeBodyMarkerId) ||
    bodyOverviewMarkers[0]

  function handlePhotoChange(fileOrEvent, view, previewOverride = '') {
    const file = fileOrEvent === null || fileOrEvent === undefined
      ? null
      : fileOrEvent?.target?.files?.[0] || fileOrEvent

    function applyPhoto(photo) {
      const currentPhoto = view === 'front' ? frontPhoto : view === 'back' ? backPhoto : sidePhoto
      if (currentPhoto && currentPhoto !== photo) {
        revokeBodyScanPreview(currentPhoto)
      }

      if (view === 'front') {
        setFrontPhoto(photo)
      } else if (view === 'back') {
        setBackPhoto(photo)
      } else {
        setSidePhoto(photo)
      }

      const nextPhotos = {
        ...scanPhotos,
        [view]: photo,
      }
      setAnalysisStatus(
        canCompleteBodyAnalysisScan(nextPhotos)
          ? t('card.status.ready')
          : t('card.status.waitingAngles'),
      )
    }

    if (!file) {
      applyPhoto(null)
      return
    }

    if (previewOverride) {
      applyPhoto({
        file,
        name: file.name,
        preview: previewOverride,
      })
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      applyPhoto({
        file,
        name: file.name,
        preview: typeof reader.result === 'string' ? reader.result : '',
      })
    })
    reader.addEventListener('error', () => {
      setAnalysisError(t('card.errors.imageReadFailed'))
      setAnalysisStatus(t('card.status.waitingPhotos'))
    })
    reader.addEventListener('abort', () => {
      setAnalysisError(t('card.errors.imageReadAborted'))
      setAnalysisStatus(t('card.status.waitingPhotos'))
    })
    reader.readAsDataURL(file)
  }

  function storeCompletedAnalysis(result, photos = {}) {
    const nextAnalysis = {
      analysisNumber: analysisHistory.length + 1,
      backPhoto: photos.backPhoto || { name: t('card.demoPhotos.back'), preview: '' },
      createdAt: new Date().toISOString(),
      frontPhoto: photos.frontPhoto || { name: t('card.demoPhotos.front'), preview: '' },
      result,
      scanInput: result.scanInput || {
        angles: ['front', 'side', 'back'],
        imageCount: 3,
        requiredAngles: ['front', 'side', 'back'],
      },
      schemaVersion: result.schemaVersion || 2,
      sidePhoto: photos.sidePhoto || { name: t('card.demoPhotos.side'), preview: '' },
      status: 'Analys klar',
      syncStatus: 'local',
      updatedAt: new Date().toISOString(),
      userId: null,
    }
    const nextHistory = addAnalysis(nextAnalysis)

    setSavedAnalysis(nextAnalysis)
    setAnalysisHistory(nextHistory)
    setImportSummary(null)
    onAnalysisHistoryChange(true)
    setAnalysisStatus(t('card.status.resultReady'))
    incrementPremiumAnalyticsCounter(premiumAnalyticsCounters.bodyScans, { userId })
  }

  async function runBodyAnalysis() {
    if (isFreeLimitReached) {
      setAnalysisError(t('card.errors.freeLimitKeep'))
      return
    }

    if (!frontPhoto || !sidePhoto || !backPhoto) {
      setAnalysisError(
        !frontPhoto
          ? t('card.errors.missingFront')
          : !sidePhoto
            ? t('card.errors.missingSide')
            : t('card.errors.missingBack'),
      )
      return
    }
    if (isAnalyzing) {
      return
    }

    setIsAnalyzing(true)
    setAnalysisError('')
    setAnalysisStatus(t('card.status.analyzing'))

    setAnalysisStatus(t('card.status.preparing'))

    const statusTimers = [
      window.setTimeout(() => setAnalysisStatus(t('card.status.sending')), 350),
      window.setTimeout(() => setAnalysisStatus(t('card.status.aiAnalyzing')), 900),
    ]

    try {
      const storedFrontPhoto = {
        name: frontPhoto.name,
        preview: frontPhoto.preview,
      }
      const storedSidePhoto = {
        name: sidePhoto.name,
        preview: sidePhoto.preview,
      }
      const storedBackPhoto = {
        name: backPhoto.name,
        preview: backPhoto.preview,
      }
      const result = await analyzeBodyWithAI({
        backPhoto,
        context: analysisContext,
        frontPhoto,
        previousAnalysis: getLatestAnalysis()?.result,
        sidePhoto,
      })

      storeCompletedAnalysis(result, {
        backPhoto: storedBackPhoto,
        frontPhoto: storedFrontPhoto,
        sidePhoto: storedSidePhoto,
      })
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message || t('card.status.couldNotComplete')
          : t('card.status.couldNotComplete'),
      )
      setAnalysisStatus(t('card.status.couldNotComplete'))
    } finally {
      statusTimers.forEach((timer) => window.clearTimeout(timer))
      setIsAnalyzing(false)
    }
  }

  function handleAnalyzeBody() {
    setAnalysisStatus(t('card.status.analyzing'))
    setAnalysisError('')

    if (isFreeLimitReached) {
      setAnalysisError(t('card.errors.freeLimitDelete'))
      return
    }

    if (!frontPhoto) {
      setAnalysisError(t('card.errors.missingFront'))
      return
    }
    if (!sidePhoto) {
      setAnalysisError(t('card.errors.missingSide'))
      return
    }
    if (!backPhoto) {
      setAnalysisError(t('card.errors.missingBack'))
      return
    }
    if (isAnalyzing) {
      setAnalysisStatus(t('card.status.analyzing'))
      return
    }
    if (!frontPhoto.file || !sidePhoto.file || !backPhoto.file) {
      setAnalysisError(t('card.errors.couldNotStart'))
      safeLogger.info('body-scan-analyze', { guard: 'missing-file' })
      return
    }

    if (!hasApprovedAnalysis) {
      setShowAnalysisConsent(true)
      setAnalysisError(t('card.errors.approveFirst'))
      safeLogger.info('body-scan-analyze', { guard: 'consent' })
      return
    }

    safeLogger.info('body-scan-analyze', { guard: 'none' })
    runBodyAnalysis()
  }

  function handleApproveAnalysis() {
    setHasApprovedAnalysis(true)
    setShowAnalysisConsent(false)
    runBodyAnalysis()
  }

  function handleCreateDemoAnalysis() {
    if (isFreeLimitReached) {
      setAnalysisError(t('card.errors.freeLimitDev'))
      return
    }

    setAnalysisError('')
    storeCompletedAnalysis(
      createDemoBodyAnalysisResult(getLatestAnalysis()?.result, analysisContext, t),
    )
  }

  function handleExportHistory() {
    try {
      const exportPayload = exportHistory()
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = `viktkollen-ai-kroppsanalys-${new Date()
        .toISOString()
        .slice(0, 10)}.json`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setAnalysisError(t('card.errors.exportFailed'))
    }
  }

  function handleDeleteAnalysis(createdAt) {
    const nextHistory = deleteAnalysis(createdAt)

    setAnalysisHistory(nextHistory)
    setPendingDeleteAnalysisId('')
    setExpandedAnalysisIds((currentIds) =>
      currentIds.filter((id) => id !== createdAt),
    )

    if (savedAnalysis?.createdAt === createdAt) {
      setSavedAnalysis(nextHistory[0] ?? null)
    }

    onAnalysisHistoryChange(nextHistory.length > 0)
  }

  function handleImportHistory(event) {
    const file = event.target.files?.[0]

    if (!file) {
      setAnalysisError(t('card.errors.noImportFile'))
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      try {
        const importResult = importHistory(JSON.parse(String(reader.result)))

        setAnalysisHistory(importResult.history)
        setSavedAnalysis(importResult.history[0] ?? null)
        setImportSummary(importResult.summary)
        onAnalysisHistoryChange(importResult.history.length > 0)
      } catch {
        setAnalysisError(t('card.errors.importFailed'))
      } finally {
        event.target.value = ''
      }
    })
    reader.addEventListener('error', () => {
      setAnalysisError(t('card.errors.importReadFailed'))
      event.target.value = ''
    })
    reader.addEventListener('abort', () => {
      setAnalysisError(t('card.errors.importAborted'))
      event.target.value = ''
    })
    reader.readAsText(file)
  }

  function handleClearHistory() {
    setAnalysisHistory(clearAnalysisHistory())
    setExpandedAnalysisIds([])
    setImportSummary(null)
    setPendingDeleteAnalysisId('')
    setSavedAnalysis(null)
    setShowClearHistoryConfirm(false)
    onAnalysisHistoryChange(false)
  }

  function toggleExpandedAnalysis(createdAt) {
    setExpandedAnalysisIds((currentIds) =>
      currentIds.includes(createdAt)
        ? currentIds.filter((id) => id !== createdAt)
        : [...currentIds, createdAt],
    )
  }

  return (
    <div className="progress-upload" id="body-analysis">
      {!hideChrome && (
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('card.heading.eyebrow')}</p>
            <h3>{t('card.heading.title')}</h3>
          </div>
        </div>
      )}
      {!hideChrome && <p className="progress-photo-safety">{t('card.heading.intro')}</p>}
      <div className="body-scan-hub">
        {!hideChrome && <h3 className="body-scan-hub-title">{t('card.heading.hubTitle')}</h3>}
        {!hideChrome && (
          <div className="body-scan-mode-switch" role="group" aria-label={t('card.heading.modeLabel')}>
            <button
              aria-pressed={scanMode === 'photo'}
              className={scanMode === 'photo' ? '' : 'secondary-button'}
              type="button"
              onClick={() => setScanMode('photo')}
            >
              {t('card.heading.modePhoto')}
            </button>
            <button
              aria-pressed={scanMode === 'video'}
              className={scanMode === 'video' ? '' : 'secondary-button'}
              type="button"
              onClick={() => setScanMode('video')}
            >
              {t('card.heading.modeVideo')}
            </button>
          </div>
        )}
        {!hideChrome && (
          <p className="progress-photo-safety">
            {scanMode === 'video' ? t('card.heading.modeVideoHint') : t('card.heading.modePhotoHint')}
          </p>
        )}
        {scanMode === 'photo' || hideChrome ? (
          <BodyScanGuidedCapture
            canAnalyze={canAnalyze}
            currentAnalysisStatus={currentAnalysisStatus}
            disabledReason={analyzeDisabledReason}
            photos={scanPhotos}
            onAnalyze={handleAnalyzeBody}
            onClose={onClose}
            onPhotoChange={handlePhotoChange}
          />
        ) : (
          // Guided video scanning is not reliable enough to ship as a working
          // mode yet. Selecting it must never start the camera or fabricate a
          // result - show an honest placeholder instead of BodyAnalysisVideoScanner.
          <div className="body-scan-coming-soon" role="status">
            <p className="eyebrow">{t('card.heading.modeVideo')}</p>
            <h3>{t('card.heading.modeVideoComingSoonTitle')}</h3>
            <p>{t('card.heading.modeVideoComingSoonBody')}</p>
            <button className="secondary-button" type="button" onClick={() => setScanMode('photo')}>
              {t('card.heading.modeVideoBackToPhoto')}
            </button>
          </div>
        )}
        {!hideChrome && (
          <details className="body-scan-section">
            <summary>{t('card.heading.privacySummary')}</summary>
            <ul className="body-scan-privacy-list">
              <li>{t('card.privacy.localCamera')}</li>
              <li>{t('card.privacy.sendImages')}</li>
              <li>{t('card.privacy.openai')}</li>
              <li>{t('card.privacy.localHistory')}</li>
              <li>{t('card.privacy.exportDelete')}</li>
            </ul>
          </details>
        )}
      </div>
      {!hideChrome && (
      <>
      <details className="body-analysis-more-info">
        <summary>{t('card.heading.moreInfo')}</summary>
        <BodyAnalysisOnboarding />
        {import.meta.env.DEV && (
          <BodyAnalysisPremiumPreview
            analysisCount={analysisCount}
            isPremiumPreviewEnabled={isPremiumPreviewEnabled}
            localLimit={freeFeatureLimits[entitlementFeatures.bodyAnalysis]}
            onTogglePremiumPreview={() => {
              setAnalysisError('')
              setIsPremiumPreviewEnabled((currentValue) => !currentValue)
            }}
          />
        )}
        <BodyAnalysisQuality items={analysisQualityItems} />
      </details>
      <BodyAnalysisUnlockCard
        isLimitReached={isFreeLimitReached}
        isPremiumPreviewEnabled={isPremiumPreviewEnabled}
      />
      {import.meta.env.DEV && (
        <details className="body-analysis-more-info">
          <summary>{t('card.heading.devTools')}</summary>
          <button
            className="secondary-button"
            type="button"
            aria-label={t('card.heading.createDemoAria')}
            onClick={handleCreateDemoAnalysis}
          >
            {t('card.heading.createDemo')}
          </button>
          <BodyAnalysisDevChecklist />
        </details>
      )}
      </>)}
      <BodyAnalysisPrivacy
        showConsent={showAnalysisConsent}
        onApprove={handleApproveAnalysis}
        onCancel={() => setShowAnalysisConsent(false)}
      />
      {analysisError && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">{t('card.heading.resultEyebrow')}</p>
              <h3>{t('card.heading.resultFailedTitle')}</h3>
            </div>
            <span>{t('card.heading.errorBadge')}</span>
          </div>
          <p>{analysisError}</p>
          <button type="button" onClick={handleAnalyzeBody}>
            {t('card.heading.retry')}
          </button>
        </div>
      )}
      {!hideChrome && (
      <>
      {!analysisError && savedAnalysis && (
        <BodyAnalysisResult
          activeBodyMarker={resolvedActiveBodyMarker}
          bodyOverviewMarkers={bodyOverviewMarkers}
          formatAnalysisDate={formatAnalysisDate}
          getResultSections={(result) => getResultSections(result, t)}
          getResultSourceLabel={(result) => getResultSourceLabel(result, t)}
          renderResultValue={renderResultValue}
          savedAnalysis={savedAnalysis}
          angleComparison={angleComparison}
          onMarkerChange={(marker) =>
            setActiveBodyMarkerId(marker?.id || bodyOverviewMarkerDefs[0].id)
          }
        />
      )}
      {savedAnalysis && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">{t('card.heading.compareEyebrow')}</p>
              <h3>{t('card.heading.compareTitle')}</h3>
            </div>
            <span>
              {analysisHistory.length > 1
                ? t('card.heading.compareActive')
                : t('card.heading.compareFirst')}
            </span>
          </div>
          {analysisHistory.length > 1 ? (
            <ul>
              <li>{selectedComparison.better}</li>
              <li>{selectedComparison.unchanged}</li>
              <li>{selectedComparison.nextFocus}</li>
            </ul>
          ) : (
            <p>{t('card.heading.firstAnalysis')}</p>
          )}
        </div>
      )}
      {savedAnalysis && (
        <BodyAnalysisStats
          aiStatus={latestAiStatus}
          analysisCount={analysisCount}
          latestAnalysisDate={latestAnalysisDate}
          latestInsights={getLatestInsights(savedAnalysis, t)}
          nextAnalysisRecommendation={nextAnalysisRecommendation}
          nextRecommendedSteps={nextRecommendedSteps}
          progressGraphItems={progressGraphItems}
          progressIndicators={progressIndicators}
          progressStats={progressStats}
          progressOverviewStats={progressOverviewStats}
          summaryText={summaryText}
          weeklyFocus={weeklyFocus}
        />
      )}
      <details className="body-analysis-more-info">
        <summary>{t('card.heading.previousScans')}</summary>
        <BodyAnalysisTimeline
          analysisHistory={analysisHistory}
          expandedAnalysisIds={expandedAnalysisIds}
          formatAnalysisDate={formatAnalysisDate}
          getResultSections={(result) => getResultSections(result, t)}
          getResultSourceLabel={(result) => getResultSourceLabel(result, t)}
          getTimelineSummary={(result) => getTimelineSummary(result, t)}
          importSummary={importSummary}
          pendingDeleteAnalysisId={pendingDeleteAnalysisId}
          renderResultValue={renderResultValue}
          showClearHistoryConfirm={showClearHistoryConfirm}
          timelineFilter={timelineFilter}
          timelineFilters={timelineFilters}
          visibleAnalysisHistory={visibleAnalysisHistory}
          onAskDeleteAnalysis={setPendingDeleteAnalysisId}
          onCancelClearHistory={() => setShowClearHistoryConfirm(false)}
          onCancelDeleteAnalysis={() => setPendingDeleteAnalysisId('')}
          onClearHistory={handleClearHistory}
          onDeleteAnalysis={handleDeleteAnalysis}
          onExportHistory={handleExportHistory}
          onImportHistory={handleImportHistory}
          onSelectAnalysis={setSavedAnalysis}
          onShowClearHistoryConfirm={() => setShowClearHistoryConfirm(true)}
          onTimelineFilterChange={setTimelineFilter}
          onToggleExpandedAnalysis={toggleExpandedAnalysis}
        />
      </details>
      </>)}
    </div>
  )
}

export default BodyAnalysisCard
