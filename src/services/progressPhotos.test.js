import { describe, expect, it } from 'vitest'
import {
  buildProgressPhotoComparison,
  buildProgressPhotoInsights,
  filterProgressPhotos,
  sortProgressPhotosChronologically,
} from './progressPhotos.js'

const photos = [
  {
    createdAt: '2026-07-01T10:00:00.000Z',
    id: 'old',
    image: 'data:image/png;base64,old',
    note: 'Start',
    weight: 91,
  },
  {
    createdAt: '2026-08-01T10:00:00.000Z',
    id: 'new',
    image: 'data:image/png;base64,new',
    note: 'Ny',
    weight: 89.4,
  },
]

describe('progressPhotos helpers', () => {
  it('filters photos by period', () => {
    const visible = filterProgressPhotos(photos, '30d', new Date('2026-08-10T12:00:00.000Z'))

    expect(visible.map((photo) => photo.id)).toEqual(['new'])
  })

  it('sorts chronologically', () => {
    expect(sortProgressPhotosChronologically([...photos].reverse()).map((photo) => photo.id)).toEqual(['old', 'new'])
  })

  it('builds before after comparison with weight change', () => {
    const comparison = buildProgressPhotoComparison({
      afterPhotoId: 'new',
      beforePhotoId: 'old',
      photos,
    })

    expect(comparison.before.id).toBe('old')
    expect(comparison.after.id).toBe('new')
    expect(comparison.weightChange).toBe(-1.6)
    expect(comparison.weightChangeLabel).toBe('-1,6 kg')
  })

  it('summarizes empty state safely', () => {
    const insights = buildProgressPhotoInsights([], {})

    expect(insights.photoCount).toBe(0)
    expect(insights.periodLabel).toBe('För lite historik')
  })
})
