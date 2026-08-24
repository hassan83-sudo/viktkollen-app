import { describe, expect, it, vi } from 'vitest'

import {
  applyFaceProtectionToCanvas,
  cancelVideoScanSpeech,
  clampVideoScanZoom,
  defaultFaceProtectionMode,
  defaultVideoScanFacingMode,
  getFaceProtectionOutcome,
  getNextPose,
  getPoseFromPhase,
  getUpperRegionBox,
  getVideoScanCameraIndicator,
  getVideoScanDirection,
  getVideoScanInstruction,
  getVoiceLineForPhase,
  initialVideoScanState,
  reduceVideoScan,
  shouldBlockAnalysisForFaceProtection,
  speakVideoScanLine,
  videoScanCountdownStart,
  videoScanPhases,
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
    expect(getVideoScanInstruction('side_prepare')).toBe('Vänd dig åt höger')
    expect(getVideoScanDirection('side_prepare')).toEqual({ arrow: '→', label: 'VÄND DIG ÅT HÖGER' })
    expect(getVideoScanInstruction('back_prepare')).toBe('Vänd ryggen mot kameran')
    expect(getVideoScanDirection('back_prepare').label).toContain('RYGGEN')
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
  })

  it('uses honest face-protection status and can change mode', () => {
    expect(getFaceProtectionOutcome('auto', [{ boundingBox: { height: 20, width: 20, x: 1, y: 1 } }]).status).toBe('applied')
    expect(getFaceProtectionOutcome('auto', []).status).toBe('unavailable')
    expect(getFaceProtectionOutcome('auto', []).label).toContain('kunde inte')
    expect(getFaceProtectionOutcome('blur', []).status).toBe('approximate')
    expect(getFaceProtectionOutcome('none', []).status).toBe('skipped')
    expect(shouldBlockAnalysisForFaceProtection('auto', 'unavailable')).toBe(true)
    expect(shouldBlockAnalysisForFaceProtection('blur', 'approximate')).toBe(false)
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
    expect(getVoiceLineForPhase('front_prepare')).toContain('framifrån')
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
})
