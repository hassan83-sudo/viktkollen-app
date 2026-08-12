import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import MealHistory from './MealHistory.jsx'

const meals = [
  {
    calories: 600,
    date: '2026-08-11',
    description: 'Kyckling och ris',
    id: 'meal-1',
    name: 'Lunch',
    protein: 42,
    source: 'manual',
    time: '12:00',
    type: 'Lunch',
  },
]

function html(overrides = {}) {
  return renderToStaticMarkup(
    <MealHistory
      filters={{ from: '', search: '', sort: 'newest', to: '', type: 'Alla' }}
      historyRange="7d"
      historyRangeOptions={[
        { id: 'today', label: 'Idag' },
        { id: '7d', label: '7 dagar' },
        { id: '30d', label: '30 dagar' },
      ]}
      historySummary={{ calories: 600, mealCount: 1, protein: 42 }}
      meals={meals}
      onClearFilters={vi.fn()}
      onCopyMeal={vi.fn()}
      onDeleteMeal={vi.fn()}
      onEditMeal={vi.fn()}
      onFilterChange={vi.fn()}
      onHistoryRangeChange={vi.fn()}
      onSaveFavorite={vi.fn()}
      onSaveTemplate={vi.fn()}
      {...overrides}
    />,
  )
}

describe('MealHistory', () => {
  it('renders range switching and interval summary', () => {
    const markup = html().replaceAll('\u00a0', ' ')

    expect(markup).toContain('aria-label="Välj period för måltidshistorik"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('7 dagar')
    expect(markup).toContain('600 kcal')
    expect(markup).toContain('42 g')
    expect(markup).toContain('Registreringar')
  })

  it('keeps the empty state helpful', () => {
    expect(html({ historySummary: { calories: 0, mealCount: 0, protein: 0 }, meals: [] })).toContain('Inga måltider matchar filtren.')
  })
})
