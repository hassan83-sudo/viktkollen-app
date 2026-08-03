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
      onAdaptiveCoachFeedbackChange={() => {}}
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
  it('renders the adaptive coach sections and feedback actions', () => {
    const markup = renderPanel()

    expect(markup).toContain('Smart Coach V4')
    expect(markup).toContain('Dagens fokus')
    expect(markup).toContain('Veckans viktigaste förbättring')
    expect(markup).toContain('Vad som fungerar bra')
    expect(markup).toContain('Riskområden')
    expect(markup).toContain('Rekommenderade nästa steg')
    expect(markup).toContain('Gör detta')
    expect(markup).toContain('Acceptera')
    expect(markup).toContain('Skjut upp')
    expect(markup).toContain('Klar')
    expect(markup).toContain('Inte relevant')
    expect(markup).toContain('Senaste coachåtgärder')
    expect(markup).toContain('Visa coachhistorik')
    expect(markup).toContain('Varför detta prioriteras')
    expect(markup).toContain('Aktiva actions')
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

  it('renders latest feedback status and action history', () => {
    const markup = renderPanel({
      adaptiveCoachFeedback: {
        recommendations: [{
          action: 'Lägg till protein i nästa måltid.',
          area: 'nutrition',
          id: 'coach-nutrition-demo',
          status: 'completed',
          title: 'Stärk proteinbasen',
          updatedAt: '2026-07-31T10:00:00.000Z',
        }],
      },
    })

    expect(markup).toContain('Coach score')
    expect(markup).toContain('Klar')
    expect(markup).toContain('Stärk proteinbasen')
  })
})
