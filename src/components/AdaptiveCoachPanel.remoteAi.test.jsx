import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdaptiveCoachPanel from './AdaptiveCoachPanel.jsx'

describe('AdaptiveCoachPanel remote AI controls', () => {
  it('renders consent controlled remote AI section and data preview', () => {
    const html = renderToStaticMarkup(
      <AdaptiveCoachPanel
        adaptiveCoachFeedback={{}}
        analysisDate="2026-08-04"
        checkIn={{ energy: 6 }}
        goalsHabits={{ goals: [{ name: 'Protein' }] }}
        meals={[]}
        weights={[]}
      />,
    )

    expect(html).toContain('AI-förslag')
    expect(html).toContain('Aktivera remote AI')
    expect(html).toContain('Skickas inte')
    expect(html).not.toMatch(/Bearer|access_token|test@example.com/)
  })
})
