import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PredictionCenter from './PredictionCenter.jsx'

describe('PredictionCenter', () => {
  it('renders predictions without technical values', () => {
    const html = renderToStaticMarkup(
      <PredictionCenter
        adaptiveCoachFeedback={{
          actionPlans: [{
            confidence: 0.6,
            generatedAt: '2026-07-31T12:00:00.000Z',
            days: [{ date: '2026-07-31', actions: [{ id: 'a1', status: 'completed' }] }],
          }],
          remoteAiConsent: { coachRemoteEnabled: true },
        }}
        meals={[
          { date: '2026-07-31T12:00:00', name: 'Kyckling broccoli', type: 'Lunch', calories: 520, protein: 42, carbs: 45, fat: 12, fiber: 7 },
        ]}
        nutritionGoals={{ protein: 120, fiber: 25 }}
        today="2026-07-31"
        weights={[
          { date: '2026-07-20T08:00:00', value: 91.8 },
          { date: '2026-07-31T08:00:00', value: 89.6 },
        ]}
      />,
    )

    expect(html).toContain('Prediction Center')
    expect(html).toContain('Predictions')
    expect(html).toContain('Warning signals')
    expect(html).toContain('Opportunities')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('[object Object]')
    expect(html.toLocaleLowerCase('sv-SE')).not.toContain('diagnos')
  })
})
