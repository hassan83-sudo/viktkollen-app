import { useState } from 'react'

function BodyAnalysisCard() {
  const [frontPhoto, setFrontPhoto] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [mockResult, setMockResult] = useState(null)
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
        setMockResult(null)
        return
      }

      setSidePhoto(photo)
      setMockResult(null)
    })
    reader.readAsDataURL(file)
  }

  function handleAnalyzeBody() {
    if (!frontPhoto || !sidePhoto || isAnalyzing) {
      return
    }

    setIsAnalyzing(true)
    setMockResult(null)

    window.setTimeout(() => {
      setMockResult({
        bodyFat: '~24 %',
        muscleMass: 'Normal',
        posture: 'Bra',
        waistTrend: 'Följs över tid',
      })
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
      {mockResult && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Mock-resultat</p>
              <h3>Kroppsanalys</h3>
            </div>
            <span>Ej AI ännu</span>
          </div>
          <dl>
            <div>
              <dt>Kroppsfett</dt>
              <dd>{mockResult.bodyFat}</dd>
            </div>
            <div>
              <dt>Muskelmassa</dt>
              <dd>{mockResult.muscleMass}</dd>
            </div>
            <div>
              <dt>Hållning</dt>
              <dd>{mockResult.posture}</dd>
            </div>
            <div>
              <dt>Midjeutveckling</dt>
              <dd>{mockResult.waistTrend}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}

export default BodyAnalysisCard
