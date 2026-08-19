import { describe, expect, it } from 'vitest'
import {
  filterAndSortMeals,
  getHistoryRangeBounds,
  summarizeMeals,
} from '../services/nutrition/mealHistoryRange.js'

describe('MealLogger history helpers', () => {
  it('builds today, 7 day and 30 day ranges with local dates across month boundaries', () => {
    expect(getHistoryRangeBounds('2026-03-01', 'today')).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    })
    expect(getHistoryRangeBounds('2026-03-01', '7d')).toEqual({
      from: '2026-02-23',
      to: '2026-03-01',
    })
    expect(getHistoryRangeBounds('2026-03-01', '30d')).toEqual({
      from: '2026-01-31',
      to: '2026-03-01',
    })
  })

  it('filters meal history by local entry date and keeps real zero values', () => {
    const meals = [
      { calories: 0, date: '2026-03-01T23:30:00', id: 'today-zero', name: 'Vatten', protein: 0, time: '23:30', type: 'Dryck' },
      { calories: 400, date: '2026-02-23', id: 'range-start', name: 'Frukost', protein: 20, time: '08:00', type: 'Frukost' },
      { calories: 700, date: '2026-02-22', id: 'outside', name: 'Middag', protein: 35, time: '18:00', type: 'Middag' },
    ]
    const filtered = filterAndSortMeals(meals, {
      from: '2026-02-23',
      search: '',
      sort: 'newest',
      to: '2026-03-01',
      type: 'Alla',
    })
    const summary = summarizeMeals(filtered)

    expect(filtered.map((meal) => meal.id)).toEqual(['today-zero', 'range-start'])
    expect(summary).toEqual({ calories: 400, mealCount: 2, protein: 20 })
  })

  it('filters meal history by source and nutrition provenance', () => {
    const meals = [
      { calories: 400, date: '2026-03-01', id: 'manual', name: 'Lunch', nutritionSource: 'manual', protein: 20, source: 'Manuell', type: 'Lunch' },
      { calories: 500, date: '2026-03-01', id: 'photo', name: 'Foto', photoAnalysis: { provenance: 'ai_estimate', source: 'photoAnalysis' }, protein: 30, source: 'Fotoanalys', type: 'Lunch' },
      { calories: 350, date: '2026-03-01', id: 'template', name: 'Mall', nutritionProvenance: 'derived', protein: 25, sourceCategory: 'template', type: 'Lunch' },
    ]

    expect(filterAndSortMeals(meals, {
      from: '2026-03-01',
      provenance: 'ai_estimated',
      search: '',
      sort: 'newest',
      source: 'photo_analysis',
      to: '2026-03-01',
      type: 'Alla',
    }).map((meal) => meal.id)).toEqual(['photo'])

    expect(filterAndSortMeals(meals, {
      from: '2026-03-01',
      provenance: 'derived',
      search: '',
      sort: 'newest',
      source: 'template',
      to: '2026-03-01',
      type: 'Alla',
    }).map((meal) => meal.id)).toEqual(['template'])
  })
})
