export const videoScanPhases = [
  'idle',
  'prepare',
  'front_prepare',
  'front_countdown',
  'front_capture',
  'front_done',
  'side_prepare',
  'side_countdown',
  'side_capture',
  'side_done',
  'back_prepare',
  'back_countdown',
  'back_capture',
  'back_done',
  'review',
  'analyzing',
  'done',
  'error',
]

export const videoScanPoses = ['front', 'side', 'back']
export const defaultVideoScanFacingMode = 'environment'
export const videoScanCountdownStart = 3
export const videoScanTurnDelayMs = 4000
export const videoScanDoneDelayMs = 900
export const videoScanCountdownStepMs = 1000
export const defaultFaceProtectionMode = 'auto'
export const minVideoScanZoom = 1
export const maxVideoScanZoom = 2
export const videoScanZoomStep = 0.1

export const defaultManualFaceMask = { x: 0.28, y: 0.05, width: 0.44, height: 0.28 }

export const videoScanPoseCopy = {
  front: {
    short: 'FRAM',
    step: 'FRAM 1/3',
    title: 'STÅ RAKT FRAM MOT KAMERAN',
  },
  side: {
    short: 'SIDA',
    step: 'SIDA 2/3',
    title: 'VÄND HÖGER SIDA MOT KAMERAN',
  },
  back: {
    short: 'BAK',
    step: 'BAK 3/3',
    title: 'VÄND RYGGEN MOT KAMERAN',
  },
}

export const videoScanVoiceLines = {
  back_done: 'Bra.',
  back_prepare: 'Vänd ryggen mot kameran.',
  countdown1: 'Ett.',
  countdown2: 'Två.',
  countdown3: 'Tre.',
  capturing: 'Fångar.',
  front_done: 'Bra.',
  front_prepare: 'Ställ dig rakt fram mot kameran.',
  front_prepare_manual: 'Placera hela kroppen i ramen.',
  good_position: 'Bra position. Håll still.',
  hold: 'Håll still.',
  manual_confirm: 'När du är klar trycker du Jag står rätt i ramen.',
  move_back: 'Flytta dig lite bakåt.',
  side_done: 'Bra.',
  side_prepare: 'Vänd höger sida mot kameran.',
}

/**
 * Explicit turn instructions for step 9 and step 13 of the guided flow.
 * Kept separate from getVideoScanInstruction so the existing pose titles
 * (which describe the end position) stay unchanged.
 */
export const videoScanTurnInstructions = {
  back: 'Vänd dig åt höger igen så att ryggen är mot kameran',
  front: 'Ställ dig rakt fram mot kameran',
  side: 'Vänd dig åt höger',
}

export function getVideoScanTurnInstruction(pose) {
  return videoScanTurnInstructions[pose] || ''
}

/** Step 3: what the user needs to arrange before the camera preview starts. */
export const videoScanPreparationTips = [
  {
    key: 'distance',
    text: 'Ställ kameran cirka 2–3 meter bort så att hela kroppen får plats i bilden, från huvud till fötter.',
    title: 'Avstånd',
  },
  {
    key: 'light',
    text: 'Använd jämnt ljus framifrån. Undvik att stå med ett fönster eller en lampa bakom dig.',
    title: 'Ljus',
  },
  {
    key: 'clothing',
    text: 'Ha åtsittande kläder som kontrasterar mot bakgrunden. Vida kläder gör kroppsformen svårare att bedöma.',
    title: 'Kläder',
  },
  {
    key: 'placement',
    text: 'Stå framför en lugn, enfärgad vägg med fri golvyta runt fötterna.',
    title: 'Placering i rummet',
  },
]

/** Step 1: what the user consents to before the camera is opened at all. */
export const videoScanConsentPoints = [
  'Kameran körs lokalt på din enhet. Videoströmmen lämnar aldrig telefonen.',
  'Ingen video spelas in och ingen video sparas eller skickas.',
  'Mikrofonen används aldrig. Kameran begärs alltid utan ljud.',
  'Endast tre stillbilder – framifrån, från sidan och bakifrån – skapas.',
  'Bilderna skickas till analysen först efter att du uttryckligen godkänt dem i granskningssteget.',
  'Du kan avbryta och radera allt när som helst utan att något sparas eller skickas.',
]

export const videoScanSetupSteps = ['consent', 'camera', 'instructions']

/**
 * The 18 guided steps, used for the visible step indicator.
 * setupStep is one of videoScanSetupSteps (before the camera phases start).
 */
export function getVideoScanStepNumber(phase, setupStep = null) {
  if (setupStep === 'consent') return 1
  if (setupStep === 'camera') return 2
  if (setupStep === 'instructions') return 3
  const byPhase = {
    back_capture: 16,
    back_countdown: 15,
    back_done: 16,
    back_prepare: 14,
    front_capture: 8,
    front_countdown: 7,
    front_done: 8,
    front_prepare: 6,
    prepare: 4,
    review: 17,
    side_capture: 12,
    side_countdown: 11,
    side_done: 12,
    side_prepare: 10,
  }
  if (phase === 'analyzing' || phase === 'done') return 18
  return byPhase[phase] || 0
}

export const videoScanTotalSteps = 18

export function prefersReducedMotion(globalObject = globalThis) {
  try {
    return Boolean(globalObject.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  } catch {
    return false
  }
}

export const initialVideoScanState = {
  analysisError: '',
  analysisStatus: '',
  autoFramingAvailable: false,
  cameraActive: false,
  capturing: false,
  countdown: null,
  error: '',
  faceMode: defaultFaceProtectionMode,
  faceStatus: 'pending',
  facingMode: defaultVideoScanFacingMode,
  framingMode: 'manual',
  paused: false,
  phase: 'idle',
  pose: null,
  positionMessage: '',
  positionStatus: 'idle',
  // Spoken guidance is opt-in: accessibility requirement is that voice is OFF by default.
  voiceEnabled: false,
  zoom: 1,
  zoomMode: 'unknown',
}

export function isVideoScanActive(phase) {
  return phase !== 'idle' && phase !== 'done' && phase !== 'error' && phase !== 'review' && phase !== 'analyzing'
}

export function isBodyScanSessionOpen(phase) {
  return phase !== 'idle' && phase !== 'done' && phase !== 'error'
}

export function getVideoScanPoseCopy(pose = 'front') {
  return videoScanPoseCopy[pose] || videoScanPoseCopy.front
}

export function isCountdownPhase(phase) {
  return phase.endsWith('_countdown')
}

export function isCapturePhase(phase) {
  return phase.endsWith('_capture')
}

export function isPreparePhase(phase) {
  return phase.endsWith('_prepare') || phase === 'prepare'
}

export function getPoseFromPhase(phase) {
  if (phase.startsWith('front')) return 'front'
  if (phase.startsWith('side')) return 'side'
  if (phase.startsWith('back')) return 'back'
  return null
}

export function getCountdownPhase(pose) {
  return `${pose}_countdown`
}

export function getCapturePhase(pose) {
  return `${pose}_capture`
}

export function getDonePhase(pose) {
  return `${pose}_done`
}

export function getPreparePhase(pose) {
  return `${pose}_prepare`
}

export function getNextPose(pose) {
  if (pose === 'front') return 'side'
  if (pose === 'side') return 'back'
  return null
}

export function getVideoScanInstruction(phase) {
  const instructions = {
    back_countdown: 'Håll ryggen mot kameran.',
    back_capture: 'Fångar bakifrån...',
    back_done: 'Bakifrån klar ✓',
    back_prepare: 'VÄND RYGGEN MOT KAMERAN',
    error: 'Scanningen kunde inte fortsätta.',
    front_countdown: 'Håll positionen framifrån.',
    front_capture: 'Fångar framifrån...',
    front_done: 'Framifrån klar ✓',
    front_prepare: 'STÅ RAKT FRAM MOT KAMERAN',
    idle: 'Starta en guidat videoscanning.',
    prepare: 'Placera hela kroppen i ramen. Huvud och fötter ska synas.',
    review: 'KLAR FÖR ANALYS',
    side_countdown: 'Håll höger sida mot kameran.',
    side_capture: 'Fångar från sidan...',
    side_done: 'Från sidan klar ✓',
    side_prepare: 'VÄND HÖGER SIDA MOT KAMERAN',
  }

  return instructions[phase] || ''
}

export function getVideoScanDirection(phase) {
  if (phase.startsWith('side')) {
    return { arrow: '→', label: 'VÄND HÖGER SIDA MOT KAMERAN' }
  }
  if (phase.startsWith('back')) {
    return { arrow: '↻', label: 'VÄND RYGGEN MOT KAMERAN' }
  }
  if (phase.startsWith('front') || phase === 'prepare') {
    return { arrow: '↑', label: 'STÅ RAKT FRAM MOT KAMERAN' }
  }
  return null
}

export function getVideoScanCameraIndicator(phase, cameraActive) {
  if (!cameraActive) return { kind: 'off', label: 'Kamera av' }
  if (isCapturePhase(phase)) return { kind: 'recording', label: 'Spelar in' }
  return { kind: 'live', label: 'Kamera aktiv' }
}

export function isFaceDetectorSupported(globalObject = globalThis) {
  return typeof globalObject.FaceDetector === 'function'
}

export function getFaceProtectionOutcome(mode, faces = [], options = {}) {
  const detected = Array.isArray(faces) && faces.length > 0
  const detectorSupported = options.faceDetectorSupported ?? isFaceDetectorSupported()
  const hasManualMask = Boolean(options.hasManualMask)
  const bakedLabel = 'Ansiktsskydd bakat in i bilden'
  const unverifiedLabel = 'Ansiktsskydd kunde inte verifieras'

  if (mode === 'none') {
    return {
      applied: false,
      bakedIntoPixels: false,
      label: 'Ingen mask vald.',
      method: 'none',
      status: 'skipped',
    }
  }

  if (mode === 'auto') {
    if (!detectorSupported) {
      return {
        applied: false,
        bakedIntoPixels: false,
        label: 'Automatisk ansiktsdetektion stöds inte på den här enheten.',
        method: 'none',
        status: 'unavailable',
      }
    }
    return detected
      ? {
          applied: true,
          bakedIntoPixels: true,
          label: bakedLabel,
          method: 'detected',
          status: 'applied',
        }
      : {
          applied: false,
          bakedIntoPixels: false,
          label: unverifiedLabel,
          method: 'none',
          status: 'unavailable',
        }
  }

  if (detected) {
    return {
      applied: true,
      bakedIntoPixels: true,
      label: bakedLabel,
      method: 'detected',
      status: 'applied',
    }
  }

  if (hasManualMask || mode === 'blur' || mode === 'pixelate' || mode === 'cover') {
    return {
      applied: true,
      bakedIntoPixels: true,
      label: bakedLabel,
      method: hasManualMask ? 'manual' : 'upper-region',
      status: 'applied',
    }
  }

  return {
    applied: false,
    bakedIntoPixels: false,
    label: unverifiedLabel,
    method: 'none',
    status: 'unavailable',
  }
}

export function clampVideoScanZoom(value) {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return minVideoScanZoom
  return Math.min(maxVideoScanZoom, Math.max(minVideoScanZoom, Math.round(zoom * 10) / 10))
}

export function getPointerDistance(a, b) {
  if (!a || !b) return 0
  return Math.hypot(Number(a.clientX) - Number(b.clientX), Number(a.clientY) - Number(b.clientY))
}

export function getPinchZoom(startDistance, currentDistance, startZoom) {
  if (!startDistance || startDistance <= 0) return clampVideoScanZoom(startZoom)
  return clampVideoScanZoom((Number(startZoom) || minVideoScanZoom) * (currentDistance / startDistance))
}

export function createPinchTracker() {
  const pointers = new Map()
  let pinch = null

  return {
    get activeCount() {
      return pointers.size
    },
    get pinchActive() {
      return Boolean(pinch)
    },
    down(pointerId, clientX, clientY, startZoom) {
      pointers.set(pointerId, { clientX, clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = {
          startDistance: getPointerDistance(a, b),
          startZoom: Number(startZoom) || minVideoScanZoom,
        }
      }
      return { capture: false, pinchActive: Boolean(pinch) }
    },
    move(pointerId, clientX, clientY) {
      if (!pointers.has(pointerId)) {
        return { preventDefault: false, zoom: null }
      }
      pointers.set(pointerId, { clientX, clientY })
      if (pointers.size !== 2 || !pinch?.startDistance) {
        return { preventDefault: false, zoom: null }
      }
      const [a, b] = [...pointers.values()]
      return {
        preventDefault: true,
        zoom: getPinchZoom(pinch.startDistance, getPointerDistance(a, b), pinch.startZoom),
      }
    },
    up(pointerId) {
      pointers.delete(pointerId)
      if (pointers.size < 2) pinch = null
    },
    clear() {
      pointers.clear()
      pinch = null
    },
  }
}

export function getDefaultFaceProtectionMode(globalObject = globalThis) {
  return typeof globalObject.FaceDetector === 'function' ? defaultFaceProtectionMode : 'blur'
}

export function getVideoContainRect(frameWidth, frameHeight, videoWidth, videoHeight) {
  const frameW = Math.max(0, Number(frameWidth) || 0)
  const frameH = Math.max(0, Number(frameHeight) || 0)
  const videoW = Math.max(1, Number(videoWidth) || 1)
  const videoH = Math.max(1, Number(videoHeight) || 1)
  if (!frameW || !frameH) {
    return { height: 0, scale: 1, width: 0, x: 0, y: 0 }
  }
  const scale = Math.min(frameW / videoW, frameH / videoH)
  const width = videoW * scale
  const height = videoH * scale
  return {
    height: Math.round(height),
    scale,
    width: Math.round(width),
    x: Math.round((frameW - width) / 2),
    y: Math.round((frameH - height) / 2),
  }
}

export function isSameContainRect(a, b) {
  return Boolean(a)
    && Boolean(b)
    && a.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height
    && a.scale === b.scale
}

export function mapMaskRectToCanvas(maskRect = defaultManualFaceMask, videoWidth, videoHeight) {
  const rect = maskRect || defaultManualFaceMask
  return {
    height: Math.round(videoHeight * Number(rect.height || defaultManualFaceMask.height)),
    width: Math.round(videoWidth * Number(rect.width || defaultManualFaceMask.width)),
    x: Math.round(videoWidth * Number(rect.x || 0)),
    y: Math.round(videoHeight * Number(rect.y || 0)),
  }
}

export function clampMaskRect(rect = defaultManualFaceMask) {
  const width = Math.min(0.8, Math.max(0.12, Number(rect.width) || defaultManualFaceMask.width))
  const height = Math.min(0.6, Math.max(0.1, Number(rect.height) || defaultManualFaceMask.height))
  return {
    height,
    width,
    x: Math.min(1 - width, Math.max(0, Number(rect.x) || 0)),
    y: Math.min(1 - height, Math.max(0, Number(rect.y) || 0)),
  }
}

export function getManualMaskBox(width, height, maskRect = defaultManualFaceMask) {
  return mapMaskRectToCanvas(maskRect, width, height)
}

export function pixelsDiffer(left = [], right = []) {
  if (left.length !== right.length) return true
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return true
  }
  return false
}

export function boxBlurRgba(data, width, height, radius = 6) {
  const src = new Uint8ClampedArray(data)
  const tmp = new Uint8ClampedArray(data.length)
  const r = Math.max(1, Math.round(radius))

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let count = 0
      for (let offset = -r; offset <= r; offset += 1) {
        const xx = Math.min(width - 1, Math.max(0, x + offset))
        const i = (y * width + xx) * 4
        red += src[i]
        green += src[i + 1]
        blue += src[i + 2]
        alpha += src[i + 3]
        count += 1
      }
      const o = (y * width + x) * 4
      tmp[o] = red / count
      tmp[o + 1] = green / count
      tmp[o + 2] = blue / count
      tmp[o + 3] = alpha / count
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let count = 0
      for (let offset = -r; offset <= r; offset += 1) {
        const yy = Math.min(height - 1, Math.max(0, y + offset))
        const i = (yy * width + x) * 4
        red += tmp[i]
        green += tmp[i + 1]
        blue += tmp[i + 2]
        alpha += tmp[i + 3]
        count += 1
      }
      const o = (y * width + x) * 4
      data[o] = red / count
      data[o + 1] = green / count
      data[o + 2] = blue / count
      data[o + 3] = alpha / count
    }
  }

  return data
}

export function getTrackZoomCapabilities(track) {
  const capabilities = track?.getCapabilities?.()
  const zoom = capabilities?.zoom
  if (!zoom || typeof zoom.min !== 'number' || typeof zoom.max !== 'number') {
    return null
  }
  return zoom
}

export function canUseHardwareZoom(track) {
  return Boolean(getTrackZoomCapabilities(track))
}

export function getVoiceLineForPhase(phase, countdown, options = {}) {
  const framingMode = options.framingMode === 'manual' ? 'manual' : 'auto'
  if (isCountdownPhase(phase) && countdown === 3) return videoScanVoiceLines.countdown3
  if (isCountdownPhase(phase) && countdown === 2) return videoScanVoiceLines.countdown2
  if (isCountdownPhase(phase) && countdown === 1) return videoScanVoiceLines.countdown1
  if (isCapturePhase(phase)) return videoScanVoiceLines.capturing
  if (phase === 'front_prepare' || phase === 'prepare') {
    return framingMode === 'manual'
      ? `${videoScanVoiceLines.front_prepare_manual} ${videoScanVoiceLines.manual_confirm}`
      : videoScanVoiceLines.front_prepare
  }
  if (phase === 'front_done') return videoScanVoiceLines.front_done
  if (phase === 'side_prepare') {
    return framingMode === 'manual'
      ? `${videoScanVoiceLines.side_prepare} ${videoScanVoiceLines.front_prepare_manual}`
      : videoScanVoiceLines.side_prepare
  }
  if (phase === 'side_done') return videoScanVoiceLines.side_done
  if (phase === 'back_prepare') {
    return framingMode === 'manual'
      ? `${videoScanVoiceLines.back_prepare} ${videoScanVoiceLines.front_prepare_manual}`
      : videoScanVoiceLines.back_prepare
  }
  if (phase === 'back_done') return videoScanVoiceLines.back_done
  if (isCountdownPhase(phase)) return videoScanVoiceLines.hold
  return ''
}

export function speakVideoScanLine(text, { enabled = true, speechSynthesis } = {}) {
  const synth = speechSynthesis || (typeof window !== 'undefined' ? window.speechSynthesis : null)
  if (!enabled || !text || !synth?.speak || typeof SpeechSynthesisUtterance === 'undefined') {
    return false
  }

  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'sv-SE'
  utterance.rate = 0.95
  synth.speak(utterance)
  return true
}

export function cancelVideoScanSpeech(speechSynthesis) {
  const synth = speechSynthesis || (typeof window !== 'undefined' ? window.speechSynthesis : null)
  synth?.cancel?.()
}

export function reduceVideoScan(state, action) {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        analysisError: '',
        analysisStatus: '',
        autoFramingAvailable: Boolean(action.autoFramingAvailable),
        capturing: false,
        countdown: null,
        error: '',
        faceStatus: 'pending',
        framingMode: action.framingMode === 'auto' ? 'auto' : action.framingMode === 'manual' ? 'manual' : state.framingMode,
        phase: 'prepare',
        pose: 'front',
        positionMessage: '',
        positionStatus: 'idle',
      }
    case 'CAMERA_READY':
      return {
        ...state,
        cameraActive: true,
        error: '',
        phase: state.phase === 'prepare' || state.phase === 'idle' ? 'front_prepare' : state.phase,
        pose: state.pose || 'front',
      }
    case 'CAMERA_ERROR':
      return {
        ...state,
        cameraActive: false,
        capturing: false,
        countdown: null,
        error: action.message || 'Kameran kunde inte starta.',
        phase: 'error',
      }
    case 'BEGIN_COUNTDOWN': {
      const pose = action.pose || state.pose || 'front'
      if (state.capturing) return state
      if (state.paused) return state
      if (!isPreparePhase(state.phase) && state.phase !== 'prepare') return state
      return {
        ...state,
        capturing: false,
        countdown: videoScanCountdownStart,
        error: '',
        phase: getCountdownPhase(pose),
        pose,
        positionStatus: 'valid',
        positionMessage: 'Bra position — håll still',
      }
    }
    case 'CANCEL_COUNTDOWN':
      if (!isCountdownPhase(state.phase)) return state
      return {
        ...state,
        capturing: false,
        countdown: null,
        error: '',
        phase: getPreparePhase(state.pose || 'front'),
        positionMessage: action.message || 'Positionen ändrades — ställ dig i ramen igen.',
        positionStatus: 'invalid',
      }
    case 'PAUSE': {
      if (state.paused) return state
      // Pausing during a countdown must drop the countdown, never capture silently.
      const wasCountingDown = isCountdownPhase(state.phase)
      return {
        ...state,
        capturing: false,
        countdown: wasCountingDown ? null : state.countdown,
        paused: true,
        phase: wasCountingDown ? getPreparePhase(state.pose || 'front') : state.phase,
        positionMessage: wasCountingDown ? 'Pausad — nedräkningen avbröts.' : state.positionMessage,
        positionStatus: wasCountingDown ? 'invalid' : state.positionStatus,
      }
    }
    case 'RESUME':
      if (!state.paused) return state
      return { ...state, paused: false }
    case 'SET_FRAMING_MODE': {
      const framingMode = action.mode === 'auto' ? 'auto' : 'manual'
      const leaveCountdown = isCountdownPhase(state.phase) && framingMode !== state.framingMode
      return {
        ...state,
        countdown: leaveCountdown ? null : state.countdown,
        framingMode,
        phase: leaveCountdown ? getPreparePhase(state.pose || 'front') : state.phase,
      }
    }
    case 'SET_POSITION':
      if (state.positionStatus === (action.status || state.positionStatus) && state.positionMessage === (action.message || '')) {
        return state
      }
      return {
        ...state,
        positionMessage: action.message || '',
        positionStatus: action.status || state.positionStatus,
      }
    case 'SET_ANALYSIS_STATUS':
      return {
        ...state,
        analysisError: action.error || '',
        analysisStatus: action.status || '',
      }
    case 'TICK_COUNTDOWN': {
      if (!isCountdownPhase(state.phase)) return state
      if (state.countdown === null) return state
      if (state.countdown <= 1) {
        return {
          ...state,
          capturing: true,
          countdown: 0,
          phase: getCapturePhase(state.pose),
        }
      }
      return { ...state, countdown: state.countdown - 1 }
    }
    case 'POSE_CAPTURED': {
      const pose = action.pose || state.pose
      return {
        ...state,
        capturing: false,
        countdown: null,
        faceStatus: action.faceStatus || state.faceStatus,
        phase: getDonePhase(pose),
        pose,
      }
    }
    case 'ADVANCE': {
      if (state.phase === 'front_done') {
        return { ...state, capturing: false, countdown: null, phase: 'side_prepare', pose: 'side' }
      }
      if (state.phase === 'side_done') {
        return { ...state, capturing: false, countdown: null, phase: 'back_prepare', pose: 'back' }
      }
      if (state.phase === 'back_done') {
        return { ...state, capturing: false, countdown: null, phase: 'review', pose: null }
      }
      return state
    }
    case 'RETAKE_POSE': {
      const pose = action.pose
      if (!videoScanPoses.includes(pose)) return state
      return {
        ...state,
        capturing: false,
        countdown: null,
        error: '',
        faceStatus: 'pending',
        phase: getPreparePhase(pose),
        pose,
      }
    }
    case 'RETAKE_ALL':
      return {
        ...initialVideoScanState,
        autoFramingAvailable: state.autoFramingAvailable,
        cameraActive: state.cameraActive,
        faceMode: state.faceMode,
        facingMode: state.facingMode,
        framingMode: state.framingMode,
        phase: 'front_prepare',
        pose: 'front',
        voiceEnabled: state.voiceEnabled,
        zoom: state.zoom,
        zoomMode: state.zoomMode,
      }
    case 'CANCEL':
      return {
        ...initialVideoScanState,
        faceMode: state.faceMode,
        voiceEnabled: state.voiceEnabled,
      }
    case 'SET_VOICE':
      return { ...state, voiceEnabled: Boolean(action.enabled) }
    case 'SET_FACE_MODE':
      return { ...state, faceMode: action.mode, faceStatus: 'pending' }
    case 'SET_FACE_STATUS':
      return { ...state, faceStatus: action.status }
    case 'SET_ZOOM': {
      const zoom = clampVideoScanZoom(action.zoom)
      const zoomMode = action.zoomMode || state.zoomMode
      if (state.zoom === zoom && state.zoomMode === zoomMode) return state
      return { ...state, zoom, zoomMode }
    }
    case 'SET_FACING': {
      const facingMode = action.facingMode || defaultVideoScanFacingMode
      if (state.facingMode === facingMode && !isCountdownPhase(state.phase)) return state
      return {
        ...state,
        countdown: isCountdownPhase(state.phase) ? null : state.countdown,
        facingMode,
        phase: isCountdownPhase(state.phase) ? getPreparePhase(state.pose || 'front') : state.phase,
      }
    }
    case 'ANALYZING':
      return { ...state, analysisError: '', analysisStatus: 'Analyserar kroppen...', phase: 'analyzing' }
    case 'ANALYSIS_FINISHED':
      return {
        ...state,
        cameraActive: false,
        capturing: false,
        analysisError: action.ok ? '' : (action.error || state.analysisError),
        analysisStatus: action.ok ? '' : (action.error || state.analysisStatus),
        phase: action.ok ? 'done' : 'review',
      }
    case 'DONE':
      return { ...state, cameraActive: false, capturing: false, phase: 'done' }
    default:
      return state
  }
}

export function getUpperRegionBox(width, height) {
  return {
    height: Math.round(height * 0.22),
    width: Math.round(width * 0.42),
    x: Math.round(width * 0.29),
    y: Math.round(height * 0.04),
  }
}

export function getFaceBoxesFromDetector(faces = [], width, height) {
  return faces
    .map((face) => {
      const box = face.boundingBox || face
      const x = Math.max(0, Number(box.x) - 8)
      const y = Math.max(0, Number(box.y) - 8)
      const w = Math.min(width - x, Number(box.width) + 16)
      const h = Math.min(height - y, Number(box.height) + 16)
      return { height: h, width: w, x, y }
    })
    .filter((box) => box.width > 8 && box.height > 8)
}

function fillCoverRegion(context, box) {
  context.fillStyle = 'rgb(8, 12, 22)'
  context.beginPath()
  context.ellipse(
    box.x + box.width / 2,
    box.y + box.height / 2,
    box.width / 2,
    box.height / 2,
    0,
    0,
    Math.PI * 2,
  )
  context.fill()
}

function copyCanvasPixels(canvas) {
  if (typeof document === 'undefined' || !canvas) return null
  const source = document.createElement('canvas')
  source.width = canvas.width
  source.height = canvas.height
  const sourceContext = source.getContext('2d')
  if (!sourceContext) return null
  sourceContext.drawImage(canvas, 0, 0)
  return source
}

function clipEllipse(context, box) {
  context.beginPath()
  context.ellipse(
    box.x + box.width / 2,
    box.y + box.height / 2,
    Math.max(1, box.width / 2),
    Math.max(1, box.height / 2),
    0,
    0,
    Math.PI * 2,
  )
}

function applyPixelBufferBlur(context, source, box) {
  const sourceContext = source.getContext('2d')
  if (!sourceContext?.getImageData) return false
  const imageData = sourceContext.getImageData(box.x, box.y, Math.max(1, box.width), Math.max(1, box.height))
  const before = new Uint8ClampedArray(imageData.data)
  boxBlurRgba(imageData.data, imageData.width, imageData.height, 7)
  boxBlurRgba(imageData.data, imageData.width, imageData.height, 7)
  if (!pixelsDiffer(before, imageData.data)) return false
  sourceContext.putImageData(imageData, box.x, box.y)
  context.save()
  clipEllipse(context, box)
  context.clip()
  context.drawImage(source, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height)
  context.restore()
  return true
}

function applyDownsampleBlur(context, source, box) {
  const tiny = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const tinyContext = tiny?.getContext?.('2d')
  const sampleW = Math.max(6, Math.round(box.width / 16))
  const sampleH = Math.max(6, Math.round(box.height / 16))
  context.save()
  clipEllipse(context, box)
  context.clip?.()
  context.imageSmoothingEnabled = true
  if (tinyContext) {
    tiny.width = sampleW
    tiny.height = sampleH
    tinyContext.imageSmoothingEnabled = true
    tinyContext.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, sampleW, sampleH)
    context.drawImage(tiny, 0, 0, sampleW, sampleH, box.x, box.y, box.width, box.height)
  } else {
    context.drawImage(source, box.x, box.y, box.width, box.height, box.x, box.y, sampleW, sampleH)
    context.drawImage(context.canvas, box.x, box.y, sampleW, sampleH, box.x, box.y, box.width, box.height)
  }
  context.restore()
  return true
}

function fillMaskRegion(context, box, mode) {
  try {
    if (mode === 'cover') {
      fillCoverRegion(context, box)
      return true
    }

    const source = copyCanvasPixels(context.canvas) || context.canvas

    if (mode === 'pixelate') {
      const tiny = typeof document !== 'undefined' ? document.createElement('canvas') : null
      if (!tiny) return false
      tiny.width = Math.max(4, Math.round(box.width / 8))
      tiny.height = Math.max(4, Math.round(box.height / 8))
      const tinyContext = tiny.getContext('2d')
      tinyContext.imageSmoothingEnabled = false
      tinyContext.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, tiny.width, tiny.height)
      context.save()
      clipEllipse(context, box)
      context.clip()
      context.imageSmoothingEnabled = false
      context.drawImage(tiny, 0, 0, tiny.width, tiny.height, box.x, box.y, box.width, box.height)
      context.restore()
      return true
    }

    try {
      if (applyPixelBufferBlur(context, source, box)) return true
    } catch {
      // Safari can throw on getImageData; fall through to downsample.
    }
    if (applyDownsampleBlur(context, source, box)) return true
    fillCoverRegion(context, box)
    return true
  } catch {
    fillCoverRegion(context, box)
    return true
  }
}

export function applyFaceProtectionToCanvas(canvas, {
  faces = [],
  mode = defaultFaceProtectionMode,
  maskBox,
  faceDetectorSupported,
} = {}) {
  const outcome = getFaceProtectionOutcome(mode, faces, {
    faceDetectorSupported,
    hasManualMask: Boolean(maskBox),
  })

  if (!canvas?.getContext) {
    return { ...outcome, pixelsChanged: false }
  }

  if (!outcome.bakedIntoPixels) {
    return { ...outcome, pixelsChanged: false }
  }

  const context = canvas.getContext('2d')
  const boxes = outcome.method === 'detected'
    ? getFaceBoxesFromDetector(faces, canvas.width, canvas.height)
    : [maskBox || getUpperRegionBox(canvas.width, canvas.height)]
  const paintMode = mode === 'pixelate' ? 'pixelate' : mode === 'cover' ? 'cover' : 'blur'

  const painted = boxes.some((box) => fillMaskRegion(context, box, paintMode))
  if (!painted) {
    return {
      applied: false,
      bakedIntoPixels: false,
      label: 'Ansiktsskydd kunde inte verifieras',
      method: outcome.method,
      pixelsChanged: false,
      status: 'unavailable',
    }
  }
  return { ...outcome, pixelsChanged: true }
}

export async function detectFacesLocally(image) {
  if (typeof window === 'undefined' || typeof window.FaceDetector !== 'function') {
    return []
  }

  try {
    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 })
    const faces = await detector.detect(image)
    return Array.isArray(faces) ? faces : []
  } catch {
    return []
  }
}

export function drawVideoFrameToCanvas(video, canvas) {
  if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
    return false
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return true
}

export const maxScanImageEdgePx = 1600
export const allowedScanImageTypes = ['image/jpeg', 'image/jpg', 'image/png']

export function getScaledScanDimensions(width, height, maxEdge = maxScanImageEdgePx) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 0))
  const sourceHeight = Math.max(1, Math.round(Number(height) || 0))
  const longestEdge = Math.max(sourceWidth, sourceHeight)
  if (!Number.isFinite(maxEdge) || maxEdge <= 0 || longestEdge <= maxEdge) {
    return { height: sourceHeight, width: sourceWidth }
  }
  const scale = maxEdge / longestEdge
  return {
    height: Math.max(1, Math.round(sourceHeight * scale)),
    width: Math.max(1, Math.round(sourceWidth * scale)),
  }
}

export function isAllowedScanImageType(type) {
  return allowedScanImageTypes.includes(String(type || '').toLowerCase())
}

/**
 * Re-encodes a picked image through a canvas.
 *
 * Drawing to a canvas and reading it back with toBlob rebuilds the pixel data
 * from scratch, so EXIF/GPS metadata from the original file is not carried
 * over. This is the same pipeline the video capture path uses, so photo mode
 * and video mode upload byte-equivalent kinds of files.
 */
export async function reencodeImageFileToScanFile(file, poseKey, {
  documentRef = typeof document !== 'undefined' ? document : null,
  maxEdge = maxScanImageEdgePx,
  quality = 0.9,
} = {}) {
  if (!file || !documentRef?.createElement) {
    throw new Error('Bilden kunde inte läsas om.')
  }
  if (!isAllowedScanImageType(file.type)) {
    throw new Error('Bilden måste vara JPEG eller PNG.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Bilden kunde inte läsas om.'))
      element.src = objectUrl
    })

    const { height, width } = getScaledScanDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxEdge,
    )
    const canvas = documentRef.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Bilden kunde inte läsas om.')
    context.drawImage(image, 0, 0, width, height)

    const reencoded = await canvasToScanFile(canvas, poseKey, { quality })
    return {
      file: reencoded,
      preview: canvas.toDataURL('image/jpeg', 0.88),
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function canvasToScanFile(canvas, pose, { quality = 0.9 } = {}) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Bilden kunde inte sparas.'))
        return
      }
      const name = `video-scan-${pose}.jpg`
      try {
        resolve(new File([blob], name, { type: 'image/jpeg' }))
      } catch {
        blob.name = name
        blob.lastModified = Date.now()
        resolve(blob)
      }
    }, 'image/jpeg', quality)
  })
}

export function shouldBlockAnalysisForFaceProtection(faceMode, faceStatus) {
  return faceMode === 'auto' && faceStatus === 'unavailable'
}

export function getBodyScanAnalysisBlockReason({
  photos = {},
  faceMode,
  faceStatus,
  hasApprovedAnalysis = true,
  isAnalyzing = false,
  isFreeLimitReached = false,
} = {}) {
  if (isAnalyzing) return null
  if (!photos.front) return 'Framifrån-bilden saknas.'
  if (!photos.side) return 'Sidan-bilden saknas.'
  if (!photos.back) return 'Bakifrån-bilden saknas.'
  if (shouldBlockAnalysisForFaceProtection(faceMode, faceStatus) && faceMode === 'auto') {
    return 'Ansiktsmaskeringen kunde inte verifieras.'
  }
  if (!hasApprovedAnalysis) return 'Godkänn AI-analysen först.'
  if (isFreeLimitReached) {
    return 'Gratisgränsen är nådd. Radera en analys eller invänta verifierad premiumåtkomst.'
  }
  return null
}

export function revokePreviewUrls(urls = []) {
  urls.forEach((url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  })
  return []
}


