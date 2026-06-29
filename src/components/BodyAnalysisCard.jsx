import { useState } from 'react'

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

const mockNextAnalysisGoals = [
  'Ta nästa bild inom 7 dagar.',
  'Behåll samma fotograferingsvinkel.',
  'Fortsätt registrera vikten regelbundet.',
  'Fortsätt med dina nuvarande kost- och träningsvanor.',
]
const mockWeeklyFocus = [
  'Ta en ny analys denna vecka.',
  'Försök fotografera vid samma tid på dagen.',
  'Registrera vikten samtidigt som du tar bilder.',
  'Fokusera på jämna förändringar, inte snabba resultat.',
]
const mockReliabilityTips = [
  'Samma ljus ger bättre jämförelser.',
  'Samma avstånd förbättrar analysen.',
  'Samma kläder eller liknande kläder ger bättre resultat.',
]
const timelineFilters = [
  { label: 'Alla', value: 'all' },
  { label: 'Senaste 30 dagarna', value: '30' },
  { label: 'Senaste 90 dagarna', value: '90' },
]
const bodyOverviewMarkers = [
  {
    label: 'Axlar',
    text: 'Följs över tid.',
    x: 50,
    y: 25,
  },
  {
    label: 'Armar',
    text: 'Ingen tydlig förändring ännu.',
    x: 25,
    y: 42,
  },
  {
    label: 'Midja',
    text: 'Möjlig positiv utveckling.',
    x: 50,
    y: 47,
  },
  {
    label: 'Höfter',
    text: 'Följs över tid.',
    x: 50,
    y: 61,
  },
  {
    label: 'Ben',
    text: 'Ingen tydlig förändring ännu.',
    x: 56,
    y: 80,
  },
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
  ['confidence', 'Tillförlitlighet'],
  ['safetyNote', 'Säkerhetsnotis'],
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

  const difference = Date.now() - createdAt

  return Math.max(0, Math.floor(difference / (24 * 60 * 60 * 1000)))
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

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  return createdAt >= cutoff
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
  ].filter(Boolean).slice(0, 3)
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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [pendingDeleteAnalysisId, setPendingDeleteAnalysisId] = useState('')
  const [savedAnalysis, setSavedAnalysis] = useState(() => getLatestAnalysis())
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false)
  const [showAnalysisConsent, setShowAnalysisConsent] = useState(false)
  const [sidePhoto, setSidePhoto] = useState(null)
  const [timelineFilter, setTimelineFilter] = useState('all')
  const canAnalyze = Boolean(frontPhoto && sidePhoto) && !isAnalyzing
  const currentAnalysisStatus = isAnalyzing
    ? analysisStatus
    : analysisError
      ? 'Analys misslyckades'
      : analysisStatus === 'Analys klar'
        ? 'Analys klar'
        : canAnalyze
          ? 'Redo att analysera'
          : 'Väntar på bilder'
  const analysisCount = analysisHistory.length
  const latestAnalysisDate = analysisHistory[0]?.createdAt
  const historyStats = getHistoryStats(analysisHistory)
  const nextStepText =
    analysisCount === 0
      ? 'Skapa din första analys för att börja följa utvecklingen.'
      : analysisCount === 1
        ? 'Lägg till en analys till för att kunna jämföra förändringar.'
        : 'Du kan nu följa förändringar över tid.'
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
  const weeklyFocus = mockWeeklyFocus[analysisCount % mockWeeklyFocus.length]
  const daysSinceLatestAnalysis = latestAnalysisDate
    ? getDaysSince(latestAnalysisDate)
    : null
  const nextAnalysisDate = latestAnalysisDate
    ? getNextAnalysisDate(latestAnalysisDate)
    : null
  const latestInsights = getLatestInsights(savedAnalysis)
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
  const visibleAnalysisHistory =
    timelineFilter === 'all'
      ? analysisHistory.slice(0, 10)
      : analysisHistory.filter((analysis) =>
          isAnalysisWithinDays(analysis, Number(timelineFilter)),
        ).slice(0, 10)
  const comparison = savedAnalysis?.result?.comparison

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

  async function runBodyAnalysis() {
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
      const nextAnalysis = {
        analysisNumber: analysisHistory.length + 1,
        createdAt: new Date().toISOString(),
        frontPhoto: storedFrontPhoto,
        result: await analyzeBodyWithAI({
          frontPhoto,
          previousAnalysis: getLatestAnalysis()?.result,
          sidePhoto,
        }),
        sidePhoto: storedSidePhoto,
        status: 'Analys klar',
      }
      const nextHistory = addAnalysis(nextAnalysis)

      setSavedAnalysis(nextAnalysis)
      setAnalysisHistory(nextHistory)
      onAnalysisHistoryChange(true)
      setAnalysisStatus('Analys klar')
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

  function handleExportHistory() {
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
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      try {
        const importedHistory = importHistory(JSON.parse(String(reader.result)))

        setAnalysisHistory(importedHistory)
        setSavedAnalysis(importedHistory[0] ?? null)
        onAnalysisHistoryChange(importedHistory.length > 0)
      } catch {
        setAnalysisError('Kunde inte importera analystidslinjen.')
      } finally {
        event.target.value = ''
      }
    })
    reader.readAsText(file)
  }

  function handleClearHistory() {
    setAnalysisHistory(clearAnalysisHistory())
    setExpandedAnalysisIds([])
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
      <div className="body-analysis-help">
        <h3>Så får du bättre jämförelser</h3>
        <ul>
          <li>Använd samma plats.</li>
          <li>Ha liknande ljus.</li>
          <li>Stå på samma avstånd från kameran.</li>
          <li>Använd liknande kläder.</li>
        </ul>
      </div>
      <div className="progress-photo-upload-grid">
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            F
          </span>
          <strong>Bild framifrån</strong>
          <small>Välj en bild för framtida kroppsanalys.</small>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handlePhotoChange(event, 'front')}
          />
        </label>
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            S
          </span>
          <strong>Bild från sidan</strong>
          <small>Välj en sidobild för framtida jämförelse.</small>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handlePhotoChange(event, 'side')}
          />
        </label>
      </div>
      {(frontPhoto || sidePhoto) && (
        <div className="progress-photo-ai-images">
          {frontPhoto && (
            <figure>
              <img src={frontPhoto.preview} alt="Vald bild framifrån" />
              <figcaption>{frontPhoto.name}</figcaption>
            </figure>
          )}
          {sidePhoto && (
            <figure>
              <img src={sidePhoto.preview} alt="Vald bild från sidan" />
              <figcaption>{sidePhoto.name}</figcaption>
            </figure>
          )}
        </div>
      )}
      <div className="body-analysis-progress">
        <div>
          <p className="eyebrow">Analyskvalitet</p>
          <h3>För bättre jämförelser</h3>
        </div>
        <div className="body-analysis-progress-grid">
          {analysisQualityItems.map((item) => (
            <div key={item.label}>
              <span
                className={`body-analysis-status-dot is-${item.status}`}
                aria-hidden="true"
              />
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <button type="button" onClick={handleAnalyzeBody} disabled={!canAnalyze}>
        Analysera kroppen
      </button>
      <p className="analysis-status">{currentAnalysisStatus}</p>
      <p className="progress-photo-safety">
        Bilderna skickas till AI-analysen när du klickar på Analysera kroppen.
        Bilderna sparas inte permanent i appen. Resultatet är endast en allmän
        uppskattning och ingen medicinsk diagnos.
      </p>
      {showAnalysisConsent && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Bekräfta analys</p>
              <h3>Skicka bilder till AI-analysen?</h3>
            </div>
            <span>Integritet</span>
          </div>
          <p>
            Bilderna används bara för att skapa analysresultatet i denna version
            och sparas inte permanent i appen. Resultatet är en allmän
            uppskattning och inte medicinsk rådgivning.
          </p>
          <button type="button" onClick={handleApproveAnalysis}>
            Jag godkänner och analyserar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowAnalysisConsent(false)}
          >
            Avbryt
          </button>
        </div>
      )}
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
      {!savedAnalysis && !isAnalyzing && !analysisError && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Resultat</p>
              <h3>Ingen analys ännu</h3>
            </div>
            <span>Väntar</span>
          </div>
          <p>
            Resultatet visas här efter att du valt två bilder och klickat på
            Analysera kroppen.
          </p>
        </div>
      )}
      {savedAnalysis && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Senaste sparade analys</p>
              <h3>{formatAnalysisDate(savedAnalysis.createdAt)}</h3>
            </div>
            <span>{getResultSourceLabel(savedAnalysis.result)}</span>
          </div>
          {savedAnalysis.result.source === 'mock' && (
            <p className="progress-photo-safety">
              Demoresultat visas eftersom AI inte kunde användas just nu.
            </p>
          )}
          <div className="progress-photo-ai-images">
            <figure>
              <img
                src={savedAnalysis.frontPhoto.preview}
                alt="Sparad bild framifrån"
              />
              <figcaption>{savedAnalysis.frontPhoto.name}</figcaption>
            </figure>
            <figure>
              <img
                src={savedAnalysis.sidePhoto.preview}
                alt="Sparad bild från sidan"
              />
              <figcaption>{savedAnalysis.sidePhoto.name}</figcaption>
            </figure>
          </div>
          {getResultSections(savedAnalysis.result).map((section) => (
            <div key={section.key}>
              <p className="report-heading">{section.label}</p>
              {renderResultValue(section.key, section.value)}
            </div>
          ))}
          <p className="report-heading">Visuell kroppsöversikt</p>
          <div
            className="progress-photo-ai-images"
            style={{ position: 'relative' }}
          >
            <figure>
              <svg
                aria-label="Enkel kroppsöversikt"
                role="img"
                viewBox="0 0 120 220"
              >
                <circle cx="60" cy="24" fill="currentColor" r="14" />
                <path
                  d="M43 46 Q60 38 77 46 L88 108 Q75 122 72 151 L67 205 H53 L48 151 Q45 122 32 108 Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="8"
                />
                <path
                  d="M42 62 L18 118 M78 62 L102 118 M50 148 L40 205 M70 148 L80 205"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="8"
                />
              </svg>
              <figcaption>{activeBodyMarker.text}</figcaption>
            </figure>
            {bodyOverviewMarkers.map((marker) => (
              <button
                className="progress-photo-view-badge"
                key={marker.label}
                style={{
                  left: `${marker.x}%`,
                  position: 'absolute',
                  top: `${marker.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                title={marker.text}
                type="button"
                onClick={() => setActiveBodyMarker(marker)}
                onFocus={() => setActiveBodyMarker(marker)}
              >
                {marker.label}
              </button>
            ))}
          </div>
          <p className="report-heading">Mål för nästa analys</p>
          <ul className="body-analysis-goals">
            {mockNextAnalysisGoals.map((goal) => (
              <li key={goal}>
                <span aria-hidden="true">✓</span>
                {goal}
              </li>
            ))}
          </ul>
          <p className="report-heading">Analysens tillförlitlighet</p>
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Tillförlitlighet</p>
              <h3>Medel</h3>
            </div>
            <span>Mock-data</span>
          </div>
          <ul>
            {mockReliabilityTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
      {analysisHistory.length > 0 && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Jämförelse</p>
              <h3>Förändring sedan senaste analys</h3>
            </div>
            <span>{analysisHistory.length > 1 ? 'Aktiv' : 'Första'}</span>
          </div>
          {analysisHistory.length > 1 && comparison ? (
            <ul>
              <li>{comparison.better}</li>
              <li>{comparison.unchanged}</li>
              <li>{comparison.nextFocus}</li>
            </ul>
          ) : (
            <p>Det här är din första analys.</p>
          )}
        </div>
      )}
      <div className="body-analysis-summary">
        <div>
          <p className="eyebrow">Analystidslinje</p>
          <h3>
            {analysisCount > 0
              ? `${analysisCount} sparade analyser`
              : 'Ingen analys sparad ännu'}
          </h3>
        </div>
        {latestAnalysisDate ? (
          <p>
            Senaste analysen sparades {formatAnalysisDate(latestAnalysisDate)}.
            Jämförelser blir bättre när bilder tas regelbundet.
          </p>
        ) : (
          <p>
            När du sparar din första analys visas den här tillsammans med
            historik och jämförelser över tid.
          </p>
        )}
        <p>Du kan när som helst radera din lokala analysdata.</p>
      </div>
      <div className="body-analysis-stats">
        <div>
          <span>Totalt antal analyser</span>
          <strong>{historyStats.total > 0 ? historyStats.total : '-'}</strong>
        </div>
        <div>
          <span>Senaste datum</span>
          <strong>
            {historyStats.latestDate
              ? formatShortDate(historyStats.latestDate)
              : 'Ingen analys'}
          </strong>
        </div>
        <div>
          <span>Dagar sedan senaste</span>
          <strong>
            {historyStats.daysSinceLatest !== null
              ? `${historyStats.daysSinceLatest} dagar`
              : 'Ingen analys än'}
          </strong>
        </div>
        <div>
          <span>AI-resultat</span>
          <strong>{historyStats.ai}</strong>
        </div>
        <div>
          <span>Mock-resultat</span>
          <strong>{historyStats.mock}</strong>
        </div>
        <div>
          <span>Genomsnittligt intervall</span>
          <strong>
            {historyStats.averageIntervalDays !== null
              ? `${historyStats.averageIntervalDays} dagar`
              : '-'}
          </strong>
        </div>
        <div>
          <span>Nästa analys</span>
          <strong>
            {nextAnalysisDate
              ? formatShortDate(nextAnalysisDate)
              : 'Skapa första'}
          </strong>
        </div>
      </div>
      <p className="body-analysis-next-step">{nextStepText}</p>
      <div className="body-analysis-weekly-focus">
        <p className="eyebrow">Nästa rekommenderade analys</p>
        <h3>{nextAnalysisRecommendation}</h3>
      </div>
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">Mina insikter</p>
          <h3>Från senaste analysen</h3>
        </div>
        <ul>
          {latestInsights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
      </div>
      <div className="body-analysis-weekly-focus">
        <p className="eyebrow">Veckans AI-fokus</p>
        <h3>{weeklyFocus}</h3>
      </div>
      <div className="body-analysis-recommended-steps">
        <div>
          <p className="eyebrow">Nästa rekommenderade steg</p>
          <h3>Fortsätt framåt</h3>
        </div>
        <ul>
          {nextRecommendedSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>
      <div className="body-analysis-progress">
        <div>
          <p className="eyebrow">Utveckling över tid</p>
          <h3>Översikt</h3>
        </div>
        <div className="body-analysis-progress-grid">
          {progressIndicators.map((indicator) => (
            <div key={indicator.label}>
              <span
                className={`body-analysis-status-dot is-${indicator.status}`}
                aria-hidden="true"
              />
              <small>{indicator.label}</small>
              <strong>{indicator.value}</strong>
            </div>
          ))}
        </div>
      </div>
      {analysisCount === 0 && (
        <p className="progress-photo-safety">
          Ingen lokal analystidslinje finns just nu. Skapa din första analys
          för att börja följa förändringar över tid.
        </p>
      )}
      {analysisHistory.length > 0 && (
        <>
          <div className="body-analysis-filter">
            <button
              className="secondary-button"
              type="button"
              onClick={handleExportHistory}
            >
              Exportera analystidslinje
            </button>
            <label className="secondary-button">
              Importera analystidslinje
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={handleImportHistory}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowClearHistoryConfirm(true)}
            >
              Rensa analystidslinje
            </button>
          </div>
          {showClearHistoryConfirm && (
            <div className="progress-photo-ai-comparison">
              <div className="progress-photo-ai-heading">
                <div>
                  <p className="eyebrow">Bekräfta rensning</p>
                  <h3>Rensa hela analystidslinjen?</h3>
                </div>
                <span>Lokalt</span>
              </div>
              <p>
                Detta tar bort alla lokalt sparade analyser från den här
                webbläsaren.
              </p>
              <button type="button" onClick={handleClearHistory}>
                Ja, rensa analystidslinjen
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowClearHistoryConfirm(false)}
              >
                Avbryt
              </button>
            </div>
          )}
          <div className="body-analysis-filter">
            {timelineFilters.map((filter) => (
              <button
                className={
                  timelineFilter === filter.value
                    ? 'secondary-button is-active'
                    : 'secondary-button'
                }
                key={filter.value}
                type="button"
                onClick={() => setTimelineFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="body-analysis-timeline">
            {visibleAnalysisHistory.length > 0 ? (
              visibleAnalysisHistory.map((analysis) => {
                const isExpanded = expandedAnalysisIds.includes(
                  analysis.createdAt,
                )

                return (
                  <article key={analysis.createdAt}>
                    <span className="body-analysis-timeline-dot" />
                    <div className="body-analysis-timeline-content">
                      <div className="body-analysis-timeline-heading">
                        <strong>
                          Analys {analysis.analysisNumber} ·{' '}
                          {formatAnalysisDate(analysis.createdAt)}
                        </strong>
                        {analysis.createdAt === analysisHistory[0]?.createdAt && (
                          <span className="progress-photo-view-badge">
                            Senaste
                          </span>
                        )}
                      </div>
                      <p>{getTimelineSummary(analysis.result)}</p>
                      <span>{analysis.status || 'Analys klar'}</span>
                      <span>{getResultSourceLabel(analysis.result)}</span>
                      <div className="body-analysis-timeline-images">
                        <img
                          src={analysis.frontPhoto.preview}
                          alt="Miniatyr framifrån"
                        />
                        <img
                          src={analysis.sidePhoto.preview}
                          alt="Miniatyr från sidan"
                        />
                      </div>
                      {isExpanded && (
                        <div className="body-analysis-timeline-details">
                          {getResultSections(analysis.result).map((section) => (
                            <div key={section.key}>
                              <strong>{section.label}</strong>
                              {renderResultValue(section.key, section.value)}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setSavedAnalysis(analysis)}
                      >
                        Visa analys
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => toggleExpandedAnalysis(analysis.createdAt)}
                      >
                        {isExpanded ? 'Dölj detaljer' : 'Visa detaljer'}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          setPendingDeleteAnalysisId(analysis.createdAt)
                        }
                      >
                        Radera analys
                      </button>
                      {pendingDeleteAnalysisId === analysis.createdAt && (
                        <div className="progress-photo-ai-comparison">
                          <div className="progress-photo-ai-heading">
                            <div>
                              <p className="eyebrow">Bekräfta radering</p>
                              <h3>Radera den här analysen?</h3>
                            </div>
                            <span>Lokalt</span>
                          </div>
                          <p>
                            Analysen tas bort från den lokala tidslinjen i den
                            här webbläsaren.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnalysis(analysis.createdAt)}
                          >
                            Ja, radera analysen
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setPendingDeleteAnalysisId('')}
                          >
                            Avbryt
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })
            ) : (
              <p className="progress-photo-safety">
                Inga analyser finns i den valda perioden.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default BodyAnalysisCard
