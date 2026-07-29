import { describe, expect, it } from 'vitest'
import {
  addManualShoppingListItem,
  buildShoppingListFromMealPlan,
  categorizeShoppingListItem,
  categorizeShoppingListItems,
  clearCheckedShoppingListItems,
  clearShoppingListWeek,
  formatShoppingListForClipboard,
  getShoppingList,
  mergeShoppingListItems,
  normalizeShoppingListItem,
  readShoppingLists,
  removeShoppingListItem,
  shoppingListInternals,
  shoppingListsStorageKey,
  toggleShoppingListItem,
  updateShoppingListFromMealPlan,
  writeShoppingLists,
} from './nutritionEngine.js'

function createStorage(initial = {}) {
  const state = new Map(Object.entries(initial))
  return {
    getItem: (key) => state.get(key) || null,
    setItem: (key, value) => state.set(key, value),
  }
}

const weekStart = '2026-07-27'
const week = {
  weekStart,
  days: {
    [weekStart]: [
      {
        date: weekStart,
        id: 'plan-1',
        ingredients: ['500 g kyckling', '1 kg potatis', 'broccoli', '6 ägg'],
        mealType: 'Lunch',
        text: 'kyckling och potatis',
        title: 'Lunch',
      },
    ],
  },
}

describe('shopping parser and categories', () => {
  it.each([
    ['broccoli', { name: 'broccoli', quantity: null, unit: '' }],
    ['500 g kyckling', { name: 'kyckling', quantity: 500, unit: 'g' }],
    ['1 kg potatis', { name: 'potatis', quantity: 1000, unit: 'g' }],
    ['250 ml mjölk', { name: 'mjölk', quantity: 250, unit: 'ml' }],
    ['1 l läsk', { name: 'läsk', quantity: 1000, unit: 'ml' }],
    ['6 ägg', { name: 'ägg', quantity: 6, unit: 'st' }],
    ['2 paket ris', { name: 'ris', quantity: 2, unit: 'paket' }],
  ])('parses ingredient %s', (input, expected) => {
    expect(normalizeShoppingListItem({ name: input })).toMatchObject(expected)
  })

  it('ignores empty item', () => {
    expect(normalizeShoppingListItem({ name: '' })).toBeNull()
  })

  it('keeps Swedish characters', () => {
    expect(normalizeShoppingListItem({ name: 'ägg' }).name).toBe('ägg')
  })

  it.each([
    ['broccoli', 'Frukt och grönt'],
    ['lax', 'Kött och fisk'],
    ['ägg', 'Mejeri och ägg'],
    ['ris', 'Bröd och spannmål'],
    ['bönor', 'Skafferi'],
    ['glass', 'Fryst'],
    ['läsk', 'Dryck'],
    ['okänd vara', 'Övrigt'],
  ])('categorizes %s', (name, category) => {
    expect(categorizeShoppingListItem({ name })).toBe(category)
  })

  it('keeps manual category override', () => {
    expect(categorizeShoppingListItem({ category: 'Skafferi', name: 'broccoli' })).toBe('Skafferi')
  })
})

describe('shopping merge and list operations', () => {
  it('merges same grams', () => {
    expect(mergeShoppingListItems([{ name: '500 g ris' }, { name: '250 g ris' }])[0].quantity).toBe(750)
  })

  it('normalizes kg and g before merge', () => {
    expect(mergeShoppingListItems([{ name: '1 kg potatis' }, { name: '500 g potatis' }])[0].quantity).toBe(1500)
  })

  it('normalizes liters and ml before merge', () => {
    expect(mergeShoppingListItems([{ name: '1 l mjölk' }, { name: '500 ml mjölk' }])[0].quantity).toBe(1500)
  })

  it('keeps incompatible units separate', () => {
    expect(mergeShoppingListItems([{ name: '1 paket ris' }, { name: '500 g ris' }])).toHaveLength(2)
  })

  it('merges names case-insensitively', () => {
    expect(mergeShoppingListItems([{ name: '500 g Ris' }, { name: '500 g ris' }])[0].quantity).toBe(1000)
  })

  it('deduplicates source ids', () => {
    expect(mergeShoppingListItems([
      { name: '500 g ris', sourcePlannedMealIds: ['a'] },
      { name: '500 g ris', sourcePlannedMealIds: ['a', 'b'] },
    ])[0].sourcePlannedMealIds).toEqual(['a', 'b'])
  })

  it('preserves checked status from previous list', () => {
    const previous = [normalizeShoppingListItem({ checked: true, name: '500 g ris' })]
    expect(mergeShoppingListItems([{ name: '500 g ris' }], previous)[0].checked).toBe(true)
  })

  it('groups items by category', () => {
    expect(categorizeShoppingListItems([{ name: 'broccoli' }, { name: 'lax' }]).map((group) => group.category)).toEqual(['Frukt och grönt', 'Kött och fisk'])
  })

  it('toggles checked item', () => {
    const list = buildShoppingListFromMealPlan(week)
    expect(toggleShoppingListItem(list, list.items[0].id).items[0].checked).toBe(true)
  })

  it('adds manual item', () => {
    expect(addManualShoppingListItem(buildShoppingListFromMealPlan(week), { name: 'kaffe' }).items.some((item) => item.manual)).toBe(true)
  })

  it('removes item', () => {
    const list = buildShoppingListFromMealPlan(week)
    expect(removeShoppingListItem(list, list.items[0].id).items).toHaveLength(list.items.length - 1)
  })

  it('clears checked items', () => {
    const base = buildShoppingListFromMealPlan(week)
    const list = toggleShoppingListItem(base, base.items[0]?.id)
    expect(clearCheckedShoppingListItems(list).items.length).toBeLessThan(list.items.length)
  })
})

describe('shopping storage and plan generation', () => {
  it('reads empty storage', () => {
    expect(readShoppingLists(createStorage()).weeks).toEqual({})
  })

  it('reads malformed storage safely', () => {
    expect(readShoppingLists(createStorage({ [shoppingListsStorageKey]: '{bad' })).weeks).toEqual({})
  })

  it('writes shopping lists', () => {
    const storage = createStorage()
    writeShoppingLists({ weeks: { [weekStart]: buildShoppingListFromMealPlan(week) } }, storage)
    expect(readShoppingLists(storage).weeks[weekStart]).toBeTruthy()
  })

  it('handles write error', () => {
    expect(writeShoppingLists({ weeks: {} }, { setItem: () => { throw new Error('full') } }).weeks).toEqual({})
  })

  it('keeps separate weeks', () => {
    const lists = {
      weeks: {
        [weekStart]: buildShoppingListFromMealPlan(week),
        '2026-08-03': buildShoppingListFromMealPlan({
          weekStart: '2026-08-03',
          days: {
            '2026-08-03': [{ ...week.days[weekStart][0], date: '2026-08-03', id: 'plan-2' }],
          },
        }),
      },
    }
    expect(Object.keys(lists.weeks)).toHaveLength(2)
  })

  it('clears one week only', () => {
    const lists = {
      weeks: {
        [weekStart]: buildShoppingListFromMealPlan(week),
        '2026-08-03': buildShoppingListFromMealPlan({
          weekStart: '2026-08-03',
          days: {
            '2026-08-03': [{ ...week.days[weekStart][0], date: '2026-08-03', id: 'plan-2' }],
          },
        }),
      },
    }
    expect(getShoppingList(clearShoppingListWeek(lists, weekStart), '2026-08-03').items.length).toBeGreaterThan(0)
  })

  it('builds shopping list from planned ingredients', () => {
    expect(buildShoppingListFromMealPlan(week).items.map((item) => item.name)).toContain('kyckling')
  })

  it('updates from plan and reports summary', () => {
    expect(updateShoppingListFromMealPlan({}, week).summary).toContain('varor')
  })

  it('preserves manual item on update from plan', () => {
    const previous = addManualShoppingListItem(buildShoppingListFromMealPlan(week), { name: 'kaffe' })
    expect(buildShoppingListFromMealPlan(week, previous).items.some((item) => item.name === 'kaffe')).toBe(true)
  })

  it('formats clipboard text', () => {
    expect(formatShoppingListForClipboard(buildShoppingListFromMealPlan(week))).toContain('Inköpslista vecka')
  })

  it('shows checked status in clipboard text', () => {
    const list = buildShoppingListFromMealPlan(week)
    const checked = toggleShoppingListItem(list, list.items[0].id)
    expect(formatShoppingListForClipboard(checked)).toContain('[x]')
  })

  it('does not include empty categories in clipboard text', () => {
    expect(formatShoppingListForClipboard({ weekStart, items: [] })).not.toContain('Övrigt')
  })

  it('handles 5000 shopping items', () => {
    const items = Array.from({ length: 5000 }, (_, index) => ({ name: `${index} g ris` }))
    expect(mergeShoppingListItems(items).length).toBeGreaterThan(0)
  })

  it('exposes parser internals for regression', () => {
    expect(shoppingListInternals.parseIngredientLine('500 g ris').name).toBe('ris')
  })
})
