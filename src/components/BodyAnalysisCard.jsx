import { useState } from 'react'

import { getAnalysisComparison } from '../services/bodyAnalysisComparison'
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
import { analyzeBodyWithAI } from '../services/bodyAnalysisService'
import { getBodyAnalysisProgressStats } from '../services/bodyAnalysisStats'
import BodyAnalysisDevChecklist from './BodyAnalysisDevChecklist'
import BodyAnalysisOnboarding from './BodyAnalysisOnboarding'
import BodyAnalysisPrivacy from './BodyAnalysisPrivacy'
import BodyAnalysisPremiumPreview from './BodyAnalysisPremiumPreview'
import BodyAnalysisQuality from './BodyAnalysisQuality'
import BodyAnalysisResult from './BodyAnalysisResult'
import BodyAnalysisStats from './BodyAnalysisStats'
import BodyAnalysisTimeline from './BodyAnalysisTimeline'
import BodyAnalysisUnlockCard from './BodyAnalysisUnlockCard'
import BodyAnalysisUploader from './BodyAnalysisUploader'

const FREE_ANALYSIS_LIMIT = 3

const timelineFilters = [
  { label: 'Alla', value: 'all' },
  { label: 'Senaste 30 dagarna', value: '30' },
  { label: 'Senaste 90 dagarna', value: '90' },
]

const bodyOverviewMarkers = [
  { label: 'Axlar', text: 'Följs över tid.', x: 50, y: 25 },
  { label: 'Armar', text: 'Ingen tydlig förändring ännu.', x: 25, y: 42 },
  { label: 'Midja', text: 'Möjlig positiv utveckling.', x: 50, y: 47 },
  { label: 'Höfter', text: 'Följs över tid.', x: 50, y: 61 },
  { label: 'Ben', text: 'Ingen tydlig förändring ännu.', x: 56, y: 80 },
]

const resultModelFields = [
  ['status', 'Status'],
  ['source', 'Källa'],
  ['generatedAt', 'Genererad'],
  ['summary', 'Sammanfattning'],
  ['bodyComposition', 'Kroppssammansättning'],
  ['posture', 'Hållning'],
  ['strengths', 'Styrkor'],
  ['improvementAreas', 'Förbättringsområden'],
  ['recommendations', 'Rekommendationer'],
  ['nextSteps', 'Nästa steg'],
  ['comparison', 'Förändring sedan senaste analys'],
  ['progressSummary', 'Utveckling över tid'],
  ['visualConsistency', 'Bildkonsekvens'],
  ['routineFeedback', 'Rutinfeedback'],
  ['monthlyFocus', 'Fokus denna månad'],
  ['confidenceLevel', 'Tillförlitlighetsnivå'],
  ['limitations', 'Begränsningar'],
  ['sourceReason', 'Resultatkälla'],
  ['confidence', 'Tillförlitlighet'],
  ['safetyNote', 'Säkerhetsnotis'],
]

const mockNextAnalysisGoals = [
  'Ta nästa bild inom 7 dagar.',
  'Behåll samma fotograferingsvinkel.',
  'Fortsätt registrera vikten regelbundet.',
  'Fortsätt med dina nuvarande kost- och träningsvanor.',
]

function formatAnalysisDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))
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

function getTimelineSummary(result) {
  return result.summary || result.comparison?.unchanged || 'Analys klar.'
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

function getResultSections(result) {
  return resultModelFields
    .map(([key, label]) => ({
      key,
      label,
      value: result[key],
    }))
    .filter(({ value }) => {
      if (Array.isArray(value)) {
        return value.length > 0
      }

      return value !== undefined && value !== null && value !== ''
    })
}

function getResultSourceLabel(result) {
  return result.source === 'ai' ? 'AI-resultat' : 'Mock-resultat'
}

function getLatestAiStatus(analysis) {
  if (!analysis?.result) {
    return {
      label: 'Ingen analys ännu',
      reason: 'ingen_historik',
    }
  }

  return {
    label: analysis.result.source === 'ai' ? 'AI fungerade' : 'Mock användes',
    reason: analysis.result.sourceReason || 'api_error',
  }
}

function getNextAnalysisRecommendation(daysSinceLatestAnalysis) {
  if (daysSinceLatestAnalysis === null) {
    return 'Skapa första analys'
  }

  if (daysSinceLatestAnalysis < 7) {
    return 'Vänta några dagar'
  }

  return 'Dags för ny analys'
}

function getLatestInsights(analysis) {
  if (!analysis?.result) {
    return [
      'Skapa en analys för att få personliga insikter.',
      'Två bilder ger bättre underlag.',
      'Konsekventa bilder gör jämförelser tydligare.',
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

function createDemoBodyAnalysisResult(previousAnalysis) {
  return {
    bodyComposition:
      'Demoanalysen visar en stabil visuell helhetsbild utan medicinska exakta värden.',
    comparison: previousAnalysis
      ? {
          better: 'Det finns en ny jämförelsepunkt i tidslinjen.',
          nextFocus: 'Ta nästa demoanalys med samma tänkta ljus och avstånd.',
          unchanged: 'Demoresultatet gör inga säkra visuella förändringspåståenden.',
        }
      : {
          better: 'Det här är din första analys.',
          nextFocus: 'Skapa en ny analys om ungefär en vecka.',
          unchanged: 'Ingen tidigare analys finns att jämföra med ännu.',
        },
    confidence: 'Medel',
    confidenceLevel: 'Medel',
    generatedAt: new Date().toISOString(),
    improvementAreas: ['Fortsätt hålla bildrutinen enkel och konsekvent.'],
    limitations: ['Demoanalysen använder inte riktig bildtolkning.'],
    monthlyFocus: 'Bygg en jämn rutin med återkommande analyser.',
    nextSteps: ['Ta nästa analys om ungefär 7 dagar.'],
    posture: 'Hållningen bedöms som stabil i demoresultatet.',
    progressSummary:
      'Demoanalysen skapar en testpunkt för utvecklingen över tid.',
    recommendations: mockNextAnalysisGoals,
    routineFeedback:
      'Regelbundenhet gör tidslinjen mer användbar när riktig analys kopplas in.',
    safetyNote:
      'Detta är en allmän uppskattning och inte medicinsk rådgivning.',
    source: 'mock',
    sourceReason: 'demo',
    status: 'completed',
    strengths: ['Du har en tydlig startpunkt för framtida jämförelser.'],
    summary: 'Demoanalysen är skapad och visas som ett mock-resultat.',
    visualConsistency: 'Samma ljus, avstånd och vinkel ger bättre jämförelser.',
  }
}

function BodyAnalysisCard({ onAnalysisHistoryChange = () => {} }) {
  const [activeBodyMarker, setActiveBodyMarker] = useState(bodyOverviewMarkers[0])
  const [analysisHistory, setAnalysisHistory] = useState(() =>
    getAnalysisHistory(),
  )
  const [analysisError, setAnalysisError] = useState('')
  const [analysisStatus, setAnalysisStatus] = useState('Väntar på bilder')
  const [expandedAnalysisIds, setExpandedAnalysisIds] = useState([])
  const [frontPhoto, setFrontPhoto] = useState(null)
  const [hasApprovedAnalysis, setHasApprovedAnalysis] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isPremiumPreviewEnabled, setIsPremiumPreviewEnabled] = useState(false)
  const [pendingDeleteAnalysisId, setPendingDeleteAnalysisId] = useState('')
  const [savedAnalysis, setSavedAnalysis] = useState(() => getLatestAnalysis())
  const [showAnalysisConsent, setShowAnalysisConsent] = useState(false)
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false)
  const [sidePhoto, setSidePhoto] = useState(null)
  const [timelineFilter, setTimelineFilter] = useState('all')
  const analysisCount = analysisHistory.length
  const isFreeLimitReached =
    !isPremiumPreviewEnabled && analysisCount >= FREE_ANALYSIS_LIMIT
  const canAnalyze =
    Boolean(frontPhoto && sidePhoto) && !isAnalyzing && !isFreeLimitReached
  const analyzeDisabledReason = isFreeLimitReached
    ? 'Gratisgränsen på tre lokala analyser är nådd. Premium kan låsas upp senare.'
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
      ? 'Analys misslyckades'
      : isFreeLimitReached
        ? 'Gratisgräns nådd'
      : analysisStatus === 'Analys klar'
        ? 'Analys klar'
        : canAnalyze
          ? 'Redo att analysera'
          : 'Väntar på bilder'
  const summaryText = latestAnalysisDate
    ? `Senaste analysen sparades ${formatAnalysisDate(
        latestAnalysisDate,
      )}. Jämförelser blir bättre när bilder tas regelbundet.`
    : 'När du sparar din första analys visas den här tillsammans med historik och jämförelser över tid.'
  const nextRecommendedSteps =
    analysisCount === 0
      ? [
          'Skapa din första analys.',
          'Välj både framifrån- och sidobild.',
          'Använd samma plats och ljus från start.',
        ]
      : analysisCount === 1
        ? [
            'Skapa en till analys för jämförelse.',
            'Ta nästa bilder med samma vinkel.',
            'Spara nästa analys inom 7 dagar.',
          ]
        : [
            'Fortsätt följa utvecklingen veckovis.',
            'Jämför bilder med samma ljus och avstånd.',
            'Håll rutinen enkel och konsekvent.',
          ]
  const weeklyFocus =
    savedAnalysis?.result?.monthlyFocus ||
    'Fokusera på jämna förändringar, inte snabba resultat.'
  const nextAnalysisRecommendation =
    getNextAnalysisRecommendation(daysSinceLatestAnalysis)
  const analysisQualityItems = [
    {
      label: 'Bild framifrån vald',
      status: frontPhoto ? 'positive' : 'neutral',
      value: frontPhoto ? 'Klar' : 'Väntar',
    },
    {
      label: 'Sidobild vald',
      status: sidePhoto ? 'positive' : 'neutral',
      value: sidePhoto ? 'Klar' : 'Väntar',
    },
    {
      label: 'Samma ljus rekommenderas',
      status: 'warning',
      value: 'För bättre jämförelser',
    },
    {
      label: 'Samma avstånd rekommenderas',
      status: 'warning',
      value: 'För jämnare analys',
    },
    {
      label: 'Liknande kläder rekommenderas',
      status: 'warning',
      value: 'För tydligare förändring',
    },
  ]
  const progressIndicators = [
    {
      label: 'Vikttrend',
      status: 'neutral',
      value: 'Stabil trend',
    },
    {
      label: 'Analysfrekvens',
      status:
        analysisCount === 0
          ? 'neutral'
          : analysisCount === 1 || daysSinceLatestAnalysis > 14
            ? 'warning'
            : 'positive',
      value:
        analysisCount === 0
          ? 'Ingen data än'
          : analysisCount === 1
            ? 'Behöver en till'
            : 'Bra rytm',
    },
    {
      label: 'Fotokonsekvens',
      status: analysisCount >= 2 ? 'positive' : 'warning',
      value: analysisCount >= 2 ? 'Följs över tid' : 'Bygg rutin',
    },
    {
      label: 'Nästa rekommenderade analys',
      status:
        daysSinceLatestAnalysis === null
          ? 'neutral'
          : daysSinceLatestAnalysis > 7
            ? 'warning'
            : 'positive',
      value: nextAnalysisDate
        ? formatShortDate(nextAnalysisDate)
        : 'Efter första analys',
    },
  ]
  const progressStats = [
    { label: 'Totalt antal analyser', value: historyStats.total || '-' },
    {
      label: 'Senaste datum',
      value: historyStats.latestDate
        ? formatShortDate(historyStats.latestDate)
        : 'Ingen analys',
    },
    {
      label: 'Dagar sedan senaste',
      value:
        historyStats.daysSinceLatest !== null
          ? `${historyStats.daysSinceLatest} dagar`
          : 'Ingen analys än',
    },
    { label: 'AI-resultat', value: historyStats.ai },
    { label: 'Mock-resultat', value: historyStats.mock },
    {
      label: 'Genomsnittligt intervall',
      value:
        historyStats.averageIntervalDays !== null
          ? `${historyStats.averageIntervalDays} dagar`
          : '-',
    },
    {
      label: 'Nästa analys',
      value: nextAnalysisDate ? formatShortDate(nextAnalysisDate) : 'Skapa första',
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
  const progressOverviewStats = getBodyAnalysisProgressStats(analysisHistory)
  const progressGraphItems = analysisHistory.slice(0, 5).map((analysis) => ({
    analysisNumber: analysis.analysisNumber,
    date: formatShortDate(analysis.createdAt),
    id: analysis.createdAt,
    status: analysis.result?.source === 'ai' ? 'positive' : 'warning',
  }))
  const latestAiStatus = getLatestAiStatus(savedAnalysis)

  function handlePhotoChange(event, view) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      const photo = {
        file,
        name: file.name,
        preview: typeof reader.result === 'string' ? reader.result : '',
      }

      if (view === 'front') {
        setFrontPhoto(photo)
        setAnalysisStatus(sidePhoto ? 'Redo att analysera' : 'Väntar på bilder')
        return
      }

      setSidePhoto(photo)
      setAnalysisStatus(frontPhoto ? 'Redo att analysera' : 'Väntar på bilder')
    })
    reader.readAsDataURL(file)
  }

  function storeCompletedAnalysis(result, photos = {}) {
    const nextAnalysis = {
      analysisNumber: analysisHistory.length + 1,
      createdAt: new Date().toISOString(),
      frontPhoto: photos.frontPhoto || { name: 'Demo framifrån', preview: '' },
      result,
      schemaVersion: 1,
      sidePhoto: photos.sidePhoto || { name: 'Demo från sidan', preview: '' },
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
    setAnalysisStatus('Analys klar')
  }

  async function runBodyAnalysis() {
    if (isFreeLimitReached) {
      setAnalysisError(
        'Gratisgränsen är nådd. Du kan behålla historiken, radera en analys eller förhandsvisa premiumläge utan betalning.',
      )
      return
    }

    if (!frontPhoto || !sidePhoto || isAnalyzing) {
      return
    }

    setIsAnalyzing(true)
    setAnalysisError('')
    setAnalysisStatus('Bilder skickas säkert...')

    const statusTimers = [
      window.setTimeout(() => setAnalysisStatus('AI analyserar...'), 700),
      window.setTimeout(
        () => setAnalysisStatus('Resultat förbereds...'),
        1400,
      ),
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
      const result = await analyzeBodyWithAI({
        frontPhoto,
        previousAnalysis: getLatestAnalysis()?.result,
        sidePhoto,
      })

      storeCompletedAnalysis(result, {
        frontPhoto: storedFrontPhoto,
        sidePhoto: storedSidePhoto,
      })
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : 'Analysen kunde inte genomföras just nu. Försök igen om en stund.',
      )
      setAnalysisStatus('Analys misslyckades')
    } finally {
      statusTimers.forEach((timer) => window.clearTimeout(timer))
      setIsAnalyzing(false)
    }
  }

  function handleAnalyzeBody() {
    if (isFreeLimitReached) {
      setAnalysisError(
        'Gratisgränsen är nådd. Radera en analys eller testa premiumförhandsvisning för att skapa fler.',
      )
      return
    }

    if (!frontPhoto || !sidePhoto || isAnalyzing) {
      return
    }

    if (!hasApprovedAnalysis) {
      setShowAnalysisConsent(true)
      return
    }

    runBodyAnalysis()
  }

  function handleApproveAnalysis() {
    setHasApprovedAnalysis(true)
    setShowAnalysisConsent(false)
    runBodyAnalysis()
  }

  function handleCreateDemoAnalysis() {
    if (isFreeLimitReached) {
      setAnalysisError(
        'Gratisgränsen är nådd. Aktivera premiumförhandsvisning i dev-läget för att testa fler demoanalyser.',
      )
      return
    }

    setAnalysisError('')
    storeCompletedAnalysis(createDemoBodyAnalysisResult(getLatestAnalysis()?.result))
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
      setAnalysisError(
        'Exporten misslyckades. Försök igen eller kontrollera webbläsarens nedladdningsinställningar.',
      )
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
      setAnalysisError('Ingen importfil valdes.')
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
        setAnalysisError(
          'Importen misslyckades. Kontrollera att filen är en exporterad JSON-fil från Viktkollen.',
        )
      } finally {
        event.target.value = ''
      }
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
    <div className="progress-upload">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI-kroppsanalys</p>
          <h3>Första steget</h3>
        </div>
      </div>
      <p className="progress-photo-safety">
        AI kommer att uppskatta kroppssammansättning och följa förändringar
        över tid.
      </p>
      <BodyAnalysisOnboarding />
      <BodyAnalysisPremiumPreview
        analysisCount={analysisCount}
        isPremiumPreviewEnabled={isPremiumPreviewEnabled}
        localLimit={FREE_ANALYSIS_LIMIT}
        onTogglePremiumPreview={() => {
          setAnalysisError('')
          setIsPremiumPreviewEnabled((currentValue) => !currentValue)
        }}
      />
      <BodyAnalysisUploader
        canAnalyze={canAnalyze}
        currentAnalysisStatus={currentAnalysisStatus}
        disabledReason={analyzeDisabledReason}
        frontPhoto={frontPhoto}
        sidePhoto={sidePhoto}
        onAnalyze={handleAnalyzeBody}
        onPhotoChange={handlePhotoChange}
      />
      <BodyAnalysisUnlockCard
        isLimitReached={isFreeLimitReached}
        isPremiumPreviewEnabled={isPremiumPreviewEnabled}
      />
      {import.meta.env.DEV && (
        <>
          <button
            className="secondary-button"
            type="button"
            aria-label="Skapa demoanalys i utvecklarläge"
            onClick={handleCreateDemoAnalysis}
          >
            Skapa demoanalys
          </button>
          <BodyAnalysisDevChecklist />
        </>
      )}
      <BodyAnalysisQuality items={analysisQualityItems} />
      <BodyAnalysisPrivacy
        showConsent={showAnalysisConsent}
        onApprove={handleApproveAnalysis}
        onCancel={() => setShowAnalysisConsent(false)}
      />
      {analysisError && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Resultat</p>
              <h3>Analysen kunde inte genomföras</h3>
            </div>
            <span>Fel</span>
          </div>
          <p>{analysisError}</p>
        </div>
      )}
      {!analysisError && (
        <BodyAnalysisResult
          activeBodyMarker={activeBodyMarker}
          bodyOverviewMarkers={bodyOverviewMarkers}
          formatAnalysisDate={formatAnalysisDate}
          getResultSections={getResultSections}
          getResultSourceLabel={getResultSourceLabel}
          renderResultValue={renderResultValue}
          savedAnalysis={savedAnalysis}
          onMarkerChange={setActiveBodyMarker}
        />
      )}
      {savedAnalysis && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Jämförelse</p>
              <h3>Förändring sedan senaste analys</h3>
            </div>
            <span>{analysisHistory.length > 1 ? 'Aktiv' : 'Första'}</span>
          </div>
          {analysisHistory.length > 1 ? (
            <ul>
              <li>{selectedComparison.better}</li>
              <li>{selectedComparison.unchanged}</li>
              <li>{selectedComparison.nextFocus}</li>
            </ul>
          ) : (
            <p>Det här är din första analys.</p>
          )}
        </div>
      )}
      <BodyAnalysisStats
        aiStatus={latestAiStatus}
        analysisCount={analysisCount}
        latestAnalysisDate={latestAnalysisDate}
        latestInsights={getLatestInsights(savedAnalysis)}
        nextAnalysisRecommendation={nextAnalysisRecommendation}
        nextRecommendedSteps={nextRecommendedSteps}
        progressGraphItems={progressGraphItems}
        progressIndicators={progressIndicators}
        progressStats={progressStats}
        progressOverviewStats={progressOverviewStats}
        summaryText={summaryText}
        weeklyFocus={weeklyFocus}
      />
      <BodyAnalysisTimeline
        analysisHistory={analysisHistory}
        expandedAnalysisIds={expandedAnalysisIds}
        formatAnalysisDate={formatAnalysisDate}
        getResultSections={getResultSections}
        getResultSourceLabel={getResultSourceLabel}
        getTimelineSummary={getTimelineSummary}
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
    </div>
  )
}

export default BodyAnalysisCard
