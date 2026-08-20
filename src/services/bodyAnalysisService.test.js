import { describe, expect, it } from 'vitest'

import { buildBodyAnalysisPayload } from './bodyAnalysisService.js'
import { buildBodyAnalysisContext } from './bodyAnalysisEstimates.js'

describe('bodyAnalysisService', () => {
  it('builds a multi-angle body analysis payload', () => {
    const frontFile = { name: 'front.jpg' }
    const sideFile = { name: 'side.jpg' }
    const backFile = { name: 'back.jpg' }
    const previousAnalysis = { summary: 'Tidigare analys' }
    const context = { latestMeasuredWeight: { date: '2026-08-12', valueKg: 78 } }

    const payload = buildBodyAnalysisPayload(
      { file: frontFile },
      { file: sideFile },
      { file: backFile },
      previousAnalysis,
      context,
    )

    expect(payload.frontImage).toBe(frontFile)
    expect(payload.sideImage).toBe(sideFile)
    expect(payload.backImage).toBe(backFile)
    expect(payload.previousAnalysis).toBe(previousAnalysis)
    expect(payload.context).toBe(context)
    expect(payload.scanInput).toEqual({
      angles: ['front', 'side', 'back'],
      imageCount: 3,
      requiredAngles: ['front', 'side', 'back'],
    })
  })
})

describe('body analysis profile context', () => {
  it('uses user-entered height and latest measured weight without AI-estimated weight as current weight', () => {
    const context = buildBodyAnalysisContext({
      bodyAnalysisHistory: [{
        createdAt: '2026-08-18T10:00:00.000Z',
        result: {
          estimatedWeight: { maxKg: 91, minKg: 87, provenance: 'ai_estimated' },
          summary: 'Tidigare body scan',
        },
      }],
      profile: {
        heightCm: 181,
        provenance: { height: 'user_entered' },
      },
      weights: [
        { date: '2026-08-17', source: 'Manuell', value: 88.4 },
      ],
    })

    expect(context.profile).toMatchObject({
      height: 181,
      heightProvenance: 'user_entered',
    })
    expect(context.latestMeasuredWeight).toMatchObject({
      source: 'Manuell',
      valueKg: 88.4,
    })
    expect(context.previousScans[0].estimatedWeight.provenance).toBe('ai_estimated')
  })
})
