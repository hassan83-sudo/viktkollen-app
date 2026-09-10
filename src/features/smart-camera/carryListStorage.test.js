import { describe, expect, it } from 'vitest'
import { createChecklist, defaultCarryItems } from '../memory/memoryModel.js'
import {
  collectCarryLists,
  getDefaultCarryList,
  getTravelCarryList,
  upsertCarryList,
} from './carryListStorage.js'

function defaultCarry(overrides = {}) {
  return createChecklist({
    items: defaultCarryItems,
    kind: 'carry',
    title: 'Att ta med',
    ...overrides,
  })
}

describe('carryListStorage', () => {
  it('does not copy an existing checklists carry list into packingLists on edit', () => {
    const carry = defaultCarry()
    const memory = { checklists: [carry], packingLists: [] }

    const next = upsertCarryList(memory, { ...carry, items: [...carry.items, { done: false, id: 'extra', label: 'Pass' }] })

    expect(next.packingLists).toEqual([])
    expect(next.checklists).toHaveLength(1)
    expect(next.checklists[0].items.map((item) => item.label)).toContain('Pass')
  })

  it('stores brand-new custom lists in packingLists only', () => {
    const carry = defaultCarry()
    const custom = createChecklist({ contextId: 'custom', items: ['Solkräm'], kind: 'carry', title: 'Semester' })
    const memory = { checklists: [carry], packingLists: [] }

    const next = upsertCarryList(memory, custom)

    expect(next.checklists).toEqual([carry])
    expect(next.packingLists).toHaveLength(1)
    expect(next.packingLists[0].title).toBe('Semester')
  })

  it('updates both stores when the same id already exists in both', () => {
    const carry = defaultCarry()
    const memory = { checklists: [carry], packingLists: [carry] }
    const edited = { ...carry, title: 'Uppdaterad' }

    const next = upsertCarryList(memory, edited)

    expect(next.checklists[0].title).toBe('Uppdaterad')
    expect(next.packingLists[0].title).toBe('Uppdaterad')
  })

  it('lets pack mode find a travel list created in Mina ta-med-listor', () => {
    const travel = createChecklist({
      contextId: 'travel',
      items: ['Tält', 'Pass/ID'],
      kind: 'carry',
      title: 'Resa',
    })
    const memory = { checklists: [defaultCarry()], packingLists: [travel] }

    expect(getTravelCarryList(memory).id).toBe(travel.id)
    expect(getTravelCarryList(memory).items.map((item) => item.label)).toContain('Tält')
  })

  it('keeps forgotten/items on the default checklists carry list when custom lists exist', () => {
    const carry = defaultCarry()
    const custom = createChecklist({ contextId: 'custom', items: ['Solkräm'], kind: 'carry', title: 'Semester' })
    const memory = { checklists: [carry], packingLists: [custom] }

    expect(getDefaultCarryList(memory).id).toBe(carry.id)
    expect(collectCarryLists(memory).map((list) => list.id).sort()).toEqual([carry.id, custom.id].sort())
  })

  it('falls back to a packingLists carry list when checklists has none', () => {
    const custom = createChecklist({ contextId: 'custom', items: ['Solkräm'], kind: 'carry', title: 'Semester' })
    const memory = { checklists: [], packingLists: [custom] }

    expect(getDefaultCarryList(memory).id).toBe(custom.id)
  })
})
