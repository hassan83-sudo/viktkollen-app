import { describe, expect, it } from 'vitest'

import { buildBodyAnalysisPayload } from './bodyAnalysisService.js'

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
