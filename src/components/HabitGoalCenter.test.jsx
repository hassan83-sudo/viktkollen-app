import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HabitGoalCenter from './HabitGoalCenter.jsx'

const props = {
  checkIns: [
    { date: '2026-07-30', energy: 7, mood: 'Fokuserad', steps: 7200 },
    { date: '2026-07-31', energy: 7, mood: 'Bra', steps: 7600 },
  ],
  goalsHabits: {
    goals: [{ category: 'weight', id: 'g1', status: 'active', target: 78, title: 'Målvikt' }],
    habits: [{ category: 'check_in', id: 'h1', status: 'active', title: 'Check-in', trackingMode: 'automatic' }],
  },
  meals: [{ calories: 520, date: '2026-07-31T12:00:00', fiber: 4, id: 'm1', name: 'Kyckling ris', protein: 32 }],
  nutritionGoals: { fiber: 25, protein: 120 },
  profile: { goalWeight: 78 },
  today: '2026-07-31',
  weights: [
    { date: '2026-07-01', value: 91.8 },
    { date: '2026-07-31', value: 89.6 },
  ],
}

describe('HabitGoalCenter', () => {
  it('renders adaptive goals habits and predictions safely', () => {
    const html = renderToStaticMarkup(<HabitGoalCenter {...props} />)

    expect(html).toContain('Habit Goal Center')
    expect(html).toContain('Aktiva mål')
    expect(html).toContain('Rekommenderade mål')
    expect(html).toContain('Rekommenderade vanor')
    expect(html).toContain('Prognos')
    expect(html).not.toMatch(/undefined|NaN|Infinity|\[object Object\]|session|token|provider/i)
  })

  it('renders live progress and consent gated AI control', () => {
    const html = renderToStaticMarkup(<HabitGoalCenter {...props} />)

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Jag vill att AI endast får en minimal mål- och vanesammanfattning.')
    expect(html).toContain('Förfina formuleringar')
  })
})
