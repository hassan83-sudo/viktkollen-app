import { describe, expect, it } from 'vitest'

import { sanitizeAnalysisForExport } from './bodyAnalysisHistory.js'

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
  })
})
