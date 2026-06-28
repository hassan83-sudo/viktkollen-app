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

function formatAnalysisDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function BodyAnalysisCard({ onAnalysisHistoryChange = () => {} }) {
  const [analysisHistory, setAnalysisHistory] = useState(() =>
    readStoredAnalyses(),
  )
  const [frontPhoto, setFrontPhoto] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [savedAnalysis, setSavedAnalysis] = useState(() => analysisHistory[0] ?? null)
  const [sidePhoto, setSidePhoto] = useState(null)
  const canAnalyze = Boolean(frontPhoto && sidePhoto) && !isAnalyzing

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
          <p className="report-heading">AI:s rekommendationer</p>
          <ul>
            {mockRecommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </div>
      )}
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
      {analysisHistory.length > 0 && (
        <div className="photo-timeline">
          {analysisHistory.map((analysis) => (
            <article key={analysis.createdAt}>
              <img
                src={analysis.frontPhoto.preview}
                alt="Miniatyr framifrån"
              />
              <img
                src={analysis.sidePhoto.preview}
                alt="Miniatyr från sidan"
              />
              <div>
                <strong>{formatAnalysisDate(analysis.createdAt)}</strong>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSavedAnalysis(analysis)}
                >
                  Visa analys
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default BodyAnalysisCard
