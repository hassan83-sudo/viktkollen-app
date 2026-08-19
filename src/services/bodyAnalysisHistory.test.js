import { describe, expect, it } from 'vitest'

import { normalizeAnalysis, sanitizeAnalysisForExport } from './bodyAnalysisHistory.js'

describe('bodyAnalysisHistory privacy', () => {
  it('removes raw image previews from exported analyses', () => {
    const exported = sanitizeAnalysisForExport({
      analysisNumber: 1,
      backPhoto: { name: 'back.jpg', preview: 'data:image/jpeg;base64,back' },
      createdAt: '2026-08-11T10:00:00.000Z',
      frontPhoto: { name: 'front.jpg', preview: 'data:image/jpeg;base64,front' },
      result: { source: 'mock', summary: 'Klar' },
      sidePhoto: { name: 'side.jpg', preview: 'data:image/jpeg;base64,side' },
      updatedAt: '2026-08-11T10:00:00.000Z',
    })

    expect(exported.frontPhoto).toEqual({ name: 'front.jpg' })
    expect(exported.sidePhoto).toEqual({ name: 'side.jpg' })
    expect(exported.backPhoto).toEqual({ name: 'back.jpg' })
    expect(JSON.stringify(exported)).not.toContain('base64')
    expect(exported.result.schemaVersion).toBe(2)
  })

  it('keeps estimated body data in history export without image payloads', () => {
    const exported = sanitizeAnalysisForExport({
      analysisNumber: 1,
      backPhoto: { name: 'back.jpg', preview: 'data:image/jpeg;base64,back' },
      createdAt: '2026-08-11T10:00:00.000Z',
      frontPhoto: { name: 'front.jpg', preview: 'data:image/jpeg;base64,front' },
      result: {
        estimatedMeasurements: {
          waistCm: { confidence: 'medium', max: 94, min: 88 },
        },
        estimatedWeight: {
          basis: 'Tre vinklar.',
          confidence: 'medium',
          maxKg: 82,
          minKg: 76,
        },
        measuredWeight: { date: '2026-08-10', valueKg: 78 },
        source: 'ai',
        summary: 'Klar',
      },
      sidePhoto: { name: 'side.jpg', preview: 'data:image/jpeg;base64,side' },
      updatedAt: '2026-08-11T10:00:00.000Z',
    })

    expect(exported.result.estimatedWeight).toMatchObject({
      confidence: 'medium',
      maxKg: 82,
      midpointKg: 79,
      minKg: 76,
    })
    expect(exported.result.measuredWeight).toEqual({
      date: '2026-08-10',
      source: 'Registrerad vikt',
      valueKg: 78,
    })
    expect(JSON.stringify(exported)).not.toContain('data:image')
  })

  it('normalizes older history entries to the current schema safely', () => {
    const normalized = normalizeAnalysis({
      createdAt: '2026-08-01T10:00:00.000Z',
      result: {
        source: 'mock',
        summary: 'Gammal analys',
      },
    })

    expect(normalized.schemaVersion).toBe(2)
    expect(normalized.result.estimatedWeight).toBeNull()
    expect(normalized.result.estimatedMeasurements.waistCm).toBeNull()
    expect(normalized.result.scanInput.imageCount).toBe(3)
  })
})
