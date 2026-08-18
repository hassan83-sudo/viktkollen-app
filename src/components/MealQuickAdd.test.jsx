import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import MealQuickAdd from './mealTemplates/MealQuickAdd.jsx'

const today = '2026-07-28'

const template = {
  id: 'template-1',
  name: 'Kycklinglåda',
  text: 'Kyckling, ris och broccoli',
  mealType: 'Lunch',
  defaultTime: '12:15',
  nutritionOverride: {
    calories: 520,
    protein: 42,
    carbs: 54,
    fat: 12,
  },
  isFavorite: true,
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
  useCount: 3,
}

const meal = {
  id: 'meal-1',
  name: 'Pizza',
  description: 'Jag åt pizza',
  text: 'Jag åt pizza',
  type: 'Middag',
  date: today,
  time: '18:30',
  nutritionOverride: {
    calories: 850,
    protein: 32,
  },
  createdAt: '2026-07-28T16:30:00.000Z',
  updatedAt: '2026-07-28T16:30:00.000Z',
}

function html(props = {}) {
  return renderToStaticMarkup(
    <MealQuickAdd
      meals={[meal]}
      selectedMealDate={today}
      templates={[template]}
      onMealsChange={vi.fn()}
      onTemplatesChange={vi.fn()}
      {...props}
    />,
  )
}

describe('Meal Quick Add V1 render', () => {
  it('renders coming soon support for photo or free text templates', () => {
    const markup = html()

    expect(markup).toContain('Skapa mall med foto eller fri text')
    expect(markup).toContain('Denna funktion kommer i en kommande uppdatering.')
  })

  it('renders quick add heading', () => {
    expect(html()).toContain('Mallar och senaste måltider')
  })

  it('renders saved template name', () => {
    expect(html()).toContain('Kycklinglåda')
  })

  it('renders recent meal name', () => {
    expect(html()).toContain('Pizza')
  })

  it('renders template nutrition preview', () => {
    expect(html()).toContain('42 g')
  })

  it('renders add buttons for template and recent meal', () => {
    const markup = html()

    expect(markup).toContain('Lägg till')
    expect(markup).toContain('Lägg till igen')
  })

  it('renders favorite button with aria pressed', () => {
    expect(html()).toContain('aria-pressed="true"')
  })

  it('renders empty template state', () => {
    expect(html({ templates: [] })).toContain('Inga mallar ännu.')
  })

  it('renders empty recent meal state', () => {
    expect(html({ meals: [] })).toContain('Inga tidigare måltider att återanvända.')
  })

  it('does not render unsafe placeholder values', () => {
    expect(html({ meals: [null], templates: [null] })).not.toMatch(/NaN|undefined|null|Infinity|\[object Object\]/)
  })
})
