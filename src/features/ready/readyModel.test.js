import { describe, expect, it } from 'vitest'
import {
  addItem,
  clearReadyData,
  createEmptyReadyState,
  extractForgotItemLabel,
  getChecklistProgress,
  getExampleItemsForLevel,
  normalizeReadyState,
  removeItem,
  toggleItemDone,
} from './readyModel.js'
import { getReadyLevelPolicy } from './readyLevelPolicy.js'
import { getPrimaryReadyTechniques, getReadyTechnique } from './readyTechniques.js'
import { buildReadyNextEvents } from './readyNextEvents.js'
import { getReadyGreetingPeriod } from './readyGreeting.js'

describe('readyModel', () => {
  it('starts empty without fake school items', () => {
    const state = createEmptyReadyState()
    expect(state.schemaVersion).toBe(1)
    expect(state.items).toEqual([])
    expect(state.levelId).toBeNull()
    expect(state.demoMode).toBe(false)
  })

  it('normalizes invalid payloads safely', () => {
    const state = normalizeReadyState({ schemaVersion: 99, items: [{ label: '  Ryggsäck ' }, null, 'x'] })
    expect(state.schemaVersion).toBe(1)
    expect(state.items).toHaveLength(1)
    expect(state.items[0].label).toBe('Ryggsäck')
    expect(state.items[0].done).toBe(false)
  })

  it('keeps examples separate from saved items', () => {
    const examples = getExampleItemsForLevel('mid79')
    expect(examples.length).toBeGreaterThan(0)
    expect(examples.every((item) => item.example)).toBe(true)
    expect(createEmptyReadyState().items).toEqual([])
  })

  it('supports create, toggle and confirmed delete flows', () => {
    let state = addItem(createEmptyReadyState(), { label: 'Laddare' })
    expect(state.items).toHaveLength(1)
    const id = state.items[0].id
    state = toggleItemDone(state, id)
    expect(state.items[0].done).toBe(true)
    expect(getChecklistProgress(state.items)).toEqual({ done: 1, total: 1 })
    state = removeItem(state, id)
    expect(state.items).toHaveLength(0)
    state = clearReadyData(state)
    expect(state.items).toEqual([])
    expect(state.deletedAt).toBeTruthy()
  })

  it('parses forgot phrases without auto-adding', () => {
    expect(extractForgotItemLabel('Jag glömde laddaren.')).toBe('Laddaren')
    expect(extractForgotItemLabel('Jag glömde min vattenflaska')).toBe('Vattenflaska')
  })
})

describe('readyLevelPolicy', () => {
  it('adapts preschool toward adult-configured picture checklists', () => {
    const policy = getReadyLevelPolicy('preschool')
    expect(policy.adultConfigured).toBe(true)
    expect(policy.pictureChecklist).toBe(true)
    expect(policy.companion.neverSecret).toBe(true)
    expect(policy.companion.neverHumanPretend).toBe(true)
  })
})

describe('readyTechniques', () => {
  it('exposes four primary techniques and marks location as coming soon', () => {
    expect(getPrimaryReadyTechniques()).toHaveLength(4)
    expect(getReadyTechnique('location')?.comingSoon).toBe(true)
  })
})

describe('readyNextEvents', () => {
  it('returns empty without fake events when data is missing', () => {
    expect(buildReadyNextEvents({})).toEqual([])
  })

  it('maps real reminders and keeps demo examples behind demoMode', () => {
    const events = buildReadyNextEvents({
      reminderState: {
        reminders: [{ id: 'r1', text: 'Drick vatten', time: '18:30', enabled: true }],
      },
    })
    expect(events[0]).toMatchObject({ title: 'Drick vatten', timeLabel: '18:30', source: 'reminder' })
    expect(buildReadyNextEvents({ demoMode: true })[0].source).toBe('demo')
  })
})

describe('readyGreeting', () => {
  it('picks a safe greeting period from local hour', () => {
    expect(getReadyGreetingPeriod(new Date('2026-08-27T08:00:00'))).toBe('morning')
    expect(getReadyGreetingPeriod(new Date('2026-08-27T14:00:00'))).toBe('afternoon')
    expect(getReadyGreetingPeriod(new Date('2026-08-27T20:00:00'))).toBe('evening')
  })
})
