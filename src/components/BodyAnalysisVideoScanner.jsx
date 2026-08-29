import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  defaultBodyScanFacingMode,
  getBodyScanVideoConstraints,
  getBodyScanVideoConstraintsForDevice,
  getCameraPermissionMessage,
  getNextBodyScanFacingMode,
  listBodyScanCameras,
  shouldOfferCameraChoice,
  stopMediaStream,
} from '../services/bodyAnalysisGuidedScan'
import {
  applyFaceProtectionToCanvas,
  canvasToScanFile,
  cancelVideoScanSpeech,
  canUseHardwareZoom,
  clampMaskRect,
  clampVideoScanZoom,
  createPinchTracker,
  defaultManualFaceMask,
  detectFacesLocally,
  drawVideoFrameToCanvas,
  getBodyScanAnalysisBlockReason,
  getDefaultFaceProtectionMode,
  getFaceProtectionOutcome,
  getManualMaskBox,
  getTrackZoomCapabilities,
  getVideoContainRect,
  getVideoScanCameraIndicator,
  getVideoScanDirection,
  getVideoScanInstruction,
  getVideoScanPoseCopy,
  getVideoScanStepNumber,
  getVideoScanTurnInstruction,
  isSameContainRect,
  getVoiceLineForPhase,
  initialVideoScanState,
  isBodyScanSessionOpen,
  isCapturePhase,
  isCountdownPhase,
  isFaceDetectorSupported,
  isPreparePhase,
  prefersReducedMotion,
  reduceVideoScan,
  speakVideoScanLine,
  videoScanConsentPoints,
  videoScanCountdownStart,
  videoScanCountdownStepMs,
  videoScanDoneDelayMs,
  videoScanPreparationTips,
  videoScanTotalSteps,
  videoScanZoomStep,
} from '../services/bodyAnalysisVideoScan'
import {
  detectBodyPosition,
  getAutomaticBodyPositionSupport,
  getDefaultFramingMode,
} from '../services/bodyScanPositionDetector'
import { setBodyScanSessionActive } from '../services/bodyScanSessionChrome'
import { safeLogger } from '../services/safeLogger'

const BODY_SCAN_PORTAL_ID = 'vk-body-scan-portal'
let bodyScanPortalRoot = null

const faceModeOptions = [
  { label: 'Auto', value: 'auto' },
  { label: 'Blur', value: 'blur' },
  { label: 'Pixelera', value: 'pixelate' },
  { label: 'Täck', value: 'cover' },
  { label: 'Ingen', value: 'none' },
]

function getBodyScanPortalRoot() {
  if (typeof document === 'undefined' || !document.body) return null
  if (bodyScanPortalRoot?.isConnected) return bodyScanPortalRoot
  let root = document.getElementById(BODY_SCAN_PORTAL_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = BODY_SCAN_PORTAL_ID
    document.body.appendChild(root)
  }
  bodyScanPortalRoot = root
  return root
}

function renderBodyScanPortal(node) {
  const root = getBodyScanPortalRoot()
  if (!root) return node
  return createPortal(node, root)
}

function BodyAnalysisVideoScanner({
  analysisError = '',
  disabledReason = '',
  hasApprovedAnalysis = false,
  isFreeLimitReached = false,
  isAnalyzing = false,
  photos,
  onAnalyze,
  onPhotoChange,
}) {
  const autoSupport = getAutomaticBodyPositionSupport()
  const [state, dispatch] = useReducer(reduceVideoScan, {
    ...initialVideoScanState,
    autoFramingAvailable: autoSupport.available,
    faceMode: getDefaultFaceProtectionMode(),
    framingMode: getDefaultFramingMode(),
  })
  const [idleFramingMode, setIdleFramingMode] = useState(() => getDefaultFramingMode())
  const [maskRect, setMaskRect] = useState(defaultManualFaceMask)
  const [containRect, setContainRect] = useState({ height: 0, scale: 1, width: 0, x: 0, y: 0 })
  const [previewError, setPreviewError] = useState('')
  const [status, setStatus] = useState('')
  // Steps 1-3 run before getUserMedia is ever called.
  const [setupStep, setSetupStep] = useState(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const reducedMotion = prefersReducedMotion()
  const canvasRef = useRef(null)
  const capturingLockRef = useRef(false)
  const frameRef = useRef(null)
  const pinchTrackerRef = useRef(null)
  const previewUrlsRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const videoRef = useRef(null)
  const sawAnalyzingRef = useRef(false)
  const maskRectRef = useRef(maskRect)
  const faceModeRef = useRef(state.faceMode)
  const zoomHintShownRef = useRef(false)
  const zoomRef = useRef(state.zoom)
  const poseCopy = getVideoScanPoseCopy(state.pose || 'front')
  const previewScale = state.zoomMode === 'hardware' ? 1 : state.zoom
  const scanOpen = isBodyScanSessionOpen(state.phase)
  const setupOpen = setupStep !== null
  const sessionOpen = scanOpen || setupOpen
  const cameraActiveUi = scanOpen && state.phase !== 'review' && state.phase !== 'analyzing'
  const stepNumber = getVideoScanStepNumber(state.phase, setupStep)
  const cameraIndicator = getVideoScanCameraIndicator(state.phase, cameraActiveUi && state.cameraActive)
  const direction = getVideoScanDirection(state.phase)
  const turnInstruction = getVideoScanTurnInstruction(state.pose || 'front')
  // Screen readers get the countdown without a per-second flood when the user
  // has asked for reduced motion: then it is announced once at the start.
  const countdownAnnouncement = isCapturePhase(state.phase)
    ? 'Bilden tas nu.'
    : isCountdownPhase(state.phase)
      ? reducedMotion
        ? (state.countdown === videoScanCountdownStart ? 'Nedräkning startad. Bilden tas om tre sekunder.' : '')
        : `Nedräkning ${state.countdown}.`
      : ''
  const faceDetectorSupported = isFaceDetectorSupported()
  const showManualMask = state.faceMode === 'blur' || state.faceMode === 'pixelate' || state.faceMode === 'cover'

  function getStreamMetadata(stream = streamRef.current) {
    const track = stream?.getVideoTracks?.()[0] || null
    return {
      streamActive: Boolean(stream?.active),
      trackEnabled: track?.enabled ?? null,
      trackMuted: track?.muted ?? null,
      trackReadyState: track?.readyState || null,
      videoTracks: stream?.getVideoTracks?.().length || 0,
    }
  }

  function getVideoMetadata(video = videoRef.current) {
    return {
      autoplay: Boolean(video?.autoplay),
      muted: Boolean(video?.muted),
      paused: video?.paused ?? null,
      playsInline: Boolean(video?.playsInline),
      readyState: video?.readyState ?? null,
      srcObjectSet: Boolean(video?.srcObject),
      videoHeight: video?.videoHeight || 0,
      videoWidth: video?.videoWidth || 0,
    }
  }

  async function attachStreamToVideo(stream = streamRef.current, reason = 'attach') {
    const video = videoRef.current
    if (!stream || !video) return false

    video.autoplay = true
    video.playsInline = true
    video.muted = true
    if (video.srcObject !== stream) video.srcObject = stream

    safeLogger.info('body-scan-video-attach', {
      reason,
      stream: getStreamMetadata(stream),
      video: getVideoMetadata(video),
    })

    try {
      await video.play?.()
      setPreviewError('')
      safeLogger.info('body-scan-video-play', {
        ok: true,
        reason,
        stream: getStreamMetadata(stream),
        video: getVideoMetadata(video),
      })
      return true
    } catch (error) {
      safeLogger.warn('body-scan-video-play', {
        error,
        ok: false,
        reason,
        stream: getStreamMetadata(stream),
        video: getVideoMetadata(video),
      })
      setPreviewError('Kameran startade men förhandsvisningen kunde inte visas.')
      return false
    }
  }

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

  function speak(phase = state.phase, countdown = state.countdown, extra = {}) {
    speakVideoScanLine(getVoiceLineForPhase(phase, countdown, { framingMode: state.framingMode, ...extra }), {
      enabled: state.voiceEnabled,
    })
  }

  async function applyZoomToTrack(zoom, track) {
    const capabilities = getTrackZoomCapabilities(track)
    if (!capabilities) {
      dispatch({ type: 'SET_ZOOM', zoom, zoomMode: 'preview' })
      if (!zoomHintShownRef.current) {
        zoomHintShownRef.current = true
        setStatus('Digital förhandsvisningszoom. Hela kamerabilden används vid fångst.')
      }
      return
    }

    try {
      await track.applyConstraints({
        advanced: [{ zoom: Math.min(capabilities.max, Math.max(capabilities.min, zoom)) }],
      })
      dispatch({ type: 'SET_ZOOM', zoom, zoomMode: 'hardware' })
    } catch {
      dispatch({ type: 'SET_ZOOM', zoom, zoomMode: 'preview' })
      if (!zoomHintShownRef.current) {
        zoomHintShownRef.current = true
        setStatus('Hårdvaruzoom saknas. Digital förhandsvisningszoom används. Hela bilden fångas.')
      }
    }
  }

  function stopStream({ clearPreviewError = true } = {}) {
    stopMediaStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (clearPreviewError) setPreviewError('')
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
      const previousStream = streamRef.current

      // audio is always false: getBodyScanVideoConstraints* never request the microphone.
      const stream = await navigator.mediaDevices.getUserMedia(
        selectedCameraId
          ? getBodyScanVideoConstraintsForDevice(selectedCameraId, nextFacingMode)
          : getBodyScanVideoConstraints(nextFacingMode),
      )
      streamRef.current = stream
      dispatch({ type: 'SET_FACING', facingMode: nextFacingMode })
      const attached = await attachStreamToVideo(stream, previousStream ? 'switch-camera' : 'start')
      if (previousStream && previousStream !== stream) {
        stopMediaStream(previousStream)
      }
      const track = stream.getVideoTracks?.()[0]
      const zoomMode = canUseHardwareZoom(track) ? 'hardware' : 'preview'
      dispatch({ type: 'SET_ZOOM', zoom: 1, zoomMode })
      if (zoomMode === 'hardware') await applyZoomToTrack(1, track)
      dispatch({ type: 'CAMERA_READY' })
      setStatus(attached || !videoRef.current ? '' : 'Kameran startade men förhandsvisningen kunde inte visas.')
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

      const currentFaceMode = faceModeRef.current
      const showMask = currentFaceMode === 'blur' || currentFaceMode === 'pixelate' || currentFaceMode === 'cover'
      const faces = await detectFacesLocally(canvas)
      const outcome = applyFaceProtectionToCanvas(canvas, {
        faceDetectorSupported,
        faces,
        maskBox: showMask
          ? getManualMaskBox(canvas.width, canvas.height, maskRectRef.current)
          : undefined,
        mode: currentFaceMode,
      })
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
    setBodyScanSessionActive(false)
  }, [])

  useEffect(() => {
    setBodyScanSessionActive(sessionOpen)
  }, [sessionOpen])

  // Navigating away (tab close, bfcache, backgrounding) must release the camera.
  useEffect(() => {
    if (!cameraActiveUi) return undefined

    function releaseCamera() {
      clearTimers()
      cancelVideoScanSpeech()
      stopMediaStream(streamRef.current)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') releaseCamera()
    }

    window.addEventListener('pagehide', releaseCamera)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', releaseCamera)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [cameraActiveUi])

  useEffect(() => {
    if (!sessionOpen) return undefined
    safeLogger.info('body-scan-phase', {
      camera: state.cameraActive,
      framing: state.framingMode,
      phase: state.phase,
    })
    return undefined
  }, [sessionOpen, state.cameraActive, state.framingMode, state.phase])

  useEffect(() => {
    maskRectRef.current = maskRect
    faceModeRef.current = state.faceMode
    zoomRef.current = state.zoom
  }, [maskRect, state.faceMode, state.zoom])

  useEffect(() => {
    if (state.phase === 'review' || state.phase === 'analyzing') {
      stopMediaStream(streamRef.current)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [state.phase])

  useEffect(() => {
    if (!cameraActiveUi) return undefined
    attachStreamToVideo(streamRef.current, 'video-mounted')
    return undefined
  }, [cameraActiveUi, state.phase])

  useEffect(() => {
    if (!cameraActiveUi) return undefined
    const video = videoRef.current
    if (!video) return undefined

    function logVideoEvent(event) {
      safeLogger.info('body-scan-video-event', {
        event: event.type,
        stream: getStreamMetadata(),
        video: getVideoMetadata(video),
      })
      if (event.type === 'loadedmetadata' || event.type === 'canplay') {
        attachStreamToVideo(streamRef.current, event.type)
      }
      if (event.type === 'playing' && video.videoWidth > 0 && video.videoHeight > 0) {
        setPreviewError('')
      }
    }

    ;['loadedmetadata', 'canplay', 'playing', 'pause', 'stalled', 'suspend', 'emptied', 'error']
      .forEach((eventName) => video.addEventListener?.(eventName, logVideoEvent))

    return () => {
      ;['loadedmetadata', 'canplay', 'playing', 'pause', 'stalled', 'suspend', 'emptied', 'error']
        .forEach((eventName) => video.removeEventListener?.(eventName, logVideoEvent))
    }
  }, [cameraActiveUi, state.phase])

  useEffect(() => {
    if (!cameraActiveUi || !streamRef.current) return undefined
    const timeoutId = window.setTimeout(() => {
      const video = videoRef.current
      const stream = streamRef.current
      const track = stream?.getVideoTracks?.()[0]
      const hasLiveTrack = Boolean(stream?.active) && track?.readyState === 'live'
      const hasDimensions = Boolean(video?.videoWidth && video?.videoHeight)
      if (hasLiveTrack && video?.srcObject === stream && !hasDimensions) {
        safeLogger.warn('body-scan-preview-timeout', {
          stream: getStreamMetadata(stream),
          video: getVideoMetadata(video),
        })
        setPreviewError('Kameran startade men förhandsvisningen kunde inte visas.')
      }
    }, 3500)

    return () => window.clearTimeout(timeoutId)
  }, [cameraActiveUi, state.phase, state.facingMode])

  useEffect(() => {
    if (!cameraActiveUi) return undefined
    function updateContainRect() {
      const frame = frameRef.current
      const video = videoRef.current
      if (!frame || !video) return
      const next = getVideoContainRect(
        frame.clientWidth,
        frame.clientHeight,
        video.videoWidth || video.clientWidth,
        video.videoHeight || video.clientHeight,
      )
      setContainRect((current) => (isSameContainRect(current, next) ? current : next))
    }
    const video = videoRef.current
    updateContainRect()
    video?.addEventListener?.('loadedmetadata', updateContainRect)
    video?.addEventListener?.('canplay', updateContainRect)
    video?.addEventListener?.('playing', updateContainRect)
    window.addEventListener('resize', updateContainRect)
    return () => {
      video?.removeEventListener?.('loadedmetadata', updateContainRect)
      video?.removeEventListener?.('canplay', updateContainRect)
      video?.removeEventListener?.('playing', updateContainRect)
      window.removeEventListener('resize', updateContainRect)
    }
  }, [cameraActiveUi, state.facingMode])

  useEffect(() => {
    if (!cameraActiveUi) return undefined
    let cancelled = false
    let detach = () => {}

    function attach(frame) {
      const tracker = createPinchTracker()
      pinchTrackerRef.current = tracker

      function onPointerDown(event) {
        if (event.pointerType === 'mouse' && event.buttons !== 1) return
        if (event.target?.closest?.('button, input, label, a')) return
        tracker.down(event.pointerId, event.clientX, event.clientY, zoomRef.current)
      }

      function onPointerMove(event) {
        const result = tracker.move(event.pointerId, event.clientX, event.clientY)
        if (!result.preventDefault || result.zoom == null) return
        event.preventDefault()
        applyZoomToTrack(clampVideoScanZoom(result.zoom), streamRef.current?.getVideoTracks?.()[0])
      }

      function onPointerUp(event) {
        tracker.up(event.pointerId)
      }

      frame.addEventListener('pointerdown', onPointerDown)
      frame.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerUp)
      detach = () => {
        frame.removeEventListener('pointerdown', onPointerDown)
        frame.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
        tracker.clear()
        pinchTrackerRef.current = null
      }
    }

    if (frameRef.current) attach(frameRef.current)
    const frameId = window.requestAnimationFrame(() => {
      if (!cancelled && frameRef.current && !pinchTrackerRef.current) attach(frameRef.current)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      detach()
    }
  }, [cameraActiveUi])

  useEffect(() => {
    if (isAnalyzing) {
      sawAnalyzingRef.current = true
      return undefined
    }
    if (state.phase !== 'analyzing' || !sawAnalyzingRef.current) return undefined
    sawAnalyzingRef.current = false
    dispatch({
      type: 'ANALYSIS_FINISHED',
      ok: !analysisError,
      error: analysisError,
    })
    return undefined
  }, [analysisError, isAnalyzing, state.phase])

  useEffect(() => {
    if (!isPreparePhase(state.phase)) return undefined
    speak(state.phase)
    return undefined
  }, [state.phase])

  useEffect(() => {
    if (state.paused) return undefined
    if (!isCountdownPhase(state.phase) || state.countdown === null) return undefined
    speak(state.phase, state.countdown)
    timerRef.current = window.setTimeout(() => dispatch({ type: 'TICK_COUNTDOWN' }), videoScanCountdownStepMs)
    return clearTimers
  }, [state.phase, state.countdown, state.paused])

  useEffect(() => {
    if (!isCapturePhase(state.phase) || !state.pose) return undefined
    const pose = state.pose
    const timer = window.setTimeout(() => {
      capturePose(pose)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [state.phase, state.pose])

  useEffect(() => {
    if (!cameraActiveUi || state.paused || state.framingMode !== 'auto' || !isPreparePhase(state.phase)) return undefined
    if (!autoSupport.available) {
      dispatch({
        type: 'SET_POSITION',
        status: 'unavailable',
        message: autoSupport.label,
      })
      return undefined
    }

    let cancelled = false
    let lastVoice = ''
    let timeoutId = 0

    async function pollPosition() {
      if (cancelled) return
      const result = await detectBodyPosition(videoRef.current)
      if (cancelled) return
      dispatch({
        type: 'SET_POSITION',
        status: result.valid ? 'valid' : result.code,
        message: result.message,
      })
      if (result.voice && result.voice !== lastVoice) {
        lastVoice = result.voice
        speakVideoScanLine(result.voice, { enabled: state.voiceEnabled })
      }
      if (result.valid) {
        dispatch({ type: 'BEGIN_COUNTDOWN', pose: state.pose || 'front' })
        return
      }
      timeoutId = window.setTimeout(pollPosition, 450)
    }

    pollPosition()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [cameraActiveUi, state.paused, state.framingMode, state.phase, autoSupport.available, autoSupport.label, state.pose, state.voiceEnabled])

  useEffect(() => {
    if (state.paused) return undefined
    if (!isCountdownPhase(state.phase) || state.framingMode !== 'auto' || !autoSupport.available) return undefined
    let cancelled = false
    let timeoutId = 0

    async function watchValidity() {
      if (cancelled) return
      const result = await detectBodyPosition(videoRef.current)
      if (cancelled) return
      if (!result.valid) {
        // Position lost mid-countdown: abort, never capture a bad frame.
        dispatch({
          type: 'CANCEL_COUNTDOWN',
          message: `Nedräkningen avbröts: ${result.message || 'positionen ändrades'}. Ingen bild togs.`,
        })
        speakVideoScanLine('Nedräkningen avbröts. Ställ dig i ramen igen.', { enabled: state.voiceEnabled })
        return
      }
      timeoutId = window.setTimeout(watchValidity, 350)
    }

    watchValidity()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [state.phase, state.paused, state.framingMode, autoSupport.available, state.voiceEnabled])

  /** Step 1: open consent. The camera is not touched until step 4. */
  function handleStart() {
    setStatus('')
    setSetupStep('consent')
    setBodyScanSessionActive(true)
  }

  /** Step 2: only offered when the browser actually exposes several cameras. */
  async function handleConsentContinue() {
    if (!consentAccepted) return
    const found = await listBodyScanCameras()
    setCameras(found)
    if (shouldOfferCameraChoice(found)) {
      setSelectedCameraId((current) => current || found[0].deviceId)
      setSetupStep('camera')
      return
    }
    setSetupStep('instructions')
  }

  /** Step 4: first point where getUserMedia is called. */
  async function handleBeginCamera() {
    let framingMode = idleFramingMode
    if (framingMode === 'auto' && !autoSupport.available) {
      framingMode = 'manual'
      setIdleFramingMode('manual')
      setStatus(`${autoSupport.label} Använd manuell ram.`)
    }
    setSetupStep(null)
    setBodyScanSessionActive(true)
    dispatch({
      type: 'START',
      autoFramingAvailable: autoSupport.available,
      framingMode,
    })
    speak('prepare')
    await startStream(state.facingMode || defaultBodyScanFacingMode)
  }

  function handleAbortSetup() {
    setSetupStep(null)
    setConsentAccepted(false)
    setBodyScanSessionActive(false)
    setStatus('Scanningen avbröts. Kameran startades aldrig.')
  }

  function handleTogglePause() {
    if (state.paused) {
      dispatch({ type: 'RESUME' })
      setStatus('')
      return
    }
    clearTimers()
    cancelVideoScanSpeech()
    dispatch({ type: 'PAUSE' })
    setStatus('Pausad. Kameran är kvar på men ingen bild tas.')
  }

  function handleCancelCountdown() {
    clearTimers()
    cancelVideoScanSpeech()
    dispatch({ type: 'CANCEL_COUNTDOWN', message: 'Nedräkningen avbröts. Ingen bild togs.' })
  }

  function handleReady() {
    dispatch({ type: 'BEGIN_COUNTDOWN', pose: state.pose || 'front' })
  }

  function handleFramingMode(mode) {
    if (mode === 'auto' && !autoSupport.available) {
      dispatch({ type: 'SET_FRAMING_MODE', mode: 'auto' })
      dispatch({
        type: 'SET_POSITION',
        status: 'unavailable',
        message: autoSupport.label,
      })
      setStatus(`${autoSupport.label} Använd manuell ram.`)
      return
    }
    dispatch({ type: 'SET_FRAMING_MODE', mode })
    setIdleFramingMode(mode)
    setStatus('')
  }

  async function handleFlip() {
    if (capturingLockRef.current || isCapturePhase(state.phase)) return
    await startStream(getNextBodyScanFacingMode(state.facingMode))
  }

  function handleZoom(nextZoom) {
    applyZoomToTrack(clampVideoScanZoom(nextZoom), streamRef.current?.getVideoTracks?.()[0])
  }

  function handleMaskPointer(event, kind) {
    const frame = frameRef.current
    if (!frame) return
    const bounds = frame.getBoundingClientRect()
    const fit = containRect.width > 0
      ? containRect
      : getVideoContainRect(bounds.width, bounds.height, videoRef.current?.videoWidth, videoRef.current?.videoHeight)
    const x = (event.clientX - bounds.left - fit.x) / Math.max(1, fit.width)
    const y = (event.clientY - bounds.top - fit.y) / Math.max(1, fit.height)
    setMaskRect((current) => clampMaskRect({
      ...current,
      ...(kind === 'resize'
        ? {
            width: x - current.x,
            height: y - current.y,
          }
        : {
            x: x - current.width / 2,
            y: y - current.height / 2,
          }),
    }))
  }

  function handleCancel() {
    clearTimers()
    cancelVideoScanSpeech()
    stopStream()
    setSetupStep(null)
    setConsentAccepted(false)
    setBodyScanSessionActive(false)
    dispatch({ type: 'CANCEL' })
    setStatus('Scanningen avbröts. Kameran är avstängd och inget skickades.')
  }

  function handleRetakeAll() {
    clearTimers()
    cancelVideoScanSpeech()
    ;['front', 'side', 'back'].forEach((pose) => onPhotoChange(null, pose))
    revokePreviews()
    dispatch({ type: 'RETAKE_ALL' })
    startStream(state.facingMode)
  }

  function handleRetakePose(pose) {
    clearTimers()
    onPhotoChange(null, pose)
    dispatch({ type: 'RETAKE_POSE', pose })
    startStream(state.facingMode)
  }

  function handleDeleteScan() {
    clearTimers()
    cancelVideoScanSpeech()
    ;['front', 'side', 'back'].forEach((pose) => onPhotoChange(null, pose))
    revokePreviews()
    stopStream()
    setSetupStep(null)
    setConsentAccepted(false)
    setBodyScanSessionActive(false)
    dispatch({ type: 'CANCEL' })
    setStatus('Allt raderades lokalt. Inga bilder sparades och inget skickades.')
  }

  function handleAnalyzeClick() {
    dispatch({ type: 'SET_ANALYSIS_STATUS', status: 'Analyserar kroppen...' })
    setStatus('Analyserar kroppen...')
    const reason = getBodyScanAnalysisBlockReason({
      faceMode: state.faceMode,
      faceStatus: state.faceStatus,
      hasApprovedAnalysis,
      isAnalyzing,
      isFreeLimitReached,
      photos,
    })
    safeLogger.info('body-scan-analyze', {
      faceMode: state.faceMode,
      faceStatus: state.faceStatus,
      guard: reason || 'none',
      hasBack: Boolean(photos?.back),
      hasFront: Boolean(photos?.front),
      hasSide: Boolean(photos?.side),
    })
    if (reason) {
      dispatch({ type: 'SET_ANALYSIS_STATUS', error: reason, status: reason })
      setStatus(reason)
      if (reason === 'Godkänn AI-analysen först.') {
        onAnalyze?.()
      }
      return
    }
    try {
      dispatch({ type: 'ANALYZING' })
      onAnalyze?.()
    } catch {
      const failed = 'Analysen kunde inte startas.'
      dispatch({ type: 'SET_ANALYSIS_STATUS', error: failed, status: failed })
      setStatus(failed)
    }
  }

  const faceStatusText = state.faceStatus === 'applied'
    ? '✓ Ansiktsskydd bakat in i bilden'
    : state.faceStatus === 'unavailable'
      ? faceDetectorSupported && state.faceMode === 'auto'
        ? '⚠ Ansiktsskydd kunde inte verifieras'
        : getFaceProtectionOutcome(state.faceMode, [], { faceDetectorSupported }).label
      : state.faceStatus === 'skipped'
        ? 'Ingen mask'
        : 'Ansiktsskydd väntar på första fångsten.'

  const positionText = state.framingMode === 'auto' && !autoSupport.available
    ? autoSupport.label
    : state.positionMessage
      || (state.framingMode === 'manual'
        ? 'Placera hela kroppen i siluetten. Du bekräftar själv att hela kroppen syns i ramen.'
        : 'Söker person...')

  return (
    <section className="body-scan-section body-scan-video" aria-labelledby="body-scan-video-title">
      {!sessionOpen && (
        <div className="body-scan-idle">
          <div className="body-scan-section-heading">
            <div>
              <p className="eyebrow">Kroppsscanning</p>
              <h3 id="body-scan-video-title">Videoscanning</h3>
            </div>
            <span>Guidat fram → sida → bak</span>
          </div>
          <p className="body-scan-camera-indicator is-off">
            <span aria-hidden="true">●</span>
            Kameran är avstängd
          </p>
          <button type="button" onClick={handleStart}>
            Starta videoscanning
          </button>
          <p className="progress-photo-safety">
            Guidat flöde i {videoScanTotalSteps} steg. Du får först information och lämnar
            samtycke — kameran startas inte förrän du godkänt.
          </p>
          <div className="body-scan-idle-controls" role="group" aria-label="Position">
            <p>Position</p>
            <button
              className={idleFramingMode === 'auto' ? '' : 'secondary-button'}
              type="button"
              onClick={() => handleFramingMode('auto')}
            >
              Auto
            </button>
            <button
              className={idleFramingMode === 'manual' ? '' : 'secondary-button'}
              type="button"
              onClick={() => handleFramingMode('manual')}
            >
              Manuell
            </button>
          </div>
          {!autoSupport.available && (
            <p className="progress-photo-safety">{autoSupport.label} Använd manuell ram.</p>
          )}
          <fieldset className="body-scan-face-protection">
            <legend>Ansiktsskydd</legend>
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
          </fieldset>
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
          <details className="body-scan-idle-info">
            <summary>Så fungerar scanningen</summary>
            <p>
              Ett sammanhängande scan: framifrån, höger sida och bakifrån. Appen extraherar tre bilder
              och använder samma analys som Foto & kamera. Originalvideo sparas inte.
              Ansiktet behövs inte för kroppsscanningen.
            </p>
          </details>
        </div>
      )}

      {sessionOpen && renderBodyScanPortal(
        setupOpen ? (
        <div
          className="body-scan-active-overlay is-review body-scan-setup"
          role="dialog"
          aria-modal="true"
          aria-label="Förberedelser för videoscanning"
        >
          <header className="body-scan-active-top">
            <button className="secondary-button" type="button" onClick={handleAbortSetup}>← Avbryt</button>
            <strong>Förberedelser</strong>
            <span />
          </header>

          {setupStep === 'consent' && (
            <div className="body-scan-setup-step">
              <p className="eyebrow">Steg 1 av {videoScanTotalSteps}</p>
              <h3>Samtycke och integritet</h3>
              <ul className="body-scan-consent-list">
                {videoScanConsentPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <label className="body-scan-consent-check">
                <input
                  checked={consentAccepted}
                  type="checkbox"
                  aria-label="Jag har läst och godkänner hur kameran används"
                  onChange={(event) => setConsentAccepted(event.target.checked)}
                />
                Jag har läst informationen och godkänner att kameran används lokalt.
              </label>
              <button type="button" disabled={!consentAccepted} onClick={handleConsentContinue}>
                Fortsätt
              </button>
              <p className="progress-photo-safety">
                Kameran startas först i steg 4. Inget har begärts av webbläsaren ännu.
              </p>
            </div>
          )}

          {setupStep === 'camera' && (
            <div className="body-scan-setup-step">
              <p className="eyebrow">Steg 2 av {videoScanTotalSteps}</p>
              <h3>Välj kamera</h3>
              <p>Webbläsaren hittade flera kameror. Välj den som ska användas.</p>
              <fieldset className="body-scan-camera-choice">
                <legend>Tillgängliga kameror</legend>
                {cameras.map((camera) => (
                  <label key={camera.deviceId}>
                    <input
                      checked={selectedCameraId === camera.deviceId}
                      name="body-scan-camera"
                      type="radio"
                      value={camera.deviceId}
                      onChange={() => setSelectedCameraId(camera.deviceId)}
                    />
                    {camera.label}
                  </label>
                ))}
              </fieldset>
              <button type="button" onClick={() => setSetupStep('instructions')}>Fortsätt</button>
              <button className="secondary-button" type="button" onClick={() => setSetupStep('consent')}>
                Tillbaka
              </button>
            </div>
          )}

          {setupStep === 'instructions' && (
            <div className="body-scan-setup-step">
              <p className="eyebrow">Steg 3 av {videoScanTotalSteps}</p>
              <h3>Så förbereder du rummet</h3>
              <dl className="body-scan-prep-tips">
                {videoScanPreparationTips.map((tip) => (
                  <div key={tip.key}>
                    <dt>{tip.title}</dt>
                    <dd>{tip.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="progress-photo-safety">
                {autoSupport.available
                  ? 'Positionen kontrolleras automatiskt av enhetens pose-API.'
                  : `${autoSupport.label} Du bekräftar därför själv när du står rätt i ramen.`}
              </p>
              <button type="button" onClick={handleBeginCamera}>Starta kameran</button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSetupStep(cameras.length > 1 ? 'camera' : 'consent')}
              >
                Tillbaka
              </button>
            </div>
          )}
        </div>
        ) : cameraActiveUi ? (
        <div className="body-scan-active-overlay" id="body-scan-video-stage" role="dialog" aria-modal="true" aria-label="Aktiv kroppsscanning">
          <header className="body-scan-active-top">
            <button className="secondary-button" type="button" onClick={handleCancel}>← Avbryt</button>
            <strong>{poseCopy.step} · Steg {stepNumber} av {videoScanTotalSteps}</strong>
            <label className="body-scan-voice-toggle">
              <span aria-hidden="true">{state.voiceEnabled ? '🔊' : '🔇'}</span>
              <input
                checked={state.voiceEnabled}
                type="checkbox"
                aria-label="Röstguide"
                onChange={(event) => {
                  if (!event.target.checked) cancelVideoScanSpeech()
                  dispatch({ type: 'SET_VOICE', enabled: event.target.checked })
                }}
              />
              <span className="body-scan-voice-text">Röstguide {state.voiceEnabled ? 'på' : 'av'}</span>
            </label>
          </header>
          <div className="body-scan-active-guide">
            <p className={`body-scan-camera-indicator is-${cameraIndicator.kind}`}>
              <span aria-hidden="true">●</span>
              {cameraIndicator.label}
            </p>
            <p className="body-scan-video-direction">
              <span aria-hidden="true">{direction?.arrow || ''}</span>
              <span>{getVideoScanInstruction(state.phase) || direction?.label || ''}</span>
            </p>
            {isPreparePhase(state.phase) && turnInstruction && (
              <p className="body-scan-turn-instruction">{turnInstruction}</p>
            )}
          </div>
          <div className="body-scan-video-frame" ref={frameRef}>
            <div className="body-scan-video-zoom" style={{ transform: `scale(${previewScale})` }}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                controls={false}
                disablePictureInPicture
                aria-label="Helkroppsförhandsvisning för videoscanning"
              />
              <canvas ref={canvasRef} aria-hidden="true" />
              <div
                className="body-scan-video-fit"
                style={{
                  left: containRect.x,
                  top: containRect.y,
                  width: containRect.width || '100%',
                  height: containRect.height || '100%',
                }}
              >
                <div className="body-scan-silhouette" aria-hidden="true">
                  <span className="body-scan-silhouette-head" />
                  <span className="body-scan-silhouette-shoulders" />
                  <span className="body-scan-silhouette-body" />
                  <span className="body-scan-silhouette-feet" />
                  <span className="body-scan-silhouette-center" />
                </div>
                {showManualMask && (
                  <div
                    className="body-scan-manual-mask"
                    style={{
                      left: `${maskRect.x * 100}%`,
                      top: `${maskRect.y * 100}%`,
                      width: `${maskRect.width * 100}%`,
                      height: `${maskRect.height * 100}%`,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      handleMaskPointer(event, 'move')
                    }}
                    onPointerMove={(event) => {
                      if (!event.buttons) return
                      handleMaskPointer(event, 'move')
                    }}
                  >
                    <span
                      className="body-scan-manual-mask-resize"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        handleMaskPointer(event, 'resize')
                      }}
                      onPointerMove={(event) => {
                        if (!event.buttons) return
                        handleMaskPointer(event, 'resize')
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {isCountdownPhase(state.phase) && (
              <div
                className={`body-scan-countdown-overlay${reducedMotion ? ' is-reduced-motion' : ''}`}
                aria-hidden="true"
              >
                {state.countdown > 0 ? state.countdown : 'FÅNGAR...'}
              </div>
            )}
            {isCapturePhase(state.phase) && (
              <div
                className={`body-scan-countdown-overlay is-capture${reducedMotion ? ' is-reduced-motion' : ''}`}
                aria-hidden="true"
              >
                FÅNGAR...
              </div>
            )}
            {previewError && (
              <div className="body-scan-preview-error" aria-live="assertive">
                <p>{previewError}</p>
                <div>
                  <button className="secondary-button" type="button" onClick={() => startStream(state.facingMode)}>
                    Försök igen
                  </button>
                  <button className="secondary-button" type="button" onClick={handleFlip}>
                    Vänd kamera
                  </button>
                  <button className="secondary-button" type="button" onClick={handleCancel}>
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="body-scan-position-status" aria-live="polite">{positionText}</p>
          <p className="sr-only" role="status" aria-live="polite">{countdownAnnouncement}</p>
          <div className="body-scan-video-toolbar">
            <button
              className={state.framingMode === 'auto' ? '' : 'secondary-button'}
              type="button"
              onClick={() => handleFramingMode('auto')}
            >
              AUTO
            </button>
            <button
              className={state.framingMode === 'manual' ? '' : 'secondary-button'}
              type="button"
              onClick={() => handleFramingMode('manual')}
            >
              MANUELL
            </button>
            <span>{state.faceStatus === 'applied' ? 'Mask ✓' : 'Mask'}</span>
            <div className="body-scan-zoom" aria-label="Zoom">
              <button className="secondary-button" type="button" onClick={() => handleZoom(state.zoom - videoScanZoomStep)}>-</button>
              <span>{Number(state.zoom).toFixed(1)}×</span>
              <button className="secondary-button" type="button" onClick={() => handleZoom(state.zoom + videoScanZoomStep)}>+</button>
            </div>
            <button className="secondary-button" type="button" onClick={handleFlip}>↻ Kamera</button>
          </div>
          <div className="body-scan-flow-controls">
            {state.framingMode === 'manual' && isPreparePhase(state.phase) && !state.paused && (
              <button type="button" onClick={handleReady}>Jag står rätt i ramen</button>
            )}
            {isCountdownPhase(state.phase) && (
              <button className="secondary-button" type="button" onClick={handleCancelCountdown}>
                Avbryt nedräkningen
              </button>
            )}
            <button
              className="secondary-button"
              type="button"
              aria-pressed={state.paused}
              onClick={handleTogglePause}
            >
              {state.paused ? 'Fortsätt' : 'Pausa'}
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-label="Ta om den här vyn"
              onClick={() => handleRetakePose(state.pose || 'front')}
            >
              Ta om vyn
            </button>
            <button className="secondary-button" type="button" onClick={handleDeleteScan}>
              Radera allt
            </button>
          </div>
        </div>
        ) : (
        <div className="body-scan-active-overlay is-review">
          <header className="body-scan-active-top">
            <button className="secondary-button" type="button" onClick={handleCancel}>← Avbryt</button>
            <strong>KLAR FÖR ANALYS · Steg {stepNumber} av {videoScanTotalSteps}</strong>
            <span />
          </header>
          <p className="body-scan-camera-indicator is-off">
            <span aria-hidden="true">●</span>
            Kameran är avstängd
          </p>
          <p className="progress-photo-safety">
            Granska de tre bilderna. Ingenting har skickats ännu — bilderna lämnar enheten
            först när du trycker på Analysera kroppen.
          </p>
          <div className="progress-photo-ai-images is-three-angle body-scan-review-thumbs">
            {['front', 'side', 'back'].map((pose) => (
              <figure key={pose}>
                {photos[pose] ? <img src={photos[pose].preview} alt={`Videopose ${pose}`} /> : <span>{pose}</span>}
                <figcaption>
                  {pose === 'front' ? 'FRAM' : pose === 'side' ? 'SIDA' : 'BAK'}
                  {' '}
                  {photos[pose] ? '✓' : 'saknas'}
                </figcaption>
              </figure>
            ))}
          </div>
          <p aria-live="polite">Integritet: {state.faceStatus === 'applied' ? 'Mask ✓' : 'Ingen mask'}</p>
          <p className="body-scan-face-status">{faceStatusText}</p>
          <button type="button" onClick={handleAnalyzeClick}>
            {isAnalyzing || state.phase === 'analyzing' ? 'Analyserar kroppen...' : 'Analysera kroppen'}
          </button>
          {(status || state.analysisStatus) && (
            <p className="analysis-status" aria-live="assertive">{state.analysisStatus || status}</p>
          )}
          <button className="secondary-button" type="button" onClick={() => handleRetakePose(state.pose || 'front')}>
            Ta om vald pose
          </button>
          <div className="body-scan-review-actions">
            {['front', 'side', 'back'].map((pose) => (
              <button key={pose} className="secondary-button" type="button" onClick={() => handleRetakePose(pose)}>
                Ta om {pose === 'front' ? 'fram' : pose === 'side' ? 'sida' : 'bak'}
              </button>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={handleRetakeAll}>Ta om alla</button>
          <button
            className="secondary-button"
            type="button"
            aria-label="Radera allt utan att spara eller skicka något"
            onClick={handleDeleteScan}
          >
            Radera allt utan att spara eller skicka
          </button>
        </div>
        )
      )}

      {status && <p className="analysis-status" aria-live="polite">{status}</p>}
      {state.analysisStatus && <p className="analysis-status" aria-live="polite">{state.analysisStatus}</p>}
      {state.error && <p className="progress-photo-safety">{state.error}</p>}
      {disabledReason && <p className="progress-photo-safety">{disabledReason}</p>}
    </section>
  )
}

export default BodyAnalysisVideoScanner
