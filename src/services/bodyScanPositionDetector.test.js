import { describe, expect, it } from 'vitest'

import {
  detectBodyPosition,
  evaluateBodyPosition,
  getAutomaticBodyPositionSupport,
  getDefaultFramingMode,
} from './bodyScanPositionDetector.js'

describe('bodyScanPositionDetector', () => {
  it('does not claim auto framing when no real detector API exists', () => {
    expect(getAutomaticBodyPositionSupport({}).available).toBe(false)
    expect(getAutomaticBodyPositionSupport({}).label).toContain('inte tillgänglig')
    expect(getDefaultFramingMode({})).toBe('manual')
  })

  it('uses PoseDetector when the browser actually exposes it', () => {
    expect(getAutomaticBodyPositionSupport({ PoseDetector: function PoseDetector() {} }).available).toBe(true)
    expect(getDefaultFramingMode({ PoseDetector: function PoseDetector() {} })).toBe('auto')
  })

  it('treats empty landmarks as searching, not a fake valid pose', () => {
    expect(evaluateBodyPosition([]).valid).toBe(false)
    expect(evaluateBodyPosition([]).message).toContain('Söker person')
  })

  it('accepts a full-body landmark box near the frame center', () => {
    const landmarks = [
      { x: 40, y: 10 },
      { x: 60, y: 10 },
      { x: 35, y: 90 },
      { x: 65, y: 90 },
    ]
    const result = evaluateBodyPosition(landmarks, { width: 100, height: 100 })
    expect(result.valid).toBe(true)
    expect(result.message).toContain('Bra position')
  })

  it('asks the user to move when the body is too close or off-center', () => {
    expect(evaluateBodyPosition([{ x: 50, y: 0 }, { x: 50, y: 100 }], { width: 100, height: 100 }).code).toBe('too-close')
    expect(evaluateBodyPosition([{ x: 10, y: 20 }, { x: 20, y: 80 }], { width: 100, height: 100 }).code).toBe('too-left')
  })

  it('detectBodyPosition stays unavailable without a real API', async () => {
    const result = await detectBodyPosition({ videoWidth: 100, videoHeight: 100 }, {})
    expect(result.available).toBe(false)
    expect(result.valid).toBe(false)
  })
})
