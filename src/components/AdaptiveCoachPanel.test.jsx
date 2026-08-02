import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AdaptiveCoachPanel from './AdaptiveCoachPanel.jsx'

const analysisDate = '2026-07-31'

function renderPanel(props = {}) {
  return renderToStaticMarkup(
    <AdaptiveCoachPanel
      analysisDate={analysisDate}
      checkIn={{ date: analysisDate, energy: 5, mood: 'Lugn', steps: 4200 }}
      goalsHabits={{
        habits: [{ id: 'habit-1', status: 'active', title: 'Logga lunch' }],
        weeklyFocus: [{ action: 'Logga lunch två dagar.', id: 'focus-1', order: 1, status: 'active', title: 'Lunchloggning' }],
      }}
      meals={[
        { date: analysisDate, id: 'meal-1', name: 'Kvarg och banan', protein: 24, type: 'Mellanmål' },
      ]}
      nutritionGoals={{ protein: '108-144 g' }}
      profile={{ goalWeight: 78, startWeight: 91.8 }}
      reminderState={{ reminders: [{ enabled: true, id: 'r1', scheduleType: 'daily', time: '12:00', title: 'Lunch' }] }}
      weights={[
        { date: '2026-07-24', id: 'w1', time: '08:00', value: 91.8 },
        { date: analysisDate, id: 'w2', time: '08:00', value: 89.6 },
      ]}
      {...props}
    />,
  )
}

describe('AdaptiveCoachPanel', () => {
  it('renders the adaptive coach sections', () => {
    const markup = renderPanel()

    expect(markup).toContain('Smart Coach V3')
    expect(markup).toContain('Dagens fokus')
    expect(markup).toContain('Veckans viktigaste förbättring')
    expect(markup).toContain('Vad som fungerar bra')
    expect(markup).toContain('Riskområden')
    expect(markup).toContain('Rekommenderade nästa steg')
    expect(markup).toContain('Confidence')
    expect(markup).toContain('Coverage')
  })

  it('does not render technical placeholder values', () => {
    const markup = renderPanel({
      checkIn: null,
      meals: [],
      weights: [],
    })

    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity)\b|\[object Object\]/)
    expect(markup).toContain('Coachen ger allmänt stöd')
  })
})
