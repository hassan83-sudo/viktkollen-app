import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MealEditForm from './mealEditor/MealEditForm.jsx'

const draft = {
  correctionNote: 'Vägd portion',
  date: '2026-07-28',
  description: '200 g kyckling och 150 g ris',
  mealType: 'Lunch',
  nutritionOverride: {
    calories: '610',
    protein: '45,5',
  },
  time: '12:30',
}

function html(props = {}) {
  return renderToStaticMarkup(
    <MealEditForm
      draft={draft}
      errors={{}}
      onCancel={() => {}}
      onChange={() => {}}
      onNutritionChange={() => {}}
      onResetAutomatic={() => {}}
      onSubmit={() => {}}
      {...props}
    />,
  )
}

describe('MealEditForm', () => {
  it('renders prefilled meal text', () => {
    expect(html()).toContain('200 g kyckling och 150 g ris')
  })

  it('renders date and time fields', () => {
    const markup = html()

    expect(markup).toContain('type="date"')
    expect(markup).toContain('type="time"')
  })

  it('renders meal type options', () => {
    const markup = html()

    expect(markup).toContain('Automatiskt')
    expect(markup).toContain('Nattmål')
  })

  it('renders manual nutrition fields', () => {
    const markup = html()

    expect(markup).toContain('Protein (g)')
    expect(markup).toContain('Kalorier (kcal)')
    expect(markup).toContain('Kolhydrater (g)')
    expect(markup).toContain('Fett (g)')
  })

  it('renders reset automatic analysis button', () => {
    expect(html()).toContain('Återställ automatisk analys')
  })

  it('renders save and cancel buttons', () => {
    const markup = html()

    expect(markup).toContain('Spara ändringar')
    expect(markup).toContain('Avbryt')
  })

  it('renders Swedish validation messages', () => {
    const markup = html({
      errors: {
        calories: 'Kalorier måste vara ett giltigt tal.',
        description: 'Ange en beskrivning av måltiden.',
      },
    })

    expect(markup).toContain('Kalorier måste vara ett giltigt tal.')
    expect(markup).toContain('Ange en beskrivning av måltiden.')
  })

  it('does not render unsafe placeholder values', () => {
    expect(html()).not.toMatch(/NaN|undefined|null|Infinity|\[object Object\]/)
  })
})
