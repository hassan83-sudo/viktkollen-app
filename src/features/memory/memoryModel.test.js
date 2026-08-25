import { describe, expect, it } from 'vitest'
import {
  createChecklist,
  createItemLocation,
  findItemLocation,
  formatLocationAnswer,
  memoryContexts,
} from './memoryModel.js'
import { compareRecallAnswer, startRecallRound } from './memoryRecall.js'

describe('memoryModel', () => {
  it('creates context-tagged checklists independent of the camera', () => {
    expect(memoryContexts.map((context) => context.id)).toEqual([
      'work',
      'school',
      'training',
      'party',
      'travel',
      'everyday',
      'custom',
    ])
    const list = createChecklist({
      contextId: 'work',
      items: ['Nycklar', 'Plånbok'],
      kind: 'carry',
    })
    expect(list.contextId).toBe('work')
    expect(list.items.map((item) => item.label)).toEqual(['Nycklar', 'Plånbok'])
  })

  it('answers where an item was left only from saved notes', () => {
    const saved = createItemLocation({ itemLabel: 'Bilnyckel', placeLabel: 'kökslådan' })
    expect(formatLocationAnswer(saved)).toBe('Bilnyckel → kökslådan')
    expect(findItemLocation([saved], 'bilnyckeln')?.placeLabel).toBe('kökslådan')
    expect(formatLocationAnswer(null, 'laddaren')).toContain('ingen sparad plats')
  })
})

describe('memoryRecall', () => {
  it('hides items and compares an active recall answer', () => {
    const round = startRecallRound(['Mobil', 'Nycklar', 'Plånbok', 'Servetter', 'Vatten'])
    expect(round.hidden).toBe(true)
    expect(round.items).toHaveLength(5)
    const result = compareRecallAnswer(round.items, 'mobil, nycklar, hörlurar')
    expect(result.matched).toContain('Mobil')
    expect(result.missed).toContain('Plånbok')
    expect(result.extra).toContain('hörlurar')
  })
})
