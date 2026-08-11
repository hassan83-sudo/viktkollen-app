import { describe, expect, it } from 'vitest'

import {
  bodyAnalysisViews,
  canCompleteBodyAnalysisScan,
  estimateLightQualityFromImageData,
  getAngleMatchedComparison,
  getCompletedBodyAnalysisViews,
  getLightQualityFromLuminance,
  getNextBodyAnalysisViewKey,
} from './bodyAnalysisGuidedScan.js'

const photo = (name) => ({ name, preview: `data:image/jpeg;base64,${name}` })

describe('bodyAnalysisGuidedScan', () => {
  it('defines the guided front, side and back scan steps', () => {
    expect(bodyAnalysisViews.map((view) => view.key)).toEqual(['front', 'side', 'back'])
    expect(bodyAnalysisViews[0].label).toBe('Framifrån')
    expect(bodyAnalysisViews[2].poseTips.join(' ')).toContain('ryggen')
  })

  it('walks front to side to back and requires all angles before completion', () => {
    const frontOnly = { front: photo('front') }
    const frontAndSide = { ...frontOnly, side: photo('side') }
    const complete = { ...frontAndSide, back: photo('back') }

    expect(getNextBodyAnalysisViewKey('front', frontOnly)).toBe('side')
    expect(getNextBodyAnalysisViewKey('side', frontAndSide)).toBe('back')
    expect(getCompletedBodyAnalysisViews(frontAndSide).map((view) => view.key)).toEqual(['front', 'side'])
    expect(canCompleteBodyAnalysisScan(frontAndSide)).toBe(false)
    expect(canCompleteBodyAnalysisScan(complete)).toBe(true)
  })

  it('classifies dark, good and backlit luminance without blocking the scan', () => {
    expect(getLightQualityFromLuminance(20).level).toBe('dark')
    expect(getLightQualityFromLuminance(140).level).toBe('good')
    expect(getLightQualityFromLuminance(245).level).toBe('backlight')
    expect(getLightQualityFromLuminance(Number.NaN).level).toBe('unknown')
  })

  it('estimates light quality from image data', () => {
    expect(estimateLightQualityFromImageData({
      data: new Uint8ClampedArray([150, 150, 150, 255, 160, 160, 160, 255]),
    }).level).toBe('good')
  })

  it('matches before and after photos by angle only when both scans have that angle', () => {
    const latest = {
      backPhoto: photo('back-after'),
      createdAt: '2026-08-11T10:00:00.000Z',
      frontPhoto: photo('front-after'),
      sidePhoto: photo('side-after'),
    }
    const previous = {
      backPhoto: photo('back-before'),
      createdAt: '2026-08-04T10:00:00.000Z',
      frontPhoto: photo('front-before'),
      sidePhoto: null,
    }

    expect(getAngleMatchedComparison(latest, [latest, previous]).map((item) => item.view)).toEqual(['front', 'back'])
  })
})
