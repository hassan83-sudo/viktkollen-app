import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SocialCenter from './SocialCenter.jsx'

const today = '2026-08-04'

function renderPanel(props = {}) {
  return renderToStaticMarkup(
    <SocialCenter
      adaptiveCoachFeedback={{ recommendations: [{ id: 'c1', status: 'completed', title: 'Promenad' }] }}
      analysisDate={today}
      checkIn={{ date: today, energy: 7, mood: 'Fokuserad', steps: 7200 }}
      goalsHabits={{
        goals: [{ id: 'g1', status: 'active', title: 'Protein' }],
        habits: [{ completedDates: [today], id: 'h1', status: 'active', title: 'Promenad' }],
      }}
      meals={[{ date: today, id: 'm1', protein: 25, text: 'Kyckling' }]}
      profile={{ goalWeight: 78 }}
      weights={[
        { date: '2026-07-01', value: 91.8 },
        { date: today, value: 89.6 },
      ]}
      {...props}
    />,
  )
}

describe('SocialCenter', () => {
  it('renders social sections with privacy-first language', () => {
    const markup = renderPanel()

    expect(markup).toContain('Social &amp; Accountability V1')
    expect(markup).toContain('Privacy controls')
    expect(markup).toContain('Invite system')
    expect(markup).toContain('Share preview')
    expect(markup).toContain('Leaderboard')
    expect(markup).toContain('ingen social press')
  })

  it('does not render technical placeholders or sensitive identifiers', () => {
    const markup = renderPanel({
      profile: { email: 'secret@example.com', name: 'Test' },
    })

    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity|true|false)\b|\[object Object\]|secret@example.com/)
  })

  it('keeps leaderboard opt-in by default', () => {
    const markup = renderPanel()

    expect(markup).toContain('Leaderboard är avstängd')
  })
})
