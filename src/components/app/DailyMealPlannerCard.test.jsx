import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DailyMealPlannerCard from './DailyMealPlannerCard.jsx'

describe('DailyMealPlannerCard', () => {
  it('renders meals and shopping list without technical placeholders', () => {
    const html = renderToStaticMarkup(
      <DailyMealPlannerCard
        date="2026-08-10"
        meals={[]}
        nutritionGoals={{ calories: 2100, protein: 130 }}
      />,
    )

    expect(html).toContain('Dagens måltidsplan')
    expect(html).toContain('Frukost')
    expect(html).toContain('Lunch')
    expect(html).toContain('Middag')
    expect(html).toContain('Mellanmål')
    expect(html).toContain('Inköpslista')
    expect(html).toContain('Generera ny plan')
    expect(html).toContain('Spara till veckoplan')
    expect(html).toContain('Inte sparad')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})
