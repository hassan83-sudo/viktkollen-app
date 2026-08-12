import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AICoach from './AICoach.jsx'

function html(overrides = {}) {
  return renderToStaticMarkup(
    <AICoach
      coachMessage=""
      coachReport={null}
      coachReports={[]}
      coachStatus=""
      isGeneratingReport={false}
      onClearCoachReports={vi.fn()}
      onCreateCoachReport={vi.fn()}
      onDeleteCoachReport={vi.fn()}
      {...overrides}
    />,
  )
}

describe('AICoach', () => {
  it('renders a safe empty fallback when no coach message exists', () => {
    const markup = html()

    expect(markup).toContain('Coachen saknar tillräckligt med data just nu')
    expect(markup).toContain('trygg lokal fallback')
  })

  it('announces loading while generating a report', () => {
    const markup = html({ isGeneratingReport: true })

    expect(markup).toContain('Analyserar senaste vikt, måltider och check-in')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('disabled=""')
  })
})
