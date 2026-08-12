import {
  getEntryLocalDate,
  getLocalDateRange,
  isLocalDateInRange,
} from '../localDate.js'
import { normalizeMeals } from '../nutritionService.js'

export const historyRangeOptions = [
  { days: 1, id: 'today', label: 'Idag' },
  { days: 7, id: '7d', label: '7 dagar' },
  { days: 30, id: '30d', label: '30 dagar' },
]

export function getHistoryRangeBounds(anchorDate, rangeId) {
  const option = historyRangeOptions.find((item) => item.id === rangeId) || historyRangeOptions[0]
  const range = getLocalDateRange(option.days, `${anchorDate}T12:00:00`)

  return {
    from: range.start,
    to: range.end,
  }
}

export function filterAndSortMeals(meals, filters) {
  const search = filters.search.trim().toLocaleLowerCase('sv-SE')

  return normalizeMeals(meals)
    .filter((meal) => {
      const localDate = getEntryLocalDate(meal)

      if (filters.type !== 'Alla' && meal.type !== filters.type) {
        return false
      }

      if (!isLocalDateInRange(localDate, { end: filters.to, start: filters.from })) {
        return false
      }

      if (!search) {
        return true
      }

      return [meal.name, meal.description, meal.note]
        .join(' ')
        .toLocaleLowerCase('sv-SE')
        .includes(search)
    })
    .sort((first, second) => {
      if (filters.sort === 'oldest') {
        return `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
      }

      if (filters.sort === 'caloriesHigh') {
        return (second.calories || 0) - (first.calories || 0)
      }

      if (filters.sort === 'caloriesLow') {
        return (first.calories || 0) - (second.calories || 0)
      }

      if (filters.sort === 'proteinHigh') {
        return (second.protein || 0) - (first.protein || 0)
      }

      if (filters.sort === 'proteinLow') {
        return (first.protein || 0) - (second.protein || 0)
      }

      return `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`)
    })
}

export function summarizeMeals(meals) {
  return meals.reduce((summary, meal) => ({
    calories: summary.calories + (Number(meal.calories) || 0),
    mealCount: summary.mealCount + 1,
    protein: summary.protein + (Number(meal.protein) || 0),
  }), {
    calories: 0,
    mealCount: 0,
    protein: 0,
  })
}
