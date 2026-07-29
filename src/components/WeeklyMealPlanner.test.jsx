import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import WeeklyMealPlanner from './WeeklyMealPlanner.jsx'

const template = {
  defaultTime: '12:00',
  id: 'template-1',
  isFavorite: true,
  mealType: 'Lunch',
  name: 'Kycklinglåda',
  nutritionOverride: { calories: 520, protein: 42 },
  text: '500 g kyckling, ris och broccoli',
  useCount: 3,
}

function html(props = {}) {
  return renderToStaticMarkup(
    <WeeklyMealPlanner
      dietaryPreferences={{}}
      meals={[]}
      nutritionGoals={{ protein: 110, calories: 2100 }}
      templates={[template]}
      onMealsChange={vi.fn()}
      {...props}
    />,
  )
}

describe('Weekly Meal Planner UI', () => {
  it('renders planner heading', () => {
    expect(html()).toContain('Planera måltider')
  })

  it('renders week navigation', () => {
    const markup = html()
    expect(markup).toContain('Föregående vecka')
    expect(markup).toContain('Nästa vecka')
    expect(markup).toContain('Denna vecka')
  })

  it('renders seven days', () => {
    expect((html().match(/Lägg till måltid/g) || []).length).toBe(7)
  })

  it('renders planned value labels', () => {
    const markup = html()
    expect(markup).toContain('Planerat protein')
    expect(markup).toContain('Planerade kalorier')
  })

  it('renders empty day text', () => {
    expect(html()).toContain('Inga måltider planerade.')
  })

  it('renders custom meal form', () => {
    expect(html()).toContain('Egen planerad måltid')
  })

  it('renders meal template list', () => {
    expect(html()).toContain('Kycklinglåda')
  })

  it('renders copy day controls', () => {
    expect(html()).toContain('Kopiera dagens plan')
  })

  it('renders insights and suggestions section', () => {
    expect(html()).toContain('Planeringsstöd')
  })

  it('renders shopping list panel', () => {
    expect(html()).toContain('Veckans varor')
  })

  it('renders shopping actions', () => {
    const markup = html()
    expect(markup).toContain('Generera inköpslista')
    expect(markup).toContain('Kopiera inköpslista')
  })

  it('renders manual shopping item form', () => {
    expect(html()).toContain('Lägg till egen vara')
  })

  it('renders reset actions', () => {
    const markup = html()
    expect(markup).toContain('Rensa veckoplan')
    expect(markup).toContain('Rensa inköpslista')
  })

  it('keeps planned-vs-actual text visible', () => {
    expect(html()).toContain('räknas inte som registrerat intag')
  })

  it('does not render unsafe placeholders', () => {
    expect(html({ templates: [null] })).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})
