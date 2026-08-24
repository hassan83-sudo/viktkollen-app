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

export const videoScanVoiceLines = {
  back_done: 'Scanning klar.',
  back_prepare: 'Vänd ryggen mot kameran.',
  countdown1: 'Ett.',
  countdown2: 'Två.',
  countdown3: 'Tre.',
  capturing: 'Fångar.',
  front_done: 'Framifrån klar.',
  front_prepare: 'Stå framifrån mot kameran.',
  hold: 'Håll positionen.',
  side_done: 'Från sidan klar.',
  side_prepare: 'Vänd dig åt höger.',
}

export const initialVideoScanState = {
  cameraActive: false,
  capturing: false,
  countdown: null,
  error: '',
  faceMode: defaultFaceProtectionMode,
  faceStatus: 'pending',
  facingMode: defaultVideoScanFacingMode,
  phase: 'idle',
  pose: null,
  voiceEnabled: true,
  zoom: 1,
  zoomMode: 'unknown',
}

export function isVideoScanActive(phase) {
  return phase !== 'idle' && phase !== 'done' && phase !== 'error' && phase !== 'review' && phase !== 'analyzing'
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
    back_prepare: 'Vänd ryggen mot kameran',
    error: 'Scanningen kunde inte fortsätta.',
    front_countdown: 'Håll positionen framifrån.',
    front_capture: 'Fångar framifrån...',
    front_done: 'Framifrån klar ✓',
    front_prepare: 'Stå rakt fram mot kameran',
    idle: 'Starta en guidat videoscanning.',
    prepare: 'Placera hela kroppen i ramen. Huvud och fötter ska synas.',
    review: 'Scanning klar ✓',
    side_countdown: 'Håll positionen från sidan.',
    side_capture: 'Fångar från sidan...',
    side_done: 'Från sidan klar ✓',
    side_prepare: 'Vänd dig åt höger',
  }

  return instructions[phase] || ''
}

export function getVideoScanDirection(phase) {
  if (phase.startsWith('side')) {
    return { arrow: '→', label: 'VÄND DIG ÅT HÖGER' }
  }
  if (phase.startsWith('back')) {
    return { arrow: '↻', label: 'VÄND RYGGEN MOT KAMERAN' }
  }
  if (phase.startsWith('front') || phase === 'prepare') {
    return { arrow: '↑', label: 'STÅ RAKT FRAM' }
  }
  return null
}

export function getVideoScanCameraIndicator(phase, cameraActive) {
  if (!cameraActive) return { kind: 'off', label: 'Kamera av' }
  if (isCapturePhase(phase)) return { kind: 'recording', label: 'Spelar in' }
  return { kind: 'live', label: 'Kamera aktiv' }
}

export function getFaceProtectionOutcome(mode, faces = []) {
  const detected = Array.isArray(faces) && faces.length > 0

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
    return detected
      ? {
          applied: true,
          bakedIntoPixels: true,
          label: 'Ansiktsskydd aktivt ✓',
          method: 'detected',
          status: 'applied',
        }
      : {
          applied: false,
          bakedIntoPixels: false,
          label: 'Ansiktsskydd kunde inte appliceras.',
          method: 'none',
          status: 'unavailable',
        }
  }

  if (detected) {
    return {
      applied: true,
      bakedIntoPixels: true,
      label: 'Ansiktsskydd aktivt ✓',
      method: 'detected',
      status: 'applied',
    }
  }

  return {
    applied: true,
    bakedIntoPixels: true,
    label: 'Ungefärlig huvudzon skyddas. Det är inte en säker ansiktsdetektering.',
    method: 'upper-region',
    status: 'approximate',
  }
}

export function clampVideoScanZoom(value) {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return minVideoScanZoom
  return Math.min(maxVideoScanZoom, Math.max(minVideoScanZoom, Math.round(zoom * 10) / 10))
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

export function getVoiceLineForPhase(phase, countdown) {
  if (isCountdownPhase(phase) && countdown === 3) return videoScanVoiceLines.countdown3
  if (isCountdownPhase(phase) && countdown === 2) return videoScanVoiceLines.countdown2
  if (isCountdownPhase(phase) && countdown === 1) return videoScanVoiceLines.countdown1
  if (isCapturePhase(phase)) return videoScanVoiceLines.capturing
  if (phase === 'front_prepare' || phase === 'prepare') return videoScanVoiceLines.front_prepare
  if (phase === 'front_done') return videoScanVoiceLines.front_done
  if (phase === 'side_prepare') return videoScanVoiceLines.side_prepare
  if (phase === 'side_done') return videoScanVoiceLines.side_done
  if (phase === 'back_prepare') return videoScanVoiceLines.back_prepare
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
        capturing: false,
        countdown: null,
        error: '',
        faceStatus: 'pending',
        phase: 'prepare',
        pose: 'front',
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
      return {
        ...state,
        capturing: false,
        countdown: videoScanCountdownStart,
        error: '',
        phase: getCountdownPhase(pose),
        pose,
      }
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
        cameraActive: state.cameraActive,
        faceMode: state.faceMode,
        facingMode: state.facingMode,
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
    case 'SET_ZOOM':
      return {
        ...state,
        zoom: clampVideoScanZoom(action.zoom),
        zoomMode: action.zoomMode || state.zoomMode,
      }
    case 'SET_FACING':
      return { ...state, facingMode: action.facingMode || defaultVideoScanFacingMode }
    case 'ANALYZING':
      return { ...state, phase: 'analyzing' }
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

function fillMaskRegion(context, box, mode) {
  if (mode === 'pixelate') {
    const sample = Math.max(8, Math.round(box.width / 8))
    context.imageSmoothingEnabled = false
    context.drawImage(
      context.canvas,
      box.x,
      box.y,
      box.width,
      box.height,
      box.x,
      box.y,
      sample,
      sample,
    )
    context.drawImage(
      context.canvas,
      box.x,
      box.y,
      sample,
      sample,
      box.x,
      box.y,
      box.width,
      box.height,
    )
    context.imageSmoothingEnabled = true
    return
  }

  context.save()
  context.filter = 'blur(18px)'
  context.drawImage(
    context.canvas,
    box.x,
    box.y,
    box.width,
    box.height,
    box.x,
    box.y,
    box.width,
    box.height,
  )
  context.restore()
  context.fillStyle = 'rgba(8, 12, 22, 0.55)'
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

export function applyFaceProtectionToCanvas(canvas, { faces = [], mode = defaultFaceProtectionMode } = {}) {
  if (!canvas?.getContext) {
    return getFaceProtectionOutcome(mode, faces)
  }

  const outcome = getFaceProtectionOutcome(mode, faces)
  if (!outcome.bakedIntoPixels) {
    return outcome
  }

  const context = canvas.getContext('2d')
  const boxes = outcome.method === 'detected'
    ? getFaceBoxesFromDetector(faces, canvas.width, canvas.height)
    : [getUpperRegionBox(canvas.width, canvas.height)]

  boxes.forEach((box) => fillMaskRegion(context, box, mode === 'pixelate' ? 'pixelate' : 'blur'))
  return outcome
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

export function canvasToScanFile(canvas, pose) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Bilden kunde inte sparas.'))
        return
      }
      resolve(new File([blob], `video-scan-${pose}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  })
}

export function shouldBlockAnalysisForFaceProtection(faceMode, faceStatus) {
  return faceMode === 'auto' && faceStatus === 'unavailable'
}

export function revokePreviewUrls(urls = []) {
  urls.forEach((url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  })
  return []
}


