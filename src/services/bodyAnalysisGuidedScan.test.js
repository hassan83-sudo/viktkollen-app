import { describe, expect, it, vi } from 'vitest'

import {
  bodyAnalysisViews,
  canCompleteBodyAnalysisScan,
  estimateLightQualityFromImageData,
  getAngleMatchedComparison,
  getCameraPermissionMessage,
  getCompletedBodyAnalysisViews,
  getLightQualityFromLuminance,
  getNextBodyAnalysisViewKey,
  recordBodyScanPhoto,
  revokeBodyScanPreview,
  selectBodyScanAngle,
  stopMediaStream,
} from './bodyAnalysisGuidedScan.js'

const photo = (name) => ({ name, preview: `data:image/jpeg;base64,${name}` })

describe('bodyAnalysisGuidedScan', () => {
  it('defines the guided front, side and back scan steps', () => {
    expect(bodyAnalysisViews.map((view) => view.key)).toEqual(['front', 'side', 'back'])
    expect(bodyAnalysisViews[0].label).toBe('Framifrån')
    expect(bodyAnalysisViews[2].poseTips.join(' ')).toContain('ryggen')
  })

  it('selects an angle, records photos in the right slot, and retakes one angle only', () => {
    const front = photo('front')
    const side = photo('side')
    const back = photo('back')

    expect(selectBodyScanAngle({}, 'side').activeViewKey).toBe('side')
    expect(recordBodyScanPhoto({}, 'front', front).progress.label).toBe('1/3')
    expect(recordBodyScanPhoto({ front }, 'side', side).progress.label).toBe('2/3')

    const complete = recordBodyScanPhoto({ front, side }, 'back', back)
    expect(complete.progress.label).toBe('3/3')
    expect(complete.canAnalyze).toBe(true)

    const retakeFront = selectBodyScanAngle(complete.photos, 'front', { retake: true })
    expect(retakeFront.activeViewKey).toBe('front')
    expect(retakeFront.photos.front).toBeUndefined()
    expect(retakeFront.photos.side).toEqual(side)
    expect(retakeFront.photos.back).toEqual(back)
    expect(retakeFront.canAnalyze).toBe(false)
    expect(retakeFront.progress.label).toBe('2/3')
  })

  it('stops media tracks and revokes blob previews', () => {
    const stop = vi.fn()
    stopMediaStream({ getTracks: () => [{ stop }, { stop }] })
    expect(stop).toHaveBeenCalledTimes(2)

    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    revokeBodyScanPreview({ preview: 'blob:http://localhost/scan' })
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/scan')
    revoke.mockRestore()
  })

  it('explains camera permission denials', () => {
    expect(getCameraPermissionMessage({ name: 'NotAllowedError' })).toContain('nekades')
    expect(getCameraPermissionMessage({ name: 'NotFoundError' })).toContain('kamera')
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
