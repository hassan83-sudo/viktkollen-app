import { describe, expect, it } from 'vitest'

import {
  buildBodyAnalysisContext,
  getConfidenceLabel,
  normalizeBodyAnalysisResultModel,
  normalizeEstimatedWeight,
} from './bodyAnalysisEstimates.js'

describe('bodyAnalysisEstimates', () => {
  it('accepts valid AI weight intervals without treating them as measured weight', () => {
    const estimate = normalizeEstimatedWeight({
      basis: 'Tre vinklar och registrerad längd.',
      confidence: 'medium',
      maxKg: 82,
      midpointKg: 79,
      minKg: 76,
    })

    expect(estimate).toEqual({
      basis: 'Tre vinklar och registrerad längd.',
      confidence: 'medium',
      maxKg: 82,
      midpointKg: 79,
      minKg: 76,
    })
  })

  it('drops invalid or falsely precise weight estimates', () => {
    expect(normalizeEstimatedWeight({ maxKg: 78.4, minKg: 78.4 })).toBeNull()
    expect(normalizeEstimatedWeight({ maxKg: 78.8, minKg: 78.4 })).toBeNull()
    expect(normalizeEstimatedWeight({ maxKg: 700, minKg: 76 })).toBeNull()
    expect(normalizeEstimatedWeight({ maxKg: 'eighty', minKg: 76 })).toBeNull()
  })

  it('keeps null estimates when image or profile context is insufficient', () => {
    const model = normalizeBodyAnalysisResultModel({
      confidence: 'low',
      estimatedMeasurements: {
        waistCm: { confidence: 'low', max: 92, min: 86 },
      },
      estimatedWeight: null,
    })

    expect(model.estimatedWeight).toBeNull()
    expect(model.estimatedMeasurements.waistCm).toEqual({ confidence: 'low', max: 92, min: 86 })
    expect(model.estimatedMeasurements.hipCm).toBeNull()
    expect(model.dataQuality).toBe('low')
  })

  it('builds profile context with latest measured weight separated from AI estimates', () => {
    const context = buildBodyAnalysisContext({
      bodyAnalysisHistory: [
        {
          createdAt: '2026-08-10T10:00:00.000Z',
          result: {
            estimatedWeight: { confidence: 'low', maxKg: 82, minKg: 76 },
            summary: 'Tidigare scan',
          },
        },
      ],
      profile: { age: '42', gender: 'man', height: '180' },
      weights: [
        { date: '2026-08-01', time: '08:00', value: 80.2 },
        { date: '2026-08-12', time: '07:30', value: 78 },
      ],
    })

    expect(context.latestMeasuredWeight).toEqual({
      date: '2026-08-12',
      source: 'Registrerad vikt',
      valueKg: 78,
    })
    expect(context.profile).toEqual({ age: 42, gender: 'man', height: 180 })
    expect(context.previousScans[0].estimatedWeight).toEqual({ confidence: 'low', maxKg: 82, minKg: 76 })
  })

  it('localizes confidence labels consistently', () => {
    expect(getConfidenceLabel('low')).toBe('Låg')
    expect(getConfidenceLabel('medium')).toBe('Medel')
    expect(getConfidenceLabel('high')).toBe('Hög')
  })
})
