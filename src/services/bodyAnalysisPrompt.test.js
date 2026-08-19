import { describe, expect, it } from 'vitest'

import { createBodyAnalysisPrompt } from './bodyAnalysisPrompt.js'

describe('bodyAnalysisPrompt', () => {
  it('asks for cautious estimated weight ranges and measured weight separation', () => {
    const prompt = createBodyAnalysisPrompt(
      { summary: 'Tidigare analys' },
      {
        latestMeasuredWeight: { date: '2026-08-12', valueKg: 78 },
        profile: { height: 180 },
        scanInput: { angles: ['front', 'side', 'back'], imageCount: 3 },
      },
    )

    expect(prompt).toContain('"estimatedWeight"')
    expect(prompt).toContain('"minKg"')
    expect(prompt).toContain('"maxKg"')
    expect(prompt).toContain('Presentera aldrig AI-vikt som en vägning')
    expect(prompt).toContain('Skilj alltid measuredWeight från estimatedWeight')
    expect(prompt).not.toContain('Du får aldrig uppskatta vikt.')
    expect(prompt).toContain('Profil- och viktkontext som JSON')
    expect(prompt).toContain('Tidigare analys som JSON')
  })
})
