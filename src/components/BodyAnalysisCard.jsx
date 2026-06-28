import { useState } from 'react'

const legacyStorageKey = 'viktkollen.bodyAnalysis.latest'
const storageKey = 'viktkollen.bodyAnalysis.history'
const mockBodyResult = {
  bodyFat: '~24 %',
  muscleMass: 'Normal',
  posture: 'Bra',
  waistTrend: 'Följs över tid',
}
const mockComparisonInsights = [
  'Midjan ser något smalare ut.',
  'Hållningen verkar förbättrad.',
  'Ingen tydlig förändring i överkroppen.',
  'Fortsätt använda samma fotograferingsvinkel.',
]
const mockRecommendations = [
  'Ta nästa bild om 7 dagar.',
  'Använd samma ljus och avstånd.',
  'Fortsätt med nuvarande tränings- och kostrutiner.',
  'Fokusera på jämna veckovisa förändringar.',
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

function isStoredAnalysis(value) {
  return (
    value &&
    typeof value.createdAt === 'string' &&
    value.frontPhoto &&
    typeof value.frontPhoto.name === 'string' &&
    typeof value.frontPhoto.preview === 'string' &&
    value.sidePhoto &&
    typeof value.sidePhoto.name === 'string' &&
    typeof value.sidePhoto.preview === 'string' &&
    value.result &&
    typeof value.result.bodyFat === 'string' &&
    typeof value.result.muscleMass === 'string' &&
    typeof value.result.posture === 'string' &&
    typeof value.result.waistTrend === 'string'
  )
}

function readStoredAnalyses() {
  try {
    const storedValue = window.localStorage.getItem(storageKey)

    if (storedValue) {
      const parsedValue = JSON.parse(storedValue)

      return Array.isArray(parsedValue)
        ? parsedValue.filter(isStoredAnalysis)
        : []
    }

    const legacyValue = window.localStorage.getItem(legacyStorageKey)

    if (!legacyValue) {
      return []
    }

    const parsedLegacyValue = JSON.parse(legacyValue)

    return isStoredAnalysis(parsedLegacyValue) ? [parsedLegacyValue] : []
  } catch {
    return []
  }
}

function writeStoredAnalyses(analyses) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(analyses))
  } catch {
    // Keep the UI usable even if the browser blocks localStorage.
  }
}

function clearStoredAnalyses() {
  try {
    window.localStorage.removeItem(storageKey)
    window.localStorage.removeItem(legacyStorageKey)
  } catch {
    // Keep the UI usable even if the browser blocks localStorage.
  }
}

function formatAnalysisDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function isAnalysisWithinDays(analysis, days) {
  const createdAt = new Date(analysis.createdAt).getTime()

  if (Number.isNaN(createdAt)) {
    return false
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  return createdAt >= cutoff
}

function BodyAnalysisCard({ onAnalysisHistoryChange = () => {} }) {
  const [activeBodyMarker, setActiveBodyMarker] = useState(bodyOverviewMarkers[0])
  const [analysisHistory, setAnalysisHistory] = useState(() =>
    readStoredAnalyses(),
  )
  const [frontPhoto, setFrontPhoto] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [savedAnalysis, setSavedAnalysis] = useState(() => analysisHistory[0] ?? null)
  const [sidePhoto, setSidePhoto] = useState(null)
  const [timelineFilter, setTimelineFilter] = useState('all')
  const canAnalyze = Boolean(frontPhoto && sidePhoto) && !isAnalyzing
  const analysisCount = analysisHistory.length
  const latestAnalysisDate = analysisHistory[0]?.createdAt
  const visibleAnalysisHistory =
    timelineFilter === 'all'
      ? analysisHistory
      : analysisHistory.filter((analysis) =>
          isAnalysisWithinDays(analysis, Number(timelineFilter)),
        )

  function handlePhotoChange(event, view) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      const photo = {
        name: file.name,
        preview: typeof reader.result === 'string' ? reader.result : '',
      }

      if (view === 'front') {
        setFrontPhoto(photo)
        return
      }

      setSidePhoto(photo)
    })
    reader.readAsDataURL(file)
  }

  function handleAnalyzeBody() {
    if (!frontPhoto || !sidePhoto || isAnalyzing) {
      return
    }

    setIsAnalyzing(true)

    window.setTimeout(() => {
      const nextAnalysis = {
        createdAt: new Date().toISOString(),
        frontPhoto,
        result: mockBodyResult,
        sidePhoto,
      }
      const nextHistory = [nextAnalysis, ...analysisHistory]

      writeStoredAnalyses(nextHistory)
      setAnalysisHistory(nextHistory)
      setSavedAnalysis(nextAnalysis)
      onAnalysisHistoryChange(true)
      setIsAnalyzing(false)
    }, 2000)
  }

  function handleClearHistory() {
    clearStoredAnalyses()
    setAnalysisHistory([])
    setSavedAnalysis(null)
    onAnalysisHistoryChange(false)
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
      <button type="button" onClick={handleAnalyzeBody} disabled={!canAnalyze}>
        Analysera kroppen
      </button>
      {isAnalyzing && (
        <p className="analysis-status">Analyserar kroppen...</p>
      )}
      {savedAnalysis && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Senaste sparade analys</p>
              <h3>{formatAnalysisDate(savedAnalysis.createdAt)}</h3>
            </div>
            <span>Lokalt sparad</span>
          </div>
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
          <dl>
            <div>
              <dt>Kroppsfett</dt>
              <dd>{savedAnalysis.result.bodyFat}</dd>
            </div>
            <div>
              <dt>Muskelmassa</dt>
              <dd>{savedAnalysis.result.muscleMass}</dd>
            </div>
            <div>
              <dt>Hållning</dt>
              <dd>{savedAnalysis.result.posture}</dd>
            </div>
            <div>
              <dt>Midjeutveckling</dt>
              <dd>{savedAnalysis.result.waistTrend}</dd>
            </div>
          </dl>
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
          <p className="report-heading">AI:s rekommendationer</p>
          <ul>
            {mockRecommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
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
          <p className="progress-photo-safety">
            Detta är en uppskattning och inte en medicinsk bedömning.
          </p>
        </div>
      )}
      {analysisHistory.length > 0 && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Mock-jämförelse</p>
              <h3>Förändring sedan förra analysen</h3>
            </div>
            <span>Ej AI ännu</span>
          </div>
          {analysisHistory.length >= 2 ? (
            <ul>
              {mockComparisonInsights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          ) : (
            <p>Minst två analyser behövs för att kunna jämföra förändringar.</p>
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
      </div>
      {analysisHistory.length > 0 && (
        <>
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
              visibleAnalysisHistory.map((analysis) => (
                <article key={analysis.createdAt}>
                  <span className="body-analysis-timeline-dot" />
                  <div className="body-analysis-timeline-content">
                    <div className="body-analysis-timeline-heading">
                      <strong>{formatAnalysisDate(analysis.createdAt)}</strong>
                      {analysis.createdAt === analysisHistory[0]?.createdAt && (
                        <span className="progress-photo-view-badge">
                          Senaste
                        </span>
                      )}
                    </div>
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
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setSavedAnalysis(analysis)}
                    >
                      Visa analys
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="progress-photo-safety">
                Inga analyser finns i den valda perioden.
              </p>
            )}
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={handleClearHistory}
          >
            Rensa analys-historik
          </button>
        </>
      )}
    </div>
  )
}

export default BodyAnalysisCard
