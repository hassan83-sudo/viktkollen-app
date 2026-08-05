import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CoachMemoryReview from './CoachMemoryReview.jsx'

describe('CoachMemoryReview', () => {
  it('renders safe memory metadata and controls without raw sensitive values', () => {
    const html = renderToStaticMarkup(
      <CoachMemoryReview
        adaptiveCoachFeedback={{
          coachMemory: {
            consent: { personalizationEnabled: true, remoteAiMemoryEnabled: false },
            preferences: { preferredActionSize: 'liten', preferredCoachTone: 'lugn', preferredFocusAreas: ['nutrition'] },
            successfulStrategies: [{ category: 'nutrition', confidence: 0.8, evidenceCount: 3, id: 'private-id', source: 'derived' }],
          },
        }}
        analysisDate="2026-08-05"
        context={{}}
      />,
    )

    expect(html).toContain('Vad coachen kommer ihåg')
    expect(html).toContain('Coachton')
    expect(html).toContain('Actionstorlek')
    expect(html).toContain('Säker AI-context preview')
    expect(html).not.toMatch(/private-id|prompt=|token=|localStorage/i)
  })
})
