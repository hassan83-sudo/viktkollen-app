import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCallback } from 'react'

import {
  bodyAnalysisViews,
  canCompleteBodyAnalysisScan,
  defaultBodyScanFacingMode,
  estimateLightQualityFromImageData,
  getBodyAnalysisView,
  getBodyScanFacingLabel,
  getBodyScanProgress,
  getBodyScanStepState,
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  getCompletedBodyAnalysisViews,
  getNextBodyAnalysisViewKey,
  getNextBodyScanFacingMode,
  scrollBodyScanCameraIntoView,
  stopMediaStream,
} from '../services/bodyAnalysisGuidedScan'
import { canUseHardwareZoom, clampVideoScanZoom, getTrackZoomCapabilities, videoScanZoomStep } from '../services/bodyAnalysisVideoScan'

function BodyAnalysisUploader({
  canAnalyze,
  currentAnalysisStatus,
  disabledReason,
  photos,
  onAnalyze,
  onPhotoChange,
}) {
  const { t } = useTranslation(['bodyScan', 'common'])
  const [activeViewKey, setActiveViewKey] = useState('front')
  const [cameraStatus, setCameraStatus] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [facingMode, setFacingMode] = useState(defaultBodyScanFacingMode)
  const [lightQuality, setLightQuality] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [zoomMode, setZoomMode] = useState('preview')
  const captureSectionRef = useRef(null)
  const cameraBoxRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const fileInputRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const activeView = getBodyAnalysisView(activeViewKey)
  const completedViews = getCompletedBodyAnalysisViews(photos)
  const progress = getBodyScanProgress(photos)
  const hasCameraApi =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const canFinishScan = canCompleteBodyAnalysisScan(photos)
  const isCountingDown = countdown !== null
  const autoStartRef = useRef(false)
  const cameraRequestRef = useRef(0)

  useEffect(() => () => {
    cameraRequestRef.current += 1
    window.clearTimeout(countdownTimerRef.current)
    stopMediaStream(streamRef.current)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || !cameraActive) return
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    video.play?.().catch(() => {})
  }, [activeViewKey, cameraActive])

  function stopCamera(message = t('uploader.cameraStopped')) {
    window.clearTimeout(countdownTimerRef.current)
    countdownTimerRef.current = null
    setCountdown(null)
    stopMediaStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setCameraStatus(message)
  }

  function stopCountdown() {
    window.clearTimeout(countdownTimerRef.current)
    countdownTimerRef.current = null
    setCountdown(null)
    setCameraStatus(t('uploader.countdownCancelled'))
  }

  async function changeZoom(nextZoom) {
    const zoomValue = clampVideoScanZoom(nextZoom)
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (canUseHardwareZoom(track)) {
      try {
        const capabilities = getTrackZoomCapabilities(track)
        await track.applyConstraints({
          advanced: [{ zoom: Math.min(capabilities.max, Math.max(capabilities.min, zoomValue)) }],
        })
        setZoomMode('hardware')
      } catch {
        setZoomMode('preview')
      }
    } else {
      setZoomMode('preview')
    }
    setZoom(zoomValue)
  }

  function moveToNextView(nextPhotos) {
    setActiveViewKey(getNextBodyAnalysisViewKey(activeViewKey, nextPhotos))
  }

  function focusCaptureArea() {
    const scroll = () => {
      const node = captureSectionRef.current || cameraBoxRef.current
      scrollBodyScanCameraIntoView(node)
    }

    window.requestAnimationFrame(() => {
      scroll()
      window.setTimeout(scroll, 80)
    })
  }

  const startCamera = useCallback(async (viewKey = activeViewKey, nextFacingMode = facingMode) => {
    const view = getBodyAnalysisView(viewKey)
    if (!hasCameraApi) {
      setCameraStatus(t('uploader.noLiveCamera'))
      return false
    }

    try {
      const requestId = cameraRequestRef.current + 1
      cameraRequestRef.current = requestId
      stopMediaStream(streamRef.current)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null

      const stream = await navigator.mediaDevices.getUserMedia(
        getBodyScanVideoConstraints(nextFacingMode),
      )
      if (requestId !== cameraRequestRef.current) {
        stopMediaStream(stream)
        return false
      }
      streamRef.current = stream
      setFacingMode(nextFacingMode)
      setCameraActive(true)
      const track = stream.getVideoTracks?.()[0]
      const nextZoomMode = canUseHardwareZoom(track) ? 'hardware' : 'preview'
      setZoomMode(nextZoomMode)
      if (nextZoomMode === 'hardware') {
        const capabilities = getTrackZoomCapabilities(track)
        await track.applyConstraints({
          advanced: [{ zoom: Math.min(capabilities.max, Math.max(capabilities.min, zoom)) }],
        }).catch(() => setZoomMode('preview'))
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play?.()
      }

      setCameraStatus(t('uploader.cameraReady', { label: view.label.toLowerCase() }))
      return true
    } catch (error) {
      setCameraActive(false)
      setCameraStatus(getCameraPermissionMessage(error))
      return false
    }
  }, [activeViewKey, facingMode, hasCameraApi, t, zoom])

  useEffect(() => {
    if (autoStartRef.current) return undefined
    autoStartRef.current = true
    startCamera()
    return undefined
  }, [startCamera])

  async function flipCamera() {
    const nextFacingMode = getNextBodyScanFacingMode(facingMode)
    await startCamera(activeViewKey, nextFacingMode)
  }

  function activateAngle(viewKey, { retake = false } = {}) {
    const view = getBodyAnalysisView(viewKey)
    setActiveViewKey(viewKey)
    if (retake) {
      onPhotoChange(null, viewKey)
    }
    setCameraStatus(
      retake
        ? t('uploader.retakeAngle', { label: view.label.toLowerCase() })
        : t('uploader.selectedAngle', { label: view.label }),
    )
    focusCaptureArea()
    startCamera(viewKey)
  }

  function handleFileChange(event, viewKey) {
    const file = event.target.files?.[0]
    if (!file) return

    onPhotoChange(file, viewKey)
    moveToNextView({ ...photos, [viewKey]: true })
    event.target.value = ''
  }

  function updateLightQuality() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setLightQuality({
        level: 'unknown',
        status: 'neutral',
        text: t('uploader.lightPending'),
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
    const capturedView = getBodyAnalysisView(capturedViewKey)

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraStatus(t('uploader.frameNotReady'))
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraStatus(t('uploader.saveFailed'))
        return
      }

      const file = new File([blob], 'body-scan-' + capturedViewKey + '.jpg', {
        type: 'image/jpeg',
      })

      onPhotoChange(file, capturedViewKey, canvas.toDataURL('image/jpeg', 0.88))
      moveToNextView({ ...photos, [capturedViewKey]: true })
      setCountdown(null)
      setCameraStatus(t('uploader.doneNextReady', { doneLabel: capturedView.doneLabel }))
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
    if (!cameraActive) {
      setCameraStatus(t('uploader.startOrChoose'))
      return
    }
    updateLightQuality()
    setCameraStatus(t('uploader.takePlace', { label: activeView.label.toLowerCase() }))
    tickCountdown(3)
  }

  return (
    <>
      <section className="body-scan-flow" aria-labelledby="body-scan-step-title">
        <div className="body-scan-step-heading">
          <div>
            <p className="eyebrow">{bodyAnalysisViews.findIndex((view) => view.key === activeViewKey) + 1}/3</p>
            <h3 id="body-scan-step-title">{activeView.label}</h3>
          </div>
          <span>{progress.label} {t('doneSuffix')}</span>
        </div>

        <div className="body-scan-capture" id="body-scan-capture" ref={captureSectionRef}>
          <p className="body-scan-live-hint">{activeView.poseTips[0]} {t('frameHint')}</p>
          <div className="body-scan-camera" id="body-scan-camera" ref={cameraBoxRef}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label={t('cameraPreviewAria')}
              style={{ transform: zoomMode === 'preview' ? `scale(${zoom})` : undefined }}
            />
            <canvas ref={canvasRef} aria-hidden="true" />
            <div className="body-scan-silhouette" aria-hidden="true">
              <span className="body-scan-silhouette-head" />
              <span className="body-scan-silhouette-shoulders" />
              <span className="body-scan-silhouette-body" />
              <span className="body-scan-silhouette-feet" />
              <span className="body-scan-silhouette-center" />
            </div>
            {countdown !== null && (
              <div className="body-scan-countdown" aria-live="assertive">
                {countdown > 0 ? countdown : '📸'}
              </div>
            )}
          </div>

          <div className="body-scan-camera-controls">
            <button
              className="secondary-button"
              type="button"
              onClick={() => (cameraActive ? stopCamera() : startCamera())}
            >
              {cameraActive ? t('stopCamera') : t('startCamera')}
            </button>
            <button
              aria-label={t('flipCamera')}
              className="secondary-button"
              type="button"
              onClick={flipCamera}
            >
              {t('flipCamera')}
            </button>
            <button
              className="body-scan-capture-button"
              type="button"
              onClick={startCountdown}
              disabled={isCountingDown}
            >
              {t('standInFrame')}
            </button>
            <label className="secondary-button body-scan-file-picker" htmlFor={'body-scan-file-' + activeViewKey}>
              {t('chooseImage')}
              <input
                id={'body-scan-file-' + activeViewKey}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label={t('chooseImageAria', { label: activeView.label.toLowerCase() })}
                onChange={(event) => handleFileChange(event, activeViewKey)}
              />
            </label>
          </div>
          {isCountingDown && (
            <button className="secondary-button" type="button" onClick={stopCountdown}>
              {t('cancelCountdown')}
            </button>
          )}
          <p className="body-scan-facing" aria-live="polite">{getBodyScanFacingLabel(facingMode)}</p>
          <div className="body-scan-zoom" aria-label={t('zoom')}>
            <button className="secondary-button" type="button" onClick={() => changeZoom(zoom - videoScanZoomStep)}>-</button>
            <span>{Number(zoom).toFixed(1)}×</span>
            <button className="secondary-button" type="button" onClick={() => changeZoom(zoom + videoScanZoomStep)}>+</button>
          </div>
        </div>

        <div className="body-scan-steps" aria-label={t('anglesAria')}>
          {bodyAnalysisViews.map((view, index) => {
            const stepState = getBodyScanStepState(view.key, activeViewKey, photos)
            return (
              <button
                aria-current={view.key === activeViewKey ? 'step' : undefined}
                aria-label={t('uploader.openScanAria', { label: view.label })}
                className={'body-scan-step is-' + stepState + (view.key === activeViewKey ? ' is-active' : '')}
                data-state={stepState}
                key={view.key}
                type="button"
                onClick={() => activateAngle(view.key)}
              >
                <span>{t('uploader.step', { n: index + 1 })}</span>
                <strong>{view.label}</strong>
                <small>
                  {photos[view.key]
                    ? ('✓ ' + view.doneLabel)
                    : view.key === activeViewKey
                      ? t('uploader.active')
                      : t('uploader.waiting')}
                </small>
              </button>
            )
          })}
        </div>

        {cameraStatus && <p className="analysis-status" aria-live="polite">{cameraStatus}</p>}
        {lightQuality && (
          <p className={'body-scan-light is-' + lightQuality.status} aria-live="polite">
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
                <img
                  src={photo.preview}
                  alt={t('uploader.selectedImageAlt', { label: view.label.toLowerCase() })}
                />
                <figcaption>
                  {view.doneLabel}: {photo.name}
                  <button
                    aria-label={t('uploader.retakeAria', { label: view.label })}
                    className="secondary-button"
                    type="button"
                    onClick={() => activateAngle(view.key, { retake: true })}
                  >
                    {t('uploader.retake')}
                  </button>
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}

      <button
        className="body-scan-analyze"
        type="button"
        aria-label={t('uploader.analyzeAria')}
        onClick={onAnalyze}
        disabled={!canAnalyze || !canFinishScan}
      >
        {t('uploader.analyze')}
      </button>
      <p className="analysis-status" aria-live="polite">{currentAnalysisStatus}</p>
      {disabledReason && (
        <p className="progress-photo-safety">{disabledReason}</p>
      )}
    </>
  )
}

export default BodyAnalysisUploader
