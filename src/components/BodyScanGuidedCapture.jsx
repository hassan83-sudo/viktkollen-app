import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  canCompleteBodyAnalysisScan,
  defaultBodyScanFacingMode,
  getBodyAnalysisView,
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  stopMediaStream,
} from '../services/bodyAnalysisGuidedScan'
import {
  canUseHardwareZoom,
  cancelVideoScanSpeech,
  canvasToScanFile,
  drawVideoFrameToCanvas,
  getTrackZoomCapabilities,
  speakVideoScanLine,
} from '../services/bodyAnalysisVideoScan'
import { setBodyScanSessionActive } from '../services/bodyScanSessionChrome'

const timerOptions = [3, 5, 10]
const zoomLevelCandidates = [0.5, 1, 2]
const captureOrder = ['front', 'side', 'back']

function formatZoomLabel(level) {
  return `${String(level).replace('.', ',')}×`
}

/**
 * Simplified guided body scan capture (5 steps: prepare, front, side, back,
 * review). Same props contract as the older BodyAnalysisUploader so it plugs
 * into BodyAnalysisCard's existing photo mode without touching the analyze
 * code: onPhotoChange(file, viewKey, previewDataUrl) reports each capture,
 * onAnalyze() is called once when the user presses "Analysera kroppen".
 */
function BodyScanGuidedCapture({
  canAnalyze,
  currentAnalysisStatus,
  disabledReason,
  photos,
  onAnalyze,
  onPhotoChange,
}) {
  const { t } = useTranslation(['bodyScan', 'common'])
  const [step, setStep] = useState('prepare')
  const [timerSeconds, setTimerSeconds] = useState(3)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [countdown, setCountdown] = useState(null)
  const [paused, setPaused] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [zoomLevels, setZoomLevels] = useState([1])
  const [zoomSupported, setZoomSupported] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const cameraRequestRef = useRef(0)
  const spokenStepRef = useRef('')
  const remainingSecondsRef = useRef(0)
  const pausedRef = useRef(false)
  const retakeTargetRef = useRef(null)
  const activePoseRef = useRef('front')
  const timerSecondsRef = useRef(timerSeconds)

  useEffect(() => {
    timerSecondsRef.current = timerSeconds
  }, [timerSeconds])

  const canFinishScan = canCompleteBodyAnalysisScan(photos)
  const hasCameraApi = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => () => {
    cameraRequestRef.current += 1
    window.clearTimeout(countdownTimerRef.current)
    stopMediaStream(streamRef.current)
    cancelVideoScanSpeech()
    setBodyScanSessionActive(false)
  }, [])

  useEffect(() => {
    setBodyScanSessionActive(cameraActive)
  }, [cameraActive])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) video.srcObject = stream
    video.play?.().catch(() => {})
  }, [cameraActive])

  function speakOnce(key, text) {
    if (spokenStepRef.current === key) return
    spokenStepRef.current = key
    speakVideoScanLine(text, { enabled: voiceEnabled })
  }

  function stopCountdown() {
    window.clearTimeout(countdownTimerRef.current)
    countdownTimerRef.current = null
  }

  function captureCurrentStep(pose) {
    stopCountdown()
    setCountdown(null)
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!drawVideoFrameToCanvas(video, canvas)) {
      setCameraError(t('bodyScan:guided.cameraOff'))
      return
    }
    const preview = canvas.toDataURL('image/jpeg', 0.88)
    canvasToScanFile(canvas, pose).then((file) => {
      onPhotoChange(file, pose, preview)
      advanceAfterCapture(pose)
    })
  }

  // The pose a running/paused countdown belongs to. setStep(...) only takes
  // effect on the next render, so the countdown loop must not read the
  // `step` state variable - it would still see the value from the render
  // that started the countdown (e.g. still 'front' right after entering
  // 'side'), capturing the wrong pose.
  function tickCountdown(remaining, pose) {
    remainingSecondsRef.current = remaining
    setCountdown(remaining)
    if (remaining <= 0) {
      captureCurrentStep(pose)
      return
    }
    countdownTimerRef.current = window.setTimeout(() => {
      if (pausedRef.current) return
      tickCountdown(remaining - 1, pose)
    }, 1000)
  }

  function beginCountdown(pose) {
    activePoseRef.current = pose
    pausedRef.current = false
    setPaused(false)
    tickCountdown(timerSecondsRef.current, pose)
  }

  function pauseOrResume() {
    if (paused) {
      pausedRef.current = false
      setPaused(false)
      tickCountdown(remainingSecondsRef.current, activePoseRef.current)
    } else {
      stopCountdown()
      pausedRef.current = true
      setPaused(true)
    }
  }

  function enterFront(isRetake) {
    setStep('front')
    if (isRetake) {
      spokenStepRef.current = 'retake-front'
      beginCountdown('front')
    } else {
      speakOnce('front', t('bodyScan:guided.voiceFront'))
    }
  }

  function enterSide() {
    setStep('side')
    speakOnce('side', t('bodyScan:guided.voiceSide'))
    beginCountdown('side')
  }

  function enterBack() {
    setStep('back')
    speakOnce('back', t('bodyScan:guided.voiceBack'))
    beginCountdown('back')
  }

  function advanceAfterCapture(pose) {
    if (retakeTargetRef.current) {
      retakeTargetRef.current = null
      stopMediaStream(streamRef.current)
      streamRef.current = null
      setCameraActive(false)
      setStep('review')
      return
    }
    const nextPose = captureOrder[captureOrder.indexOf(pose) + 1]
    if (nextPose === 'side') {
      enterSide()
      return
    }
    if (nextPose === 'back') {
      enterBack()
      return
    }
    stopMediaStream(streamRef.current)
    streamRef.current = null
    setCameraActive(false)
    setStep('review')
  }

  async function startCamera(targetStep = 'front', { isRetake = false } = {}) {
    if (!hasCameraApi) {
      setCameraError(t('bodyScan:guided.cameraOff'))
      return false
    }
    try {
      const requestId = cameraRequestRef.current + 1
      cameraRequestRef.current = requestId
      const stream = await navigator.mediaDevices.getUserMedia(
        getBodyScanVideoConstraints(defaultBodyScanFacingMode),
      )
      if (requestId !== cameraRequestRef.current) {
        stopMediaStream(stream)
        return false
      }
      streamRef.current = stream
      const track = stream.getVideoTracks?.()[0]
      const supported = canUseHardwareZoom(track)
      const capabilities = getTrackZoomCapabilities(track)
      const levels = supported
        ? zoomLevelCandidates.filter((level) => level >= capabilities.min && level <= capabilities.max)
        : []
      setZoomSupported(supported)
      setZoomLevels(levels.length ? levels : [1])
      setZoom(1)
      setCameraError('')
      setCameraActive(true)
      if (targetStep === 'side') enterSide()
      else if (targetStep === 'back') enterBack()
      else enterFront(isRetake)
      return true
    } catch (error) {
      setCameraActive(false)
      setCameraError(getCameraPermissionMessage(error))
      return false
    }
  }

  async function applyZoom(level) {
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!zoomSupported || !track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: level }] })
      setZoom(level)
    } catch {
      // A failed zoom request must never stop the camera - keep the previous level.
    }
  }

  function handleRetakeAll() {
    stopCountdown()
    setCountdown(null)
    stopMediaStream(streamRef.current)
    streamRef.current = null
    setCameraActive(false)
    spokenStepRef.current = ''
    captureOrder.forEach((pose) => onPhotoChange(null, pose))
    setStep('prepare')
  }

  function handleRetakeOne(pose) {
    retakeTargetRef.current = pose
    startCamera(pose, { isRetake: true })
  }

  const stepLabel = {
    prepare: t('bodyScan:guided.stepPrepare'),
    front: t('bodyScan:guided.stepFront'),
    side: t('bodyScan:guided.stepSide'),
    back: t('bodyScan:guided.stepBack'),
    review: t('bodyScan:guided.stepReview'),
  }[step]
  const isCountingDown = countdown !== null

  return (
    <div className="body-scan-guided" aria-labelledby="body-scan-guided-title">
      <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'none' }} />
      <div className="body-scan-guided-step-pill">{stepLabel}</div>

      {step === 'prepare' && (
        <section className="body-scan-guided-prepare">
          <h3 id="body-scan-guided-title">{t('bodyScan:guided.title')}</h3>
          <button
            aria-pressed={voiceEnabled}
            className="body-scan-guided-voice-toggle"
            type="button"
            onClick={() => {
              const next = !voiceEnabled
              setVoiceEnabled(next)
              if (!next) cancelVideoScanSpeech()
            }}
          >
            {voiceEnabled ? t('bodyScan:guided.voiceOn') : t('bodyScan:guided.voiceOff')}
          </button>
          <ul className="body-scan-guided-tips">
            <li>{t('bodyScan:guided.tipPlaceStable')}</li>
            <li>{t('bodyScan:guided.tipDistance')}</li>
            <li>{t('bodyScan:guided.tipBackUp')}</li>
          </ul>
          <div className="body-scan-guided-timer-select" role="group" aria-label={t('bodyScan:guided.timerLabel')}>
            {timerOptions.map((seconds) => (
              <button
                aria-pressed={timerSeconds === seconds}
                className={timerSeconds === seconds ? 'is-active' : 'secondary-button'}
                key={seconds}
                type="button"
                onClick={() => setTimerSeconds(seconds)}
              >
                {t('bodyScan:guided.timerOption', { seconds })}
              </button>
            ))}
          </div>
          {cameraError && <p className="analysis-status" role="alert">{cameraError}</p>}
          <button className="body-scan-guided-cta" type="button" onClick={() => startCamera('front')}>
            {t('bodyScan:guided.startCamera')}
          </button>
          <p className="body-scan-guided-hint">{t('bodyScan:guided.startCameraHint')}</p>
        </section>
      )}

      {(step === 'front' || step === 'side' || step === 'back') && (
        <section className="body-scan-guided-capture">
          <div className="body-scan-guided-voice-banner" aria-live="polite">
            {step === 'front' && t('bodyScan:guided.frontPrompt')}
            {step === 'side' && t('bodyScan:guided.voiceSide')}
            {step === 'back' && t('bodyScan:guided.voiceBack')}
          </div>
          {step === 'back' && <p className="body-scan-guided-instruction">{t('bodyScan:guided.backInstruction')}</p>}

          <div className="body-scan-guided-frame" role="img" aria-label={t('bodyScan:guided.framePlacementAria')}>
            <video ref={videoRef} playsInline muted autoPlay aria-hidden="true" />
            <span className="body-scan-guided-corner is-tl" aria-hidden="true" />
            <span className="body-scan-guided-corner is-tr" aria-hidden="true" />
            <span className="body-scan-guided-corner is-bl" aria-hidden="true" />
            <span className="body-scan-guided-corner is-br" aria-hidden="true" />
            {isCountingDown && (
              <div className="body-scan-guided-countdown" aria-live="assertive">
                {countdown > 0 ? countdown : '📸'}
              </div>
            )}
          </div>

          {zoomLevels.length > 1 && (
            <div className="body-scan-guided-zoom" aria-label={t('bodyScan:guided.zoomAria')}>
              {zoomLevels.map((level) => (
                <button
                  aria-pressed={zoom === level}
                  className={zoom === level ? 'is-active' : 'secondary-button'}
                  key={level}
                  type="button"
                  onClick={() => applyZoom(level)}
                >
                  {formatZoomLabel(level)}
                </button>
              ))}
            </div>
          )}

          <p className="body-scan-guided-timer-pill">{t('bodyScan:guided.timerPill', { seconds: timerSeconds })}</p>

          {step === 'front' && !isCountingDown && (
            <>
              <button className="body-scan-guided-cta" type="button" onClick={() => beginCountdown('front')}>
                {t('bodyScan:guided.startFirstPhoto')}
              </button>
              <p className="body-scan-guided-hint">{t('bodyScan:guided.startFirstPhotoHint')}</p>
              <button className="secondary-button" type="button" onClick={() => captureCurrentStep(step)}>
                {t('bodyScan:guided.takePhotoNow')}
              </button>
            </>
          )}

          {isCountingDown && (
            <>
              <button className="secondary-button" type="button" onClick={pauseOrResume}>
                {paused ? t('bodyScan:guided.resume') : t('bodyScan:guided.pause')}
              </button>
              <p className="body-scan-guided-hint">{t('bodyScan:guided.noButtonNeeded')}</p>
            </>
          )}

          {step === 'side' && !isCountingDown && !paused && (
            <p className="body-scan-guided-hint">{t('bodyScan:guided.sideAutoHint', { seconds: timerSeconds })}</p>
          )}
          {step === 'back' && !isCountingDown && !paused && (
            <p className="body-scan-guided-hint">{t('bodyScan:guided.backAutoHint', { seconds: timerSeconds })}</p>
          )}
          {cameraError && <p className="analysis-status" role="alert">{cameraError}</p>}
        </section>
      )}

      {step === 'review' && (
        <section className="body-scan-guided-review">
          <h3>{t('bodyScan:guided.reviewTitle')}</h3>
          <div className="body-scan-guided-thumbnails">
            {captureOrder.map((pose) => {
              const view = getBodyAnalysisView(pose)
              const photo = photos[pose]
              return (
                <figure key={pose}>
                  {photo?.preview ? (
                    <img alt={view.label} src={photo.preview} />
                  ) : (
                    <div className="body-scan-guided-thumb-missing" aria-hidden="true" />
                  )}
                  <figcaption>
                    <span>{view.label}</span>
                    <button
                      aria-label={t('bodyScan:guided.retakeOne', { label: view.label })}
                      className="secondary-button"
                      type="button"
                      onClick={() => handleRetakeOne(pose)}
                    >
                      {t('bodyScan:uploader.retake')}
                    </button>
                  </figcaption>
                </figure>
              )
            })}
          </div>
          <p className="body-scan-guided-timer-pill">{t('bodyScan:guided.timerPill', { seconds: timerSeconds })}</p>
          <button
            className="body-scan-guided-cta"
            type="button"
            aria-label={t('bodyScan:uploader.analyzeAria')}
            disabled={!canAnalyze || !canFinishScan}
            onClick={onAnalyze}
          >
            {t('bodyScan:uploader.analyze')}
          </button>
          <button className="secondary-button" type="button" onClick={handleRetakeAll}>
            {t('bodyScan:guided.retakeAll')}
          </button>
          <p className="body-scan-guided-hint">{t('bodyScan:guided.weightNote')}</p>
          {currentAnalysisStatus && <p className="analysis-status" aria-live="polite">{currentAnalysisStatus}</p>}
          {disabledReason && <p className="progress-photo-safety">{disabledReason}</p>}
        </section>
      )}
    </div>
  )
}

export default BodyScanGuidedCapture
