import { useEffect, useReducer, useRef, useState } from 'react'

import {
  defaultBodyScanFacingMode,
  getBodyScanFacingLabel,
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  getNextBodyScanFacingMode,
  stopMediaStream,
} from '../services/bodyAnalysisGuidedScan'
import {
  applyFaceProtectionToCanvas,
  canvasToScanFile,
  cancelVideoScanSpeech,
  canUseHardwareZoom,
  clampVideoScanZoom,
  detectFacesLocally,
  drawVideoFrameToCanvas,
  getFaceProtectionOutcome,
  getTrackZoomCapabilities,
  getVideoScanCameraIndicator,
  getVideoScanDirection,
  getVideoScanInstruction,
  getVoiceLineForPhase,
  initialVideoScanState,
  isCapturePhase,
  isCountdownPhase,
  maxVideoScanZoom,
  minVideoScanZoom,
  reduceVideoScan,
  shouldBlockAnalysisForFaceProtection,
  speakVideoScanLine,
  videoScanCountdownStepMs,
  videoScanDoneDelayMs,
  videoScanTurnDelayMs,
  videoScanZoomStep,
} from '../services/bodyAnalysisVideoScan'

const faceModeOptions = [
  { label: 'Automatisk mask', value: 'auto' },
  { label: 'Blur', value: 'blur' },
  { label: 'Pixelera', value: 'pixelate' },
  { label: 'Ingen mask', value: 'none' },
]

function BodyAnalysisVideoScanner({
  canAnalyze,
  disabledReason = '',
  photos,
  onAnalyze,
  onPhotoChange,
}) {
  const [state, dispatch] = useReducer(reduceVideoScan, initialVideoScanState)
  const [status, setStatus] = useState('')
  const canvasRef = useRef(null)
  const capturingLockRef = useRef(false)
  const previewUrlsRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const videoRef = useRef(null)
  const indicator = getVideoScanCameraIndicator(state.phase, state.cameraActive)
  const direction = getVideoScanDirection(state.phase)
  const instruction = getVideoScanInstruction(state.phase)
  const analysisBlocked = shouldBlockAnalysisForFaceProtection(state.faceMode, state.faceStatus)
  const previewScale = state.zoomMode === 'hardware' ? 1 : state.zoom
  const active = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'

  function clearTimers() {
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function revokePreviews() {
    previewUrlsRef.current.forEach((url) => {
      if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
    })
    previewUrlsRef.current = []
  }

  function speak(phase = state.phase, countdown = state.countdown) {
    speakVideoScanLine(getVoiceLineForPhase(phase, countdown), { enabled: state.voiceEnabled })
  }

  async function applyZoomToTrack(zoom, track) {
    const capabilities = getTrackZoomCapabilities(track)
    if (!capabilities) {
      dispatch({ type: 'SET_ZOOM', zoom, zoomMode: 'preview' })
      setStatus('Förhandsvisningen förstoras. Hela kamerabilden används vid fångst.')
      return
    }

    try {
      await track.applyConstraints({
        advanced: [{ zoom: Math.min(capabilities.max, Math.max(capabilities.min, zoom)) }],
      })
      dispatch({ type: 'SET_ZOOM', zoom, zoomMode: 'hardware' })
    } catch {
      dispatch({ type: 'SET_ZOOM', zoom, zoomMode: 'preview' })
      setStatus('Hårdvaruzoom saknas. Förhandsvisningen förstoras, men hela bilden fångas.')
    }
  }

  function stopStream() {
    stopMediaStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function startStream(nextFacingMode = state.facingMode) {
    if (!navigator.mediaDevices?.getUserMedia || window.isSecureContext !== true) {
      dispatch({
        type: 'CAMERA_ERROR',
        message: 'Livekamera kräver HTTPS eller localhost. Använd Foto & kamera som alternativ.',
      })
      return false
    }

    try {
      if (capturingLockRef.current) return false
      stopMediaStream(streamRef.current)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null

      const stream = await navigator.mediaDevices.getUserMedia(
        getBodyScanVideoConstraints(nextFacingMode),
      )
      streamRef.current = stream
      dispatch({ type: 'SET_FACING', facingMode: nextFacingMode })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play?.()
      }
      const track = stream.getVideoTracks?.()[0]
      const zoomMode = canUseHardwareZoom(track) ? 'hardware' : 'preview'
      dispatch({ type: 'SET_ZOOM', zoom: state.zoom, zoomMode })
      if (zoomMode === 'hardware') await applyZoomToTrack(state.zoom, track)
      dispatch({ type: 'CAMERA_READY' })
      setStatus('')
      return true
    } catch (error) {
      dispatch({ type: 'CAMERA_ERROR', message: getCameraPermissionMessage(error) })
      return false
    }
  }

  async function capturePose(pose) {
    if (capturingLockRef.current) return
    capturingLockRef.current = true
    const video = videoRef.current
    const canvas = canvasRef.current

    try {
      if (!drawVideoFrameToCanvas(video, canvas)) {
        setStatus('Kamerabilden är inte redo ännu.')
        capturingLockRef.current = false
        return
      }

      const faces = await detectFacesLocally(canvas)
      const outcome = applyFaceProtectionToCanvas(canvas, { faces, mode: state.faceMode })
      const file = await canvasToScanFile(canvas, pose)
      const preview = canvas.toDataURL('image/jpeg', 0.88)
      onPhotoChange(file, pose, preview)
      dispatch({ type: 'POSE_CAPTURED', faceStatus: outcome.status, pose })
      speak(`${pose}_done`)
      timerRef.current = window.setTimeout(() => dispatch({ type: 'ADVANCE' }), videoScanDoneDelayMs)
    } catch {
      dispatch({ type: 'CAMERA_ERROR', message: 'Posen kunde inte fångas. Försök igen.' })
    } finally {
      capturingLockRef.current = false
    }
  }

  useEffect(() => () => {
    clearTimers()
    cancelVideoScanSpeech()
    stopStream()
    revokePreviews()
  }, [])

  useEffect(() => {
    if (state.phase === 'front_prepare' || state.phase === 'side_prepare' || state.phase === 'back_prepare') {
      speak(state.phase)
    }
    if (state.phase === 'side_prepare' || state.phase === 'back_prepare') {
      clearTimers()
      timerRef.current = window.setTimeout(() => {
        dispatch({ type: 'BEGIN_COUNTDOWN', pose: state.pose })
      }, videoScanTurnDelayMs)
      return clearTimers
    }
    return undefined
  }, [state.phase])

  useEffect(() => {
    if (!isCountdownPhase(state.phase) || state.countdown === null) return undefined
    speak(state.phase, state.countdown)
    timerRef.current = window.setTimeout(() => dispatch({ type: 'TICK_COUNTDOWN' }), videoScanCountdownStepMs)
    return clearTimers
  }, [state.phase, state.countdown])

  useEffect(() => {
    if (isCapturePhase(state.phase) && state.pose) {
      capturePose(state.pose)
    }
  }, [state.phase])

  async function handleStart() {
    dispatch({ type: 'START' })
    speak('prepare')
    await startStream(state.facingMode || defaultBodyScanFacingMode)
  }

  function handleReady() {
    dispatch({ type: 'BEGIN_COUNTDOWN', pose: state.pose || 'front' })
  }

  async function handleFlip() {
    if (capturingLockRef.current || isCapturePhase(state.phase)) return
    await startStream(getNextBodyScanFacingMode(state.facingMode))
  }

  function handleZoom(nextZoom) {
    applyZoomToTrack(clampVideoScanZoom(nextZoom), streamRef.current?.getVideoTracks?.()[0])
  }

  function handleCancel() {
    clearTimers()
    cancelVideoScanSpeech()
    stopStream()
    dispatch({ type: 'CANCEL' })
    setStatus('Scanningen avbröts.')
  }

  function handleRetakeAll() {
    clearTimers()
    cancelVideoScanSpeech()
    ;['front', 'side', 'back'].forEach((pose) => onPhotoChange(null, pose))
    revokePreviews()
    dispatch({ type: 'RETAKE_ALL' })
  }

  function handleRetakePose(pose) {
    clearTimers()
    onPhotoChange(null, pose)
    dispatch({ type: 'RETAKE_POSE', pose })
  }

  function handleDeleteScan() {
    handleRetakeAll()
    handleCancel()
    setStatus('Scanningen raderades lokalt.')
  }

  const faceStatusText = state.faceStatus === 'applied'
    ? 'Ansiktsskydd aktivt ✓'
    : state.faceStatus === 'unavailable'
      ? 'Ansiktsskydd kunde inte appliceras. Materialet skickas inte förrän du väljer blur, pixelera, ingen mask eller tar om posen.'
      : state.faceStatus === 'approximate'
        ? getFaceProtectionOutcome(state.faceMode, []).label
        : 'Ansiktsskydd väntar på första fångsten.'

  return (
    <section className="body-scan-section body-scan-video" aria-labelledby="body-scan-video-title">
      <div className="body-scan-section-heading">
        <div>
          <p className="eyebrow">Rekommenderad</p>
          <h3 id="body-scan-video-title">🎥 Videoscanning</h3>
        </div>
        <span>Guidat flöde</span>
      </div>
      <p>
        Ett sammanhängande scan: framifrån, höger sida och bakifrån. Appen extraherar tre bilder
        och använder samma analys som Foto & kamera. Originalvideo sparas inte.
      </p>

      {(state.phase === 'idle' || state.phase === 'error') && (
        <button type="button" onClick={handleStart}>
          Starta videoscanning
        </button>
      )}

      {active && (
        <div className="body-scan-video-stage" id="body-scan-video-stage">
          <div className={`body-scan-camera-indicator is-${indicator.kind}`} aria-live="polite">
            <span aria-hidden="true">●</span> {indicator.label}
            {isCountdownPhase(state.phase) || isCapturePhase(state.phase) ? '' : ' · Förbereder...'}
          </div>
          <p className="body-scan-video-instruction">{instruction}</p>
          {direction && (
            <p className="body-scan-video-direction" aria-live="polite">
              <strong>{direction.label}</strong>
              <span aria-hidden="true">{direction.arrow}</span>
            </p>
          )}
          <div className="body-scan-video-frame">
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Helkroppsförhandsvisning för videoscanning"
              style={{ transform: `scale(${previewScale})` }}
            />
            <canvas ref={canvasRef} aria-hidden="true" />
            <div className="body-scan-silhouette" aria-hidden="true" />
            {isCountdownPhase(state.phase) && (
              <div className="body-scan-countdown-overlay" aria-live="assertive">
                {state.countdown > 0 ? state.countdown : 'FÅNGAR...'}
              </div>
            )}
            {isCapturePhase(state.phase) && (
              <div className="body-scan-countdown-overlay is-capture" aria-live="assertive">
                FÅNGAR...
              </div>
            )}
          </div>
          <p className="progress-photo-safety">
            Placera hela kroppen i ramen. Huvud och fötter ska synas. Ansiktet behövs inte för kroppsscanningen.
          </p>
          <div className="body-scan-video-toolbar">
            <button className="secondary-button" type="button" onClick={handleFlip}>Vänd kamera</button>
            <div className="body-scan-zoom" aria-label="Zoom">
              <button className="secondary-button" type="button" onClick={() => handleZoom(state.zoom - videoScanZoomStep)}>-</button>
              <span>{Number(state.zoom).toFixed(1)}×</span>
              <button className="secondary-button" type="button" onClick={() => handleZoom(state.zoom + videoScanZoomStep)}>+</button>
            </div>
            <span>{getBodyScanFacingLabel(state.facingMode)}</span>
          </div>
          {state.phase === 'front_prepare' && (
            <button type="button" onClick={handleReady}>Jag står i ramen</button>
          )}
          <button className="secondary-button" type="button" onClick={handleCancel}>Avbryt scanning</button>
        </div>
      )}

      <fieldset className="body-scan-face-protection">
        <legend>Integritetsskydd</legend>
        <p>Ansiktet behövs inte för kroppsscanningen. För extra integritet kan du använda ansiktsmaskering eller täcka ansiktet fysiskt.</p>
        {faceModeOptions.map((mode) => (
          <label key={mode.value}>
            <input
              checked={state.faceMode === mode.value}
              name="body-scan-face-mode"
              type="radio"
              value={mode.value}
              onChange={() => dispatch({ type: 'SET_FACE_MODE', mode: mode.value })}
            />
            {mode.label}
          </label>
        ))}
        <p className="body-scan-face-status" aria-live="polite">{faceStatusText}</p>
        <p className="progress-photo-safety">
          Du kan också täcka ansiktet fysiskt om du vill att det inte ska finnas med i kameramaterialet.
        </p>
        <label>
          <input
            checked={state.voiceEnabled}
            type="checkbox"
            onChange={(event) => {
              if (!event.target.checked) cancelVideoScanSpeech()
              dispatch({ type: 'SET_VOICE', enabled: event.target.checked })
            }}
          />
          Röstguide
        </label>
      </fieldset>

      {state.phase === 'review' && (
        <div className="body-scan-video-review">
          <h4>Scanning klar ✓</h4>
          <ul>
            <li>Framifrån {photos.front ? '✓' : 'saknas'}</li>
            <li>Från sidan {photos.side ? '✓' : 'saknas'}</li>
            <li>Bakifrån {photos.back ? '✓' : 'saknas'}</li>
          </ul>
          <div className="progress-photo-ai-images is-three-angle">
            {['front', 'side', 'back'].map((pose) => (
              photos[pose] ? (
                <figure key={pose}>
                  <img src={photos[pose].preview} alt={`Videopose ${pose}`} />
                  <figcaption>
                    <button className="secondary-button" type="button" onClick={() => handleRetakePose(pose)}>
                      Ta om pose
                    </button>
                  </figcaption>
                </figure>
              ) : null
            ))}
          </div>
          <button type="button" onClick={onAnalyze} disabled={!canAnalyze || analysisBlocked}>
            Analysera kroppen
          </button>
          <button className="secondary-button" type="button" onClick={handleRetakeAll}>Ta om hela scanningen</button>
          <button className="secondary-button" type="button" onClick={handleDeleteScan}>Radera scanning</button>
          {analysisBlocked && <p className="progress-photo-safety">{faceStatusText}</p>}
        </div>
      )}

      {status && <p className="analysis-status" aria-live="polite">{status}</p>}
      {state.error && <p className="progress-photo-safety">{state.error}</p>}
      {disabledReason && <p className="progress-photo-safety">{disabledReason}</p>}
    </section>
  )
}

export default BodyAnalysisVideoScanner
