import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NutritionCoachCenter from './NutritionCoachCenter.jsx'

describe('NutritionCoachCenter', () => {
  it('renders meal quality timeline gaps recommendations and AI refinement copy', () => {
    const html = renderToStaticMarkup(
      <NutritionCoachCenter
        adaptiveCoachFeedback={{}}
        analysisDate="2026-07-31"
        meals={[{
          calories: 520,
          carbs: 55,
          date: '2026-07-31',
          fat: 12,
          fiber: 7,
          id: 'm1',
          name: 'Havregryn med kvarg och blåbär',
          protein: 32,
          time: '08:00',
          type: 'Frukost',
        }]}
        nutritionGoals={{ fiber: 30, protein: 120 }}
        weights={[{ date: '2026-07-01', weight: 91.8 }, { date: '2026-07-31', weight: 89.6 }]}
      />,
    )

    expect(html).toContain('Nutrition Coach Center')
    expect(html).toContain('Meal quality')
    expect(html).toContain('Daily nutrition timeline')
    expect(html).toContain('Nutrition gaps')
    expect(html).toContain('AI refinement')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]|data:image|base64/)
  })
})
