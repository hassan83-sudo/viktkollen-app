import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CoachPlanCenter from './CoachPlanCenter.jsx'

describe('CoachPlanCenter', () => {
  it('renders the lazy action plan center with today week status and explanation', () => {
    const html = renderToStaticMarkup(
      <CoachPlanCenter
        adaptiveCoachFeedback={{}}
        analysisDate="2026-07-31"
        checkIns={[{ date: '2026-07-31', energy: 4, steps: 7200 }]}
        goalsHabits={{ habits: [{ id: 'h1', category: 'steps', status: 'active', title: 'Promenad' }] }}
        meals={[{ id: 'm1', date: '2026-07-31', protein: 32, calories: 520 }]}
        onAdaptiveCoachFeedbackChange={() => {}}
        profile={{ goalWeight: 78 }}
        reminderState={{ notificationsV3: { settings: { quietHours: { enabled: true, start: '22:00', end: '07:00' } } } }}
        weights={[{ date: '2026-07-01', weight: 91.8 }, { date: '2026-07-31', weight: 89.6 }]}
      />,
    )

    expect(html).toContain('Coach Plan Center')
    expect(html).toContain('Dagens plan')
    expect(html).toContain('Veckans plan')
    expect(html).toContain('Varför dessa steg valdes')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})
