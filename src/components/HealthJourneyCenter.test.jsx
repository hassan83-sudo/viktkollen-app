import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HealthJourneyCenter from './HealthJourneyCenter.jsx'

const props = {
  adaptiveCoachFeedback: {
    recommendations: [{ id: 'r1', recommendationId: 'r1', status: 'completed', title: 'Kort steg', updatedAt: '2026-07-30T08:00:00.000Z' }],
  },
  checkIns: [
    { date: '2026-07-29T21:00:00', energy: 6, mood: 'Bra', steps: 7000 },
    { date: '2026-07-30T21:00:00', energy: 7, mood: 'Fokuserad', steps: 8200 },
  ],
  goalsHabits: {
    achievements: { unlocked: ['first-meal'] },
    habits: [{ completedDates: ['2026-07-29', '2026-07-30'], id: 'habit-1', status: 'active' }],
  },
  meals: [
    { calories: 390, date: '2026-07-30T08:00:00', fiber: 6, id: 'meal-1', name: 'Ägg och havregryn', protein: 28, type: 'Frukost' },
  ],
  nutritionGoals: { fiber: 25, protein: 120 },
  profile: { goal: 'gå ner i vikt', goalWeight: 78 },
  today: '2026-07-30',
  weights: [
    { date: '2026-07-01T07:00:00', id: 'w1', value: 91.8 },
    { date: '2026-07-30T07:00:00', id: 'w2', value: 89.6 },
  ],
}

describe('HealthJourneyCenter', () => {
  it('renders journey overview without raw technical values', () => {
    const html = renderToStaticMarkup(<HealthJourneyCenter {...props} />)

    expect(html).toContain('Health Journey')
    expect(html).toContain('Timeline')
    expect(html).toContain('Milestones')
    expect(html).toContain('Begränsningar')
    expect(html).toContain('Förfina förklaring')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('[object Object]')
    expect(html).not.toContain('providerresponse')
    expect(html).not.toContain('authSession')
  })

  it('renders accessible filters and expand controls', () => {
    const html = renderToStaticMarkup(<HealthJourneyCenter {...props} />)

    expect(html).toContain('aria-label="Journey-filter"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Alla teman')
    expect(html).toContain('Alla perioder')
    expect(html).toContain('Alla signaler')
  })

  it('keeps AI refinement consent gated in the rendered UI', () => {
    const html = renderToStaticMarkup(<HealthJourneyCenter {...props} />)

    expect(html).toContain('Jag vill att AI endast får en minimal journey-sammanfattning.')
    expect(html).not.toContain('raw history')
    expect(html).not.toContain('provider-svar')
  })
})
