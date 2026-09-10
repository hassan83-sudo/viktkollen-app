import { createChecklist, defaultCarryItems } from '../memory/memoryModel.js'

const defaultTravelItems = Object.freeze(['Pass/ID', 'Laddare', 'Hörlurar', 'Mediciner', 'Ombyte'])

export function collectCarryLists(memory = {}) {
  const byId = new Map()
  ;[...(Array.isArray(memory.packingLists) ? memory.packingLists : []),
    ...(Array.isArray(memory.checklists) ? memory.checklists.filter((list) => list?.kind === 'carry') : []),
  ].forEach((list) => {
    if (list?.id) byId.set(list.id, list)
  })
  return [...byId.values()]
}

export function upsertCarryList(memory, nextList) {
  const packingLists = Array.isArray(memory.packingLists) ? memory.packingLists : []
  const checklists = Array.isArray(memory.checklists) ? memory.checklists : []
  const inPacking = packingLists.some((list) => list.id === nextList.id)
  const inChecklists = checklists.some((list) => list.id === nextList.id)

  return {
    ...memory,
    packingLists: inPacking
      ? packingLists.map((list) => (list.id === nextList.id ? nextList : list))
      : inChecklists
        ? packingLists
        : [...packingLists, nextList],
    checklists: inChecklists
      ? checklists.map((list) => (list.id === nextList.id ? nextList : list))
      : checklists,
  }
}

export function getDefaultCarryList(memory) {
  const fromChecklists = (memory.checklists || []).find((list) => list?.kind === 'carry')
  if (fromChecklists) return fromChecklists

  const merged = collectCarryLists(memory)
  return merged.find((list) => list.contextId === 'everyday')
    || merged[0]
    || createChecklist({ items: defaultCarryItems, kind: 'carry', title: 'Att ta med' })
}

export function getTravelCarryList(memory) {
  return collectCarryLists(memory).find((list) => list.contextId === 'travel')
    || createChecklist({
      contextId: 'travel',
      items: defaultTravelItems,
      kind: 'carry',
      title: 'Resa',
    })
}
