import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HealthPredictionCard from './HealthPredictionCard.jsx'

const today = '2026-07-31'

function renderCard(props = {}) {
  return renderToStaticMarkup(
    <HealthPredictionCard
      analysisDate={today}
      checkIn={{ date: today, energy: 7, steps: 8600 }}
      meals={[
        { date: '2026-07-29T12:00:00', calories: 520, id: 'm1', protein: 42, text: 'Kyckling' },
        { date: '2026-07-30T12:00:00', calories: 480, id: 'm2', protein: 38, text: 'Kvarg' },
      ]}
      nutritionGoals={{ protein: 80 }}
      profile={{ goalWeight: 78 }}
      weights={[
        { date: '2026-07-01T08:00:00', value: 92 },
        { date: '2026-07-10T08:00:00', value: 91 },
        { date: '2026-07-20T08:00:00', value: 90 },
        { date: '2026-07-31T08:00:00', value: 89.5 },
      ]}
      {...props}
    />,
  )
}

describe('HealthPredictionCard', () => {
  it('renders dashboard prediction fields without technical values', () => {
    const html = renderCard()

    expect(html).toContain('Health Prediction')
    expect(html).toContain('Beräknad måldag')
    expect(html).toContain('Health Score nästa vecka')
    expect(html).toContain('Confidence')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })

  it('renders a helpful empty state when local history is missing', () => {
    const html = renderCard({
      checkIn: null,
      meals: [],
      weights: [],
    })

    expect(html).toContain('Logga några dagar till')
    expect(html).toContain('personliga prognoser')
  })
})
