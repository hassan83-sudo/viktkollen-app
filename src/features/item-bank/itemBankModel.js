import { itemBankCatalog, itemBankCategories } from './itemBankCatalog.js'
import { isSlideshowSpeedId } from './slideshow.js'

export const itemBankStateVersion = 1
export const customItemCategory = 'custom'
export const maxCustomItems = 200
export const maxCustomLabelLength = 40

// AI-Ögat har ännu ingen verklig bildanalys av föremål. Flaggan finns så att
// UI:t aldrig visar "AI har sett" förrän en riktig visionmodell är kopplad.
export const itemBankVisionReady = false

// Tre tydligt skilda nivåer. "selected" = användaren har valt saken,
// "carried" = användaren har själv markerat att den är med,
// "ai-verified" = en verklig bildanalys har bekräftat saken.
export const itemStatuses = Object.freeze({
  aiVerified: 'ai-verified',
  carried: 'carried',
  notSelected: 'not-selected',
  selected: 'selected',
})

export const itemStatusLabels = Object.freeze({
  [itemStatuses.aiVerified]: 'AI-verifierad',
  [itemStatuses.carried]: 'Medtagen',
  [itemStatuses.notSelected]: 'Ej vald',
  [itemStatuses.selected]: 'Vald',
})

export const visionAnalysisSource = 'vision-model'

export function createEmptyItemBankState() {
  return {
    customItems: [],
    selectedIds: [],
    speed: 'normal',
    status: {},
    version: itemBankStateVersion,
  }
}

export function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('sv-SE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxCustomLabelLength)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isRealVisionVerification(value) {
  return isPlainObject(value)
    && value.source === visionAnalysisSource
    && typeof value.analysisId === 'string'
    && value.analysisId.trim().length > 0
    && typeof value.confidence === 'number'
    && value.confidence >= 0
    && value.confidence <= 1
    && typeof value.verifiedAt === 'string'
    && value.verifiedAt.length > 0
}

function normalizeCustomItem(value) {
  if (!isPlainObject(value)) return null
  const label = cleanLabel(value.label)
  const id = String(value.id || '')
  if (!label || !id.startsWith('custom-')) return null
  return {
    category: customItemCategory,
    custom: true,
    icon: typeof value.icon === 'string' && value.icon.trim() ? value.icon.trim().slice(0, 8) : '📦',
    id,
    keywords: '',
    label,
  }
}

export function normalizeItemBankState(value) {
  const empty = createEmptyItemBankState()
  if (!isPlainObject(value)) return empty

  const customItems = []
  const customIds = new Set()
  for (const raw of Array.isArray(value.customItems) ? value.customItems : []) {
    const item = normalizeCustomItem(raw)
    if (item && !customIds.has(item.id) && customItems.length < maxCustomItems) {
      customIds.add(item.id)
      customItems.push(item)
    }
  }

  const knownIds = new Set([...itemBankCatalog.map((item) => item.id), ...customIds])
  const selectedIds = [...new Set((Array.isArray(value.selectedIds) ? value.selectedIds : [])
    .map(String)
    .filter((id) => knownIds.has(id)))]

  const status = {}
  if (isPlainObject(value.status)) {
    for (const id of selectedIds) {
      const entry = value.status[id]
      if (!isPlainObject(entry)) continue
      const next = {}
      if (entry.carried === true) {
        next.carried = true
        next.carriedAt = typeof entry.carriedAt === 'string' ? entry.carriedAt : ''
      }
      if (isRealVisionVerification(entry.aiVerification)) next.aiVerification = { ...entry.aiVerification }
      if (Object.keys(next).length) status[id] = next
    }
  }

  return {
    customItems,
    selectedIds,
    speed: isSlideshowSpeedId(value.speed) ? value.speed : empty.speed,
    status,
    version: itemBankStateVersion,
  }
}

export function getAllItems(state) {
  return [...itemBankCatalog, ...(state?.customItems || [])]
}

export function getItemById(state, id) {
  return getAllItems(state).find((item) => item.id === id) || null
}

export function getCategoryOptions(state) {
  const options = [{ icon: '🗂️', id: 'all', label: 'Alla' }, ...itemBankCategories]
  if (state?.customItems?.length) options.push({ icon: '📦', id: customItemCategory, label: 'Egna' })
  return options
}

export function searchItems(state, { category = 'all', query = '' } = {}) {
  const needle = normalizeSearchText(query)
  return getAllItems(state).filter((item) => {
    if (category !== 'all' && item.category !== category) return false
    if (!needle) return true
    return normalizeSearchText(`${item.label} ${item.keywords}`).includes(needle)
  })
}

export function isSelected(state, id) {
  return Boolean(state?.selectedIds?.includes(id))
}

export function toggleSelected(state, id) {
  if (!getItemById(state, id)) return state
  if (isSelected(state, id)) {
    const status = { ...state.status }
    delete status[id]
    return { ...state, selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id), status }
  }
  return { ...state, selectedIds: [...state.selectedIds, id] }
}

export function addCustomItem(state, { icon = '📦', label } = {}, now = Date.now()) {
  const cleaned = cleanLabel(label)
  if (!cleaned) return { error: 'Skriv ett namn på saken.', state }
  if (state.customItems.length >= maxCustomItems) return { error: 'Du har nått maxantalet egna saker.', state }

  const needle = normalizeSearchText(cleaned)
  const existing = getAllItems(state).find((item) => normalizeSearchText(item.label) === needle)
  if (existing) {
    return {
      error: '',
      item: existing,
      state: isSelected(state, existing.id) ? state : { ...state, selectedIds: [...state.selectedIds, existing.id] },
    }
  }

  const item = normalizeCustomItem({ icon, id: `custom-${now.toString(36)}-${state.customItems.length}`, label: cleaned })
  return {
    error: '',
    item,
    state: {
      ...state,
      customItems: [...state.customItems, item],
      selectedIds: [...state.selectedIds, item.id],
    },
  }
}

export function removeCustomItem(state, id) {
  if (!state.customItems.some((item) => item.id === id)) return state
  const status = { ...state.status }
  delete status[id]
  return {
    ...state,
    customItems: state.customItems.filter((item) => item.id !== id),
    selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    status,
  }
}

export function getSelectedItems(state) {
  return state.selectedIds.map((id) => getItemById(state, id)).filter(Boolean)
}

export function getItemStatus(state, id) {
  if (!isSelected(state, id)) return itemStatuses.notSelected
  const entry = state.status?.[id] || {}
  if (isRealVisionVerification(entry.aiVerification)) return itemStatuses.aiVerified
  if (entry.carried) return itemStatuses.carried
  return itemStatuses.selected
}

// Användarens egen markering. Påverkar aldrig AI-verifiering.
export function setCarried(state, id, carried, now = new Date().toISOString()) {
  if (!isSelected(state, id)) return state
  const entry = { ...(state.status[id] || {}) }
  if (carried) {
    entry.carried = true
    entry.carriedAt = now
  } else {
    delete entry.carried
    delete entry.carriedAt
  }
  const status = { ...state.status }
  if (Object.keys(entry).length) status[id] = entry
  else delete status[id]
  return { ...state, status }
}

export function resetCarried(state) {
  const status = {}
  for (const [id, entry] of Object.entries(state.status)) {
    if (entry.aiVerification) status[id] = { aiVerification: entry.aiVerification }
  }
  return { ...state, status }
}

// Framtida liveanalys: endast ett verkligt analysresultat från en visionmodell
// får markera en sak som AI-verifierad. Allt annat avvisas.
export function applyVisionVerification(state, id, analysis) {
  if (!isSelected(state, id) || !isRealVisionVerification(analysis)) return state
  return {
    ...state,
    status: {
      ...state.status,
      [id]: { ...(state.status[id] || {}), aiVerification: { ...analysis } },
    },
  }
}

export function summarizeStatuses(state) {
  const summary = { [itemStatuses.aiVerified]: 0, [itemStatuses.carried]: 0, [itemStatuses.selected]: 0 }
  for (const id of state.selectedIds) summary[getItemStatus(state, id)] += 1
  return summary
}
