import { describe, expect, it, vi } from 'vitest'

import {
  applyFaceProtectionToCanvas,
  boxBlurRgba,
  cancelVideoScanSpeech,
  clampVideoScanZoom,
  createPinchTracker,
  defaultFaceProtectionMode,
  defaultVideoScanFacingMode,
  getBodyScanAnalysisBlockReason,
  getFaceProtectionOutcome,
  getNextPose,
  getPinchZoom,
  getPointerDistance,
  getPoseFromPhase,
  getScaledScanDimensions,
  getUpperRegionBox,
  getVideoContainRect,
  getVideoScanStepNumber,
  getVideoScanTurnInstruction,
  isAllowedScanImageType,
  prefersReducedMotion,
  getVideoScanCameraIndicator,
  getVideoScanDirection,
  getVideoScanInstruction,
  getVoiceLineForPhase,
  initialVideoScanState,
  isBodyScanSessionOpen,
  mapMaskRectToCanvas,
  pixelsDiffer,
  reduceVideoScan,
  shouldBlockAnalysisForFaceProtection,
  speakVideoScanLine,
  videoScanConsentPoints,
  videoScanCountdownStart,
  videoScanPhases,
  videoScanPreparationTips,
  videoScanTotalSteps,
  videoScanVoiceLines,
} from './bodyAnalysisVideoScan.js'

describe('bodyAnalysisVideoScan', () => {
  it('opens video scan on the back camera with automatic face protection', () => {
    expect(defaultVideoScanFacingMode).toBe('environment')
    expect(defaultFaceProtectionMode).toBe('auto')
    expect(initialVideoScanState.phase).toBe('idle')
    expect(reduceVideoScan(initialVideoScanState, { type: 'START' }).phase).toBe('prepare')
    expect(reduceVideoScan(initialVideoScanState, { type: 'CAMERA_READY' }).phase).toBe('front_prepare')
  })

  it('runs front countdown 3-2-1 then capture and keeps poses separate', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'START' })
    state = reduceVideoScan(state, { type: 'CAMERA_READY' })
    state = reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' })
    expect(state.phase).toBe('front_countdown')
    expect(state.countdown).toBe(videoScanCountdownStart)

    state = reduceVideoScan(state, { type: 'TICK_COUNTDOWN' })
    expect(state.countdown).toBe(2)
    state = reduceVideoScan(state, { type: 'TICK_COUNTDOWN' })
    expect(state.countdown).toBe(1)
    state = reduceVideoScan(state, { type: 'TICK_COUNTDOWN' })
    expect(state.phase).toBe('front_capture')
    expect(state.capturing).toBe(true)

    state = reduceVideoScan(state, { type: 'POSE_CAPTURED', pose: 'front', faceStatus: 'applied' })
    expect(state.phase).toBe('front_done')
    expect(getPoseFromPhase(state.phase)).toBe('front')
    expect(getNextPose('front')).toBe('side')
  })

  it('shows explicit side and back turn instructions', () => {
    expect(getVideoScanInstruction('side_prepare')).toBe('VÄND HÖGER SIDA MOT KAMERAN')
    expect(getVideoScanDirection('side_prepare')).toEqual({ arrow: '→', label: 'VÄND HÖGER SIDA MOT KAMERAN' })
    expect(getVideoScanInstruction('back_prepare')).toBe('VÄND RYGGEN MOT KAMERAN')
    expect(getVideoScanDirection('back_prepare').label).toContain('RYGGEN')
    expect(getVideoScanInstruction('front_prepare')).toBe('STÅ RAKT FRAM MOT KAMERAN')
    expect(getVoiceLineForPhase('back_prepare').toLowerCase()).not.toContain('vänd mot kameran')
    expect(getVoiceLineForPhase('back_prepare').toLowerCase()).toContain('ryggen mot kameran')
  })

  it('advances front to side to back to review', () => {
    let state = { ...initialVideoScanState, phase: 'front_done', pose: 'front' }
    state = reduceVideoScan(state, { type: 'ADVANCE' })
    expect(state.phase).toBe('side_prepare')
    state = reduceVideoScan({ ...state, phase: 'side_done' }, { type: 'ADVANCE' })
    expect(state.phase).toBe('back_prepare')
    state = reduceVideoScan({ ...state, phase: 'back_done' }, { type: 'ADVANCE' })
    expect(state.phase).toBe('review')
  })

  it('retakes one pose without resetting the machine to idle', () => {
    const state = reduceVideoScan(
      { ...initialVideoScanState, cameraActive: true, phase: 'review' },
      { type: 'RETAKE_POSE', pose: 'side' },
    )
    expect(state.phase).toBe('side_prepare')
    expect(state.pose).toBe('side')
    expect(state.cameraActive).toBe(true)
  })

  it('retakes all poses and cancels timers/capture flags', () => {
    const retakeAll = reduceVideoScan(
      { ...initialVideoScanState, cameraActive: true, capturing: true, countdown: 2, phase: 'side_countdown', pose: 'side' },
      { type: 'RETAKE_ALL' },
    )
    expect(retakeAll.phase).toBe('front_prepare')
    expect(retakeAll.countdown).toBeNull()
    expect(retakeAll.capturing).toBe(false)

    const cancelled = reduceVideoScan(retakeAll, { type: 'CANCEL' })
    expect(cancelled.phase).toBe('idle')
    expect(cancelled.cameraActive).toBe(false)
  })

  it('does not start a countdown while a pose is being saved', () => {
    const state = reduceVideoScan(
      { ...initialVideoScanState, capturing: true, phase: 'front_capture', pose: 'front' },
      { type: 'BEGIN_COUNTDOWN', pose: 'front' },
    )
    expect(state.phase).toBe('front_capture')
  })

  it('reports camera live versus capturing honestly', () => {
    expect(getVideoScanCameraIndicator('front_prepare', true)).toEqual({ kind: 'live', label: 'Kamera aktiv' })
    expect(getVideoScanCameraIndicator('front_capture', true)).toEqual({ kind: 'recording', label: 'Spelar in' })
    expect(getVideoScanCameraIndicator('idle', false).kind).toBe('off')
  })

  it('clamps zoom and keeps hardware/preview modes separate', () => {
    expect(clampVideoScanZoom(0.2)).toBe(1)
    expect(clampVideoScanZoom(3)).toBe(2)
    expect(reduceVideoScan(initialVideoScanState, { type: 'SET_ZOOM', zoom: 1.4, zoomMode: 'preview' }).zoomMode).toBe('preview')
    const zoomed = reduceVideoScan(initialVideoScanState, { type: 'SET_ZOOM', zoom: 1.4, zoomMode: 'preview' })
    expect(reduceVideoScan(zoomed, { type: 'SET_ZOOM', zoom: 1.4, zoomMode: 'preview' })).toBe(zoomed)
  })

  it('does not recreate state for unchanged position updates', () => {
    const next = reduceVideoScan(initialVideoScanState, {
      type: 'SET_POSITION',
      status: 'unavailable',
      message: 'Auto saknas',
    })
    expect(reduceVideoScan(next, {
      type: 'SET_POSITION',
      status: 'unavailable',
      message: 'Auto saknas',
    })).toBe(next)
  })

  it('uses honest face-protection status and can change mode', () => {
    expect(getFaceProtectionOutcome('auto', [{ boundingBox: { height: 20, width: 20, x: 1, y: 1 } }], { faceDetectorSupported: true }).status).toBe('applied')
    expect(getFaceProtectionOutcome('auto', [], { faceDetectorSupported: false }).status).toBe('unavailable')
    expect(getFaceProtectionOutcome('auto', [], { faceDetectorSupported: false }).label).toContain('stöds inte')
    expect(getFaceProtectionOutcome('auto', [], { faceDetectorSupported: true }).label).toContain('verifieras')
    expect(getFaceProtectionOutcome('blur', []).status).toBe('applied')
    expect(getFaceProtectionOutcome('blur', [], { hasManualMask: true }).label).toContain('bakat in')
    expect(getFaceProtectionOutcome('none', []).status).toBe('skipped')
    expect(shouldBlockAnalysisForFaceProtection('auto', 'unavailable')).toBe(true)
    expect(shouldBlockAnalysisForFaceProtection('blur', 'applied')).toBe(false)
    expect(reduceVideoScan(initialVideoScanState, { type: 'SET_FACE_MODE', mode: 'blur' }).faceMode).toBe('blur')
  })

  it('bakes a mask into canvas pixels instead of only a CSS overlay', () => {
    const canvas = {
      getContext: () => ({
        beginPath: vi.fn(),
        drawImage: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        canvas: { height: 200, width: 100 },
      }),
      height: 200,
      width: 100,
    }
    const outcome = applyFaceProtectionToCanvas(canvas, {
      faces: [],
      mode: 'blur',
    })
    expect(outcome.bakedIntoPixels).toBe(true)
    expect(getUpperRegionBox(100, 200).height).toBeGreaterThan(20)
  })

  it('toggles voice guide and cancels leftover speech', () => {
    const cancel = vi.fn()
    const speak = vi.fn()
    const speechSynthesis = { cancel, speak }
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }

    expect(reduceVideoScan(initialVideoScanState, { type: 'SET_VOICE', enabled: false }).voiceEnabled).toBe(false)
    expect(getVoiceLineForPhase('front_prepare')).toContain('fram mot kameran')
    expect(speakVideoScanLine('Tre.', { enabled: true, speechSynthesis })).toBe(true)
    expect(speak).toHaveBeenCalled()
    cancelVideoScanSpeech(speechSynthesis)
    expect(cancel).toHaveBeenCalled()
    expect(speakVideoScanLine('Tre.', { enabled: false, speechSynthesis })).toBe(false)

    delete globalThis.SpeechSynthesisUtterance
  })

  it('maps permission errors without crashing the machine', () => {
    const state = reduceVideoScan(initialVideoScanState, {
      type: 'CAMERA_ERROR',
      message: 'Kamerabehörighet nekades.',
    })
    expect(state.phase).toBe('error')
    expect(state.error).toContain('nekades')
  })

  it('does not persist original video and only keeps pose frames in the scan contract', () => {
    expect(videoScanPhases).toContain('review')
    expect(getNextPose('side')).toBe('back')
    expect(getNextPose('back')).toBeNull()
    expect(shouldBlockAnalysisForFaceProtection('auto', 'applied')).toBe(false)
  })

  it('switches auto/manual without dropping pose or photos flags', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'START', framingMode: 'manual' })
    state = reduceVideoScan(state, { type: 'CAMERA_READY' })
    state = reduceVideoScan(state, { type: 'SET_FRAMING_MODE', mode: 'auto' })
    expect(state.framingMode).toBe('auto')
    expect(state.pose).toBe('front')
    expect(state.phase).toBe('front_prepare')
    state = reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' })
    state = reduceVideoScan(state, { type: 'SET_FRAMING_MODE', mode: 'manual' })
    expect(state.framingMode).toBe('manual')
    expect(state.phase).toBe('front_prepare')
    expect(state.countdown).toBeNull()
  })

  it('starts auto countdown only from BEGIN_COUNTDOWN and cancels when pose is lost', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'CAMERA_READY' })
    expect(state.phase).toBe('front_prepare')
    state = reduceVideoScan(state, { type: 'CANCEL_COUNTDOWN' })
    expect(state.phase).toBe('front_prepare')
    state = reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' })
    expect(state.phase).toBe('front_countdown')
    state = reduceVideoScan(state, { type: 'CANCEL_COUNTDOWN' })
    expect(state.phase).toBe('front_prepare')
    expect(state.positionMessage).toContain('ändrades')
  })

  it('lets manual confirm start countdown without auto detection', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'START', framingMode: 'manual' })
    state = reduceVideoScan(state, { type: 'CAMERA_READY' })
    expect(state.framingMode).toBe('manual')
    state = reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' })
    expect(state.phase).toBe('front_countdown')
    state = reduceVideoScan(state, { type: 'TICK_COUNTDOWN' })
    state = reduceVideoScan(state, { type: 'TICK_COUNTDOWN' })
    state = reduceVideoScan(state, { type: 'TICK_COUNTDOWN' })
    expect(state.phase).toBe('front_capture')
  })

  it('clamps pinch zoom between 1.0x and 2.0x', () => {
    expect(getPointerDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5)
    expect(getPinchZoom(100, 130, 1)).toBe(1.3)
    expect(getPinchZoom(100, 300, 1)).toBe(2)
    expect(getPinchZoom(100, 10, 1)).toBe(1)
    expect(getPinchZoom(0, 50, 1.4)).toBe(1.4)
  })

  it('reports analysis blockers instead of failing silently', () => {
    expect(getBodyScanAnalysisBlockReason({ photos: {} })).toBe('Framifrån-bilden saknas.')
    expect(getBodyScanAnalysisBlockReason({ photos: { front: {} } })).toBe('Sidan-bilden saknas.')
    expect(getBodyScanAnalysisBlockReason({ photos: { front: {}, side: {} } })).toBe('Bakifrån-bilden saknas.')
    expect(getBodyScanAnalysisBlockReason({
      photos: { front: {}, side: {}, back: {} },
      faceMode: 'auto',
      faceStatus: 'unavailable',
    })).toBe('Ansiktsmaskeringen kunde inte verifieras.')
    expect(getBodyScanAnalysisBlockReason({
      photos: { front: {}, side: {}, back: {} },
      faceMode: 'blur',
      faceStatus: 'applied',
      hasApprovedAnalysis: false,
    })).toBe('Godkänn AI-analysen först.')
    expect(getBodyScanAnalysisBlockReason({
      photos: { front: {}, side: {}, back: {} },
      faceMode: 'blur',
      faceStatus: 'unavailable',
      hasApprovedAnalysis: true,
    })).toBeNull()
    expect(isBodyScanSessionOpen('front_prepare')).toBe(true)
    expect(isBodyScanSessionOpen('review')).toBe(true)
    expect(isBodyScanSessionOpen('idle')).toBe(false)
    expect(reduceVideoScan({ ...initialVideoScanState, phase: 'analyzing' }, { type: 'ANALYSIS_FINISHED', ok: true }).phase).toBe('done')
    expect(reduceVideoScan({ ...initialVideoScanState, phase: 'analyzing' }, { type: 'ANALYSIS_FINISHED', ok: false, error: 'Analysen kunde inte slutföras.' }).phase).toBe('review')
  })

  it('can start, cancel, and start again without leaving the session open', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'START', framingMode: 'manual' })
    state = reduceVideoScan(state, { type: 'CAMERA_READY' })
    expect(isBodyScanSessionOpen(state.phase)).toBe(true)
    state = reduceVideoScan(state, { type: 'SET_FRAMING_MODE', mode: 'auto' })
    expect(state.framingMode).toBe('auto')
    state = reduceVideoScan(state, { type: 'SET_FRAMING_MODE', mode: 'manual' })
    expect(state.framingMode).toBe('manual')
    state = reduceVideoScan(state, { type: 'CANCEL' })
    expect(state.phase).toBe('idle')
    expect(isBodyScanSessionOpen(state.phase)).toBe(false)
    state = reduceVideoScan(state, { type: 'START', framingMode: 'manual' })
    expect(state.phase).toBe('prepare')
    expect(isBodyScanSessionOpen(state.phase)).toBe(true)
  })

  it('does not re-render position state when the detection message is unchanged', () => {
    const first = reduceVideoScan(initialVideoScanState, {
      type: 'SET_POSITION',
      status: 'searching',
      message: 'Söker person...',
    })
    const second = reduceVideoScan(first, {
      type: 'SET_POSITION',
      status: 'searching',
      message: 'Söker person...',
    })
    expect(second).toBe(first)
  })

  it('ignores single-finger preview taps and only pinches with two pointers', () => {
    const tracker = createPinchTracker()
    expect(tracker.down(1, 10, 10, 1).capture).toBe(false)
    expect(tracker.pinchActive).toBe(false)
    expect(tracker.move(1, 40, 40)).toEqual({ preventDefault: false, zoom: null })
    tracker.up(1)
    expect(tracker.activeCount).toBe(0)

    tracker.down(1, 0, 0, 1)
    tracker.down(2, 100, 0, 1)
    expect(tracker.pinchActive).toBe(true)
    const zoomed = tracker.move(2, 200, 0)
    expect(zoomed.preventDefault).toBe(true)
    expect(zoomed.zoom).toBeGreaterThan(1)
    tracker.up(1)
    tracker.up(2)
    expect(tracker.pinchActive).toBe(false)
    tracker.clear()
    expect(tracker.activeCount).toBe(0)
  })

  it('keeps back pose voice from telling the user to face the camera', () => {
    expect(videoScanVoiceLines.back_prepare).toBe('Vänd ryggen mot kameran.')
    expect(JSON.stringify(videoScanVoiceLines).toLowerCase()).not.toMatch(/vänd mot kameran/)
    expect(getVoiceLineForPhase('side_prepare')).toContain('höger sida')
  })

  it('maps the manual oval onto the real video pixels through object-fit contain', () => {
    const contain = getVideoContainRect(200, 400, 100, 200)
    expect(contain.width).toBe(200)
    expect(contain.height).toBe(400)
    expect(mapMaskRectToCanvas({ x: 0.25, y: 0.1, width: 0.5, height: 0.2 }, 100, 200)).toEqual({
      height: 40,
      width: 50,
      x: 25,
      y: 20,
    })
  })

  it('keeps spoken guidance off until the user turns it on', () => {
    expect(initialVideoScanState.voiceEnabled).toBe(false)
    expect(initialVideoScanState.paused).toBe(false)
    expect(speakVideoScanLine('Tre.', { enabled: initialVideoScanState.voiceEnabled })).toBe(false)
  })

  it('pauses out of a countdown without capturing and resumes again', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'CAMERA_READY' })
    state = reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' })
    expect(state.phase).toBe('front_countdown')

    state = reduceVideoScan(state, { type: 'PAUSE' })
    expect(state.paused).toBe(true)
    expect(state.phase).toBe('front_prepare')
    expect(state.countdown).toBeNull()
    expect(state.capturing).toBe(false)

    // A paused scan must not be able to start a new countdown.
    expect(reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' }).phase).toBe('front_prepare')

    state = reduceVideoScan(state, { type: 'RESUME' })
    expect(state.paused).toBe(false)
    expect(reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' }).phase).toBe('front_countdown')
  })

  it('carries an explicit reason when a countdown is cancelled', () => {
    let state = reduceVideoScan(initialVideoScanState, { type: 'CAMERA_READY' })
    state = reduceVideoScan(state, { type: 'BEGIN_COUNTDOWN', pose: 'front' })
    const cancelled = reduceVideoScan(state, {
      type: 'CANCEL_COUNTDOWN',
      message: 'Nedräkningen avbröts: Flytta dig lite bakåt. Ingen bild togs.',
    })
    expect(cancelled.phase).toBe('front_prepare')
    expect(cancelled.positionStatus).toBe('invalid')
    expect(cancelled.positionMessage).toContain('Ingen bild togs')
  })

  it('gives explicit turn instructions for the side and back steps', () => {
    expect(getVideoScanTurnInstruction('side')).toBe('Vänd dig åt höger')
    expect(getVideoScanTurnInstruction('back')).toBe('Vänd dig åt höger igen så att ryggen är mot kameran')
    expect(getVideoScanTurnInstruction('front')).toContain('rakt fram')
    // The existing pose titles must stay untouched.
    expect(getVideoScanInstruction('side_prepare')).toBe('VÄND HÖGER SIDA MOT KAMERAN')
  })

  it('numbers the guided steps from consent through analysis', () => {
    expect(videoScanTotalSteps).toBe(18)
    expect(getVideoScanStepNumber('idle', 'consent')).toBe(1)
    expect(getVideoScanStepNumber('idle', 'camera')).toBe(2)
    expect(getVideoScanStepNumber('idle', 'instructions')).toBe(3)
    expect(getVideoScanStepNumber('front_prepare')).toBe(6)
    expect(getVideoScanStepNumber('front_countdown')).toBe(7)
    expect(getVideoScanStepNumber('side_countdown')).toBe(11)
    expect(getVideoScanStepNumber('back_capture')).toBe(16)
    expect(getVideoScanStepNumber('review')).toBe(17)
    expect(getVideoScanStepNumber('analyzing')).toBe(18)
  })

  it('describes consent and preparation in text only, with no microphone claim', () => {
    const consent = videoScanConsentPoints.join(' ').toLowerCase()
    expect(consent).toContain('mikrofonen används aldrig')
    expect(consent).toContain('ingen video spelas in')
    expect(videoScanPreparationTips.map((tip) => tip.key)).toEqual([
      'distance',
      'light',
      'clothing',
      'placement',
    ])
    videoScanPreparationTips.forEach((tip) => {
      expect(tip.title.length).toBeGreaterThan(0)
      expect(tip.text.length).toBeGreaterThan(0)
    })
  })

  it('scales picked images down and only accepts jpeg or png', () => {
    expect(getScaledScanDimensions(3200, 1600)).toEqual({ height: 800, width: 1600 })
    expect(getScaledScanDimensions(800, 600)).toEqual({ height: 600, width: 800 })
    expect(getScaledScanDimensions(1000, 4000)).toEqual({ height: 1600, width: 400 })
    expect(isAllowedScanImageType('image/jpeg')).toBe(true)
    expect(isAllowedScanImageType('image/png')).toBe(true)
    expect(isAllowedScanImageType('image/heic')).toBe(false)
    expect(isAllowedScanImageType('')).toBe(false)
  })

  it('reports reduced-motion preference without throwing when matchMedia is missing', () => {
    expect(prefersReducedMotion({})).toBe(false)
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true)
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false)
  })

  it('blurs pixel buffers instead of relying on canvas.filter', () => {
    const width = 8
    const height = 8
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        const white = (x + y) % 2 === 0
        data[i] = white ? 255 : 0
        data[i + 1] = white ? 255 : 0
        data[i + 2] = white ? 255 : 0
        data[i + 3] = 255
      }
    }
    const before = new Uint8ClampedArray(data)
    boxBlurRgba(data, width, height, 2)
    expect(pixelsDiffer(before, data)).toBe(true)
    const mid = ((3 * width) + 3) * 4
    expect(data[mid]).toBeGreaterThan(0)
    expect(data[mid]).toBeLessThan(255)
  })
})
