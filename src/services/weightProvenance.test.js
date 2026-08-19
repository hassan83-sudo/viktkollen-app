import { describe, expect, it } from 'vitest'
import {
  buildWeightProvenanceSummary,
  getLatestBodyScanEstimatedWeight,
  getWeightEntryProvenance,
  isMeasuredWeightEntry,
} from './weightProvenance.js'

describe('weight provenance', () => {
  it('treats manual, imported and check-in weights as measured series input', () => {
    expect(isMeasuredWeightEntry({ source: 'Manuell', value: 80 })).toBe(true)
    expect(isMeasuredWeightEntry({ source: 'Importerad', value: 80 })).toBe(true)
    expect(isMeasuredWeightEntry({ source: 'Check-in', value: 80 })).toBe(true)
  })

  it('keeps body scan and AI-estimated weights out of the measured series', () => {
    const bodyScanWeight = { source: 'Kroppsanalys', value: 80 }
    const aiWeight = { provenance: 'ai_estimated', value: 80 }

    expect(getWeightEntryProvenance(bodyScanWeight).kind).toBe('ai_estimated')
    expect(getWeightEntryProvenance(aiWeight).kind).toBe('ai_estimated')
    expect(isMeasuredWeightEntry(bodyScanWeight)).toBe(false)
    expect(isMeasuredWeightEntry(aiWeight)).toBe(false)
  })

  it('summarizes measured weights and latest body scan estimate separately', () => {
    const summary = buildWeightProvenanceSummary({
      bodyAnalysisHistory: [
        {
          createdAt: '2026-08-10T10:00:00.000Z',
          result: {
            estimatedWeight: {
              confidence: 'low',
              maxKg: 82,
              minKg: 78,
            },
          },
        },
      ],
      weights: [
        { source: 'Manuell', value: 79 },
        { source: 'Kroppsanalys', value: 80 },
      ],
    })

    expect(summary.measuredCount).toBe(1)
    expect(summary.aiEstimatedCount).toBe(1)
    expect(summary.excludedFromMeasuredSeriesCount).toBe(1)
    expect(summary.latestBodyScanEstimate).toMatchObject({
      confidence: 'low',
      maxKg: 82,
      minKg: 78,
      provenance: 'ai_estimated',
    })
  })

  it('returns null when body scan history has no safe weight estimate', () => {
    expect(getLatestBodyScanEstimatedWeight([{ result: { estimatedWeight: { minKg: 90, maxKg: 70 } } }])).toBeNull()
  })
})
