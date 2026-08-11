import { useEffect, useRef, useState } from 'react'

import {
  bodyAnalysisViews,
  canCompleteBodyAnalysisScan,
  estimateLightQualityFromImageData,
  getBodyAnalysisView,
  getCompletedBodyAnalysisViews,
  getNextBodyAnalysisViewKey,
} from '../services/bodyAnalysisGuidedScan'

function BodyAnalysisUploader({
  canAnalyze,
  currentAnalysisStatus,
  disabledReason,
  photos,
  onAnalyze,
  onPhotoChange,
}) {
  const [activeViewKey, setActiveViewKey] = useState('front')
  const [cameraStatus, setCameraStatus] = useState('')
  const [countdown, setCountdown] = useState(null)
  const [lightQuality, setLightQuality] = useState(null)
  const countdownTimerRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const activeView = getBodyAnalysisView(activeViewKey)
  const completedViews = getCompletedBodyAnalysisViews(photos)
  const hasCameraApi =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const canFinishScan = canCompleteBodyAnalysisScan(photos)
  const isCountingDown = countdown !== null

  useEffect(() => () => {
    window.clearTimeout(countdownTimerRef.current)
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
  }, [])

  function stopCountdown() {
    window.clearTimeout(countdownTimerRef.current)
    countdownTimerRef.current = null
    setCountdown(null)
    setCameraStatus('Nedräkningen avbröts.')
  }

  function moveToNextView(nextPhotos) {
    setActiveViewKey(getNextBodyAnalysisViewKey(activeViewKey, nextPhotos))
  }

  function handleFileChange(event, viewKey) {
    const file = event.target.files?.[0]

    if (!file) return

    onPhotoChange(file, viewKey)
    moveToNextView({ ...photos, [viewKey]: true })
    event.target.value = ''
  }

  async function startCamera() {
    if (!hasCameraApi) {
      setCameraStatus('Kameran stöds inte i den här webbläsaren. Välj bild från mobilen i stället.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      })
      streamRef.current?.getTracks?.().forEach((track) => track.stop())
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play?.()
      }

      setCameraStatus('Kameran är redo.')
    } catch {
      setCameraStatus('Kameran kunde inte starta. Kontrollera behörighet eller välj bild från mobilen.')
    }
  }

  function updateLightQuality() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setLightQuality({
        level: 'unknown',
        status: 'neutral',
        text: 'Ljuset mäts när kamerabilden är redo.',
      })
      return
    }

    const context = canvas.getContext('2d', { willReadFrequently: true })
    const width = 48
    const height = 64

    canvas.width = width
    canvas.height = height
    context.drawImage(video, 0, 0, width, height)
    setLightQuality(estimateLightQualityFromImageData(context.getImageData(0, 0, width, height)))
  }

  function captureCurrentFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    const capturedViewKey = activeViewKey
    const capturedView = activeView

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraStatus('Kamerabilden är inte redo ännu.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraStatus('Bilden kunde inte sparas. Försök igen.')
        return
      }

      const file = new File([blob], `body-scan-${capturedViewKey}.jpg`, {
        type: 'image/jpeg',
      })

      onPhotoChange(file, capturedViewKey, canvas.toDataURL('image/jpeg', 0.88))
      moveToNextView({ ...photos, [capturedViewKey]: true })
      setCountdown(null)
      setCameraStatus(`${capturedView.doneLabel}.`)
    }, 'image/jpeg', 0.88)
  }

  function tickCountdown(nextValue) {
    setCountdown(nextValue)

    if (nextValue === 0) {
      captureCurrentFrame()
      return
    }

    countdownTimerRef.current = window.setTimeout(() => tickCountdown(nextValue - 1), 1000)
  }

  function startCountdown() {
    if (isCountingDown) return
    updateLightQuality()
    setCameraStatus(`Ta plats för ${activeView.label.toLowerCase()}.`)
    tickCountdown(3)
  }

  return (
    <>
      <section className="body-scan-flow" aria-labelledby="body-scan-step-title">
        <div className="body-scan-step-heading">
          <div>
            <p className="eyebrow">Steg {bodyAnalysisViews.findIndex((view) => view.key === activeViewKey) + 1} av 3</p>
            <h3 id="body-scan-step-title">{activeView.label}</h3>
          </div>
          <span>{completedViews.length}/3 klara</span>
        </div>

        <div className="body-scan-steps" aria-label="Bildvinklar">
          {bodyAnalysisViews.map((view, index) => (
            <button
              className={view.key === activeViewKey ? 'is-active' : ''}
              key={view.key}
              type="button"
              onClick={() => setActiveViewKey(view.key)}
            >
              <span>Steg {index + 1}</span>
              <strong>{view.label}</strong>
              <small>{photos[view.key] ? `✓ ${view.doneLabel}` : 'Väntar'}</small>
            </button>
          ))}
        </div>

        <div className="body-scan-guide">
          <div>
            <p className="eyebrow">Pose-guide</p>
            <ul>
              {activeView.poseTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
          <p>
            Placera mobilen så att hela kroppen syns från huvud till fötter.
            Ställ kameran ungefär i midje-/brösthöjd, gärna 1,5-3 meter bort.
          </p>
        </div>

        <div className="body-scan-camera">
          <video ref={videoRef} playsInline muted aria-label="Kameraförhandsvisning för body scan" />
          <canvas ref={canvasRef} aria-hidden="true" />
          {countdown !== null && (
            <div className="body-scan-countdown" aria-live="assertive">
              {countdown > 0 ? countdown : '📸'}
            </div>
          )}
        </div>

        <div className="body-analysis-filter">
          <button className="secondary-button" type="button" onClick={startCamera}>
            Starta kamera
          </button>
          <button type="button" onClick={startCountdown} disabled={isCountingDown}>
            Ta bild
          </button>
          {isCountingDown && (
            <button className="secondary-button" type="button" onClick={stopCountdown}>
              Avbryt nedräkning
            </button>
          )}
          <label className="secondary-button">
            Välj bild
            <input
              type="file"
              accept="image/*"
              capture="user"
              aria-label={`Välj bild ${activeView.label.toLowerCase()} för AI-kroppsanalys`}
              onChange={(event) => handleFileChange(event, activeViewKey)}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {cameraStatus && <p className="analysis-status" aria-live="polite">{cameraStatus}</p>}
        {lightQuality && (
          <p className={`body-scan-light is-${lightQuality.status}`} aria-live="polite">
            {lightQuality.text}
          </p>
        )}
      </section>

      {completedViews.length > 0 && (
        <div className="progress-photo-ai-images is-three-angle">
          {bodyAnalysisViews.map((view) => {
            const photo = photos[view.key]

            if (!photo) return null

            return (
              <figure key={view.key}>
                <img src={photo.preview} alt={`Vald bild ${view.label.toLowerCase()}`} />
                <figcaption>
                  {view.doneLabel}: {photo.name}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setActiveViewKey(view.key)}
                  >
                    Ta om
                  </button>
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}

      <button
        type="button"
        aria-label="Starta AI-kroppsanalys med tre valda vinklar"
        onClick={onAnalyze}
        disabled={!canAnalyze || !canFinishScan}
      >
        Analysera kroppen
      </button>
      <p className="analysis-status" aria-live="polite">{currentAnalysisStatus}</p>
      {disabledReason && (
        <p className="progress-photo-safety">{disabledReason}</p>
      )}
    </>
  )
}

export default BodyAnalysisUploader
