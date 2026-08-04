import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AchievementCenter from './AchievementCenter.jsx'

const today = '2026-08-04'

function renderPanel(props = {}) {
  return renderToStaticMarkup(
    <AchievementCenter
      adaptiveCoachFeedback={{ recommendations: [{ id: 'c1', status: 'completed', title: 'Promenad' }] }}
      analysisDate={today}
      checkIn={{ date: today, energy: 7, mood: 'Fokuserad', steps: 7200, workout: true }}
      goalsHabits={{
        achievements: {
          events: [{ definitionId: 'first-meal', eventId: 'e1', type: 'achievementUnlocked' }],
          unlocked: ['first-meal'],
        },
        goals: [{ id: 'g1', status: 'completed', title: 'Veckomål' }],
        habits: [{ completedDates: ['2026-08-01', '2026-08-02', '2026-08-03'], id: 'h1', status: 'active', title: 'Promenad' }],
        weeklyFocus: [{ id: 'f1', status: 'completed', title: 'Lunchloggning' }],
      }}
      meals={[{ date: today, id: 'm1', protein: 25, text: 'Ägg och kvarg' }]}
      onGoalsHabitsChange={() => {}}
      profile={{ goalWeight: 78 }}
      weights={[
        { date: '2026-07-01', value: 91.8 },
        { date: today, value: 89.6 },
      ]}
      {...props}
    />,
  )
}

describe('AchievementCenter', () => {
  it('renders achievements, milestones, challenges and confidence', () => {
    const markup = renderPanel()

    expect(markup).toContain('Smart Goals &amp; Achievements V2')
    expect(markup).toContain('Achievements och delmål')
    expect(markup).toContain('Första måltiden')
    expect(markup).toContain('Delmål')
    expect(markup).toContain('Små utmaningar')
    expect(markup).toContain('Confidence')
    expect(markup).toContain('Coverage')
  })

  it('does not render technical placeholders', () => {
    const markup = renderPanel({
      checkIn: null,
      meals: [],
      weights: [],
    })

    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity|true|false)\b|\[object Object\]/)
  })

  it('renders a neutral fallback when milestones cannot be calculated', () => {
    const markup = renderPanel({
      profile: {},
      weights: [],
    })

    expect(markup).toContain('Delmål visas när startvikt')
  })
})
