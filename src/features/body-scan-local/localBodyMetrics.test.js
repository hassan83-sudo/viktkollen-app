import { describe, expect, it } from 'vitest'

import {
  buildSavableRecord,
  compareWithPrevious,
  computeViewMetrics,
  describeChange,
  getRegisteredWeightChange,
  measureMaskRun,
} from './localBodyMetrics.js'
import { localModelVersionTag } from './localBodyScanConfig.js'

const W = 600
const H = 1000

// Framifrån: personens vänstra sida (11, 23, 25, 27, 15) syns till höger i bilden.
function makeLandmarks({ ankleHalf = 0.05, hipHalf = 0.08, shoulderHalf = 0.15, view = 'front', visibility = 0.99, shiftX = 0 } = {}) {
  const points = Array.from({ length: 33 }, () => ({ visibility: 0.9, x: 0.5, y: 0.5, z: 0 }))
  const mirror = view === 'back'
  const set = (index, x, y) => { points[index] = { visibility, x: (mirror ? 1 - x : x) + shiftX, y, z: 0 } }
  set(0, 0.5, 0.1)
  set(7, 0.52, 0.1)
  set(8, 0.48, 0.1)
  set(11, 0.5 + shoulderHalf, 0.22)
  set(12, 0.5 - shoulderHalf, 0.22)
  set(23, 0.5 + hipHalf, 0.52)
  set(24, 0.5 - hipHalf, 0.52)
  set(25, 0.55, 0.72)
  set(26, 0.45, 0.72)
  set(27, 0.5 + ankleHalf, 0.92)
  set(28, 0.5 - ankleHalf, 0.92)
  if (view === 'side') {
    set(15, 0.51, 0.12)
    set(16, 0.49, 0.12)
  } else {
    set(15, 0.8, 0.5)
    set(16, 0.2, 0.5)
  }
  return points
}

// Syntetisk silhuett: bredd i pixlar per rad.
function makeMask(widthAt) {
  const data = new Float32Array(W * H)
  for (let y = 0; y < H; y += 1) {
    const width = widthAt(y)
    if (!width) continue
    const left = Math.round(300 - width / 2)
    for (let x = left; x < left + width; x += 1) data[y * W + x] = 1
  }
  return { data, height: H, width: W }
}

const torso = (scale = 1) => (y) => {
  if (y < 200 || y > 900) return 0
  if (y < 380) return Math.round(200 * scale)
  if (y < 470) return Math.round(160 * scale)
  return Math.round(210 * scale)
}

function front(overrides = {}) {
  return computeViewMetrics({
    imageHeight: H,
    imageWidth: W,
    landmarks: makeLandmarks(overrides.landmarks),
    luminance: overrides.luminance ?? 130,
    mask: overrides.mask === undefined ? makeMask(torso()) : overrides.mask,
    view: 'front',
  })
}

describe('computeViewMetrics', () => {
  it('measures unitless proportions for a good front view', () => {
    const result = front()
    expect(result.quality).toEqual({ issues: [], ok: true })
    expect(result.metrics.shoulderWidth).toBeCloseTo(180 / 700, 3)
    expect(result.metrics.chest).toBeCloseTo(200 / 700, 2)
    expect(result.metrics.waist).toBeCloseTo(160 / 700, 2)
    expect(result.metrics.hip).toBeCloseTo(210 / 700, 2)
    expect(result.conditions.bodyFraction).toBeCloseTo(0.82, 2)
    // Inga centimeter, kilo eller fettprocent i resultatet.
    expect(Object.keys(result.metrics).join(' ')).not.toMatch(/cm|kg|fat|weight/i)
  })

  it('measures depth in the side view when hands are on the head', () => {
    const result = computeViewMetrics({
      imageHeight: H,
      imageWidth: W,
      landmarks: makeLandmarks({ shoulderHalf: 0.02, view: 'side' }),
      luminance: 120,
      mask: makeMask(torso(0.7)),
      view: 'side',
    })
    expect(result.quality.ok).toBe(true)
    expect(result.metrics.waistDepth).toBeCloseTo(112 / 700, 2)
  })

  it('tells front and back views apart and rejects the wrong one', () => {
    const asView = (landmarkView, view) => computeViewMetrics({
      imageHeight: H, imageWidth: W, landmarks: makeLandmarks({ view: landmarkView }), luminance: 120, mask: makeMask(torso()), view,
    })
    expect(asView('front', 'front').quality.ok).toBe(true)
    expect(asView('back', 'back').quality.ok).toBe(true)
    expect(asView('back', 'front').quality.issues).toContain('wrong-orientation')
    expect(asView('front', 'back').quality.issues).toContain('wrong-orientation')
  })

  it('reports blocking quality issues instead of inventing values', () => {
    expect(computeViewMetrics({ imageHeight: H, imageWidth: W, landmarks: [], view: 'front' }).quality)
      .toEqual({ issues: ['no-person'], ok: false })
    expect(front({ landmarks: { visibility: 0.2 } }).quality.issues).toContain('missing-landmarks')
    expect(front({ luminance: 20 }).quality.issues).toContain('too-dark')
    expect(front({ landmarks: { shoulderHalf: 0.03 } }).quality.issues).toContain('wrong-orientation')
    expect(front({ luminance: 20 }).quality.ok).toBe(false)
  })

  it('rejects people who are not standing upright', () => {
    const kneeling = makeLandmarks().map((point, index) => {
      if (index === 25 || index === 26) return { ...point, x: point.x + (index === 25 ? 0.2 : -0.2), y: 0.6 }
      return point
    })
    const result = computeViewMetrics({ imageHeight: H, imageWidth: W, landmarks: kneeling, luminance: 120, mask: makeMask(torso()), view: 'front' })
    expect(result.quality.issues).toContain('not-standing')
    expect(result.quality.ok).toBe(false)
  })

  it('skips a contour row when a hand is next to it', () => {
    const handsAtHips = makeLandmarks({ view: 'back' }).map((point, index) => (index === 15 || index === 16
      ? { ...point, visibility: 0.2, x: index === 15 ? 0.31 : 0.69, y: 0.54 }
      : point))
    const result = computeViewMetrics({ imageHeight: H, imageWidth: W, landmarks: handsAtHips, luminance: 120, mask: makeMask(torso()), view: 'back' })
    expect(result.metrics.hip).toBeNull()
    expect(result.metrics.waist).toBeCloseTo(160 / 700, 2)
  })

  it('blocks contour metrics when arms touch the body, stance is wide or mask is missing', () => {
    const arms = computeViewMetrics({
      imageHeight: H,
      imageWidth: W,
      landmarks: makeLandmarks().map((point, index) => (index === 15 || index === 16 ? { ...point, x: 0.5 } : point)),
      luminance: 120,
      mask: makeMask(torso()),
      view: 'front',
    })
    expect(arms.quality.issues).toContain('arms-close')
    expect(arms.metrics.waist).toBeNull()
    expect(front({ landmarks: { ankleHalf: 0.3 } }).quality.issues).toContain('wide-stance')
    expect(front({ mask: null }).quality.issues).toContain('no-contour')
  })

  it('returns null when the silhouette touches the image edge', () => {
    const mask = makeMask(() => W)
    expect(measureMaskRun(mask, 0.5, 0.5)).toBeNull()
  })
})

describe('compareWithPrevious', () => {
  const baseline = buildSavableRecord({ front: front() }, new Date('2026-09-01T08:00:00Z'))

  it('needs a baseline and the same model version', () => {
    expect(compareWithPrevious(null, { front: front() }).status).toBe('no-baseline')
    expect(compareWithPrevious({ ...baseline, modelVersion: 'other' }, { front: front() }).status).toBe('not-assessable')
  })

  it('treats tiny differences as no clear change', () => {
    const result = compareWithPrevious(baseline, { front: front() })
    expect(result.status).toBe('compared')
    expect(result.views.front.changes.waist.level).toBe('stable')
  })

  it('flags a possible change in contour only, without numbers in cm or kg', () => {
    const waistWidth = (px) => front({ mask: makeMask((y) => (y >= 380 && y < 470 ? px : torso()(y))) })
    const clear = compareWithPrevious(baseline, { front: waistWidth(140) })
    expect(clear.views.front.changes.waist).toEqual({ direction: 'smaller', level: 'possible-clear' })
    expect(compareWithPrevious(baseline, { front: waistWidth(147) }).views.front.changes.waist)
      .toEqual({ direction: 'smaller', level: 'possible-small' })
    // Skelettmått (leder) redovisas aldrig som kroppsförändring.
    expect(Object.keys(clear.views.front.changes).sort()).toEqual(['chest', 'hip', 'waist', 'waistToHip'])
    const text = describeChange('waist', clear.views.front.changes.waist)
    expect(text).toContain('möjligen')
    expect(text).not.toMatch(/\d|cm|kg|vikt|fett|gått ner/i)
  })

  it('refuses to compare when the skeleton does not match (different pose or angle)', () => {
    const wider = front({ landmarks: { shoulderHalf: 0.17 } })
    const result = compareWithPrevious(baseline, { front: wider })
    expect(result.status).toBe('not-assessable')
    expect(result.reasons.join(' ')).toMatch(/skelettmåtten/)
  })

  it('cannot assess when the contour is missing in one of the scans', () => {
    const result = compareWithPrevious(baseline, { front: front({ mask: null }) })
    expect(result.status).toBe('not-assessable')
  })

  it('refuses to compare when distance, angle or light differ too much', () => {
    const farther = computeViewMetrics({
      imageHeight: H,
      imageWidth: W,
      landmarks: makeLandmarks().map((point) => ({ ...point, y: 0.3 + (point.y - 0.5) * 0.7 + 0.2 })),
      luminance: 130,
      mask: makeMask(torso()),
      view: 'front',
    })
    const result = compareWithPrevious(baseline, { front: farther })
    expect(result.status).toBe('not-assessable')
    expect(result.reasons.join(' ')).toMatch(/Avståndet/)

    const dark = compareWithPrevious(baseline, { front: front({ luminance: 60 }) })
    expect(dark.status).toBe('not-assessable')
    expect(dark.reasons.join(' ')).toMatch(/Ljuset/)
  })

  it('marks huge jumps as unreliable rather than as a real change', () => {
    const result = compareWithPrevious(baseline, { front: front({ mask: makeMask(torso(1.3)) }) })
    const view = result.views.front
    // Antingen hela vyn "kan inte bedömas" eller midjan markerad som opålitlig – aldrig en förändring.
    expect(view.reliable ? view.changes.waist.level : 'unreliable').toBe('unreliable')
  })
})

describe('registered weight', () => {
  it('only uses weights the user logged, never image analysis', () => {
    const weights = [
      { date: '2026-09-01', value: 84.2 },
      { date: '2026-10-09', value: 82.7 },
    ]
    const change = getRegisteredWeightChange(weights, '2026-09-01T08:00:00Z', new Date('2026-10-10T08:00:00Z'))
    expect(change).toMatchObject({ changeKg: -1.5, from: { kg: 84.2 }, to: { kg: 82.7 } })
    expect(getRegisteredWeightChange([], '2026-09-01', new Date())).toBeNull()
    expect(getRegisteredWeightChange([{ date: '2026-10-09', value: 82 }], '2026-09-01', new Date('2026-10-10'))).toBeNull()
  })
})

describe('buildSavableRecord', () => {
  it('keeps only numbers for views that passed quality, tagged with model version', () => {
    const record = buildSavableRecord({ back: front({ luminance: 10 }), front: front() })
    expect(Object.keys(record.views)).toEqual(['front'])
    expect(record.modelVersion).toBe(localModelVersionTag)
    const json = JSON.stringify({ ...record, modelVersion: '' })
    expect(json).not.toMatch(/data:|blob:|landmark|mask|image/i)
    expect(json.length).toBeLessThan(800)
  })
})
