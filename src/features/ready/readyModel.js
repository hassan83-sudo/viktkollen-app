export const readySchemaVersion = 1
export const readyStorageKey = 'viktkollen.ready.v1'

export const readyLevels = Object.freeze([
  { id: 'preschool', labelKey: 'levels.preschool' },
  { id: 'f3', labelKey: 'levels.f3' },
  { id: 'mid46', labelKey: 'levels.mid46' },
  { id: 'mid79', labelKey: 'levels.mid79' },
  { id: 'highschool', labelKey: 'levels.highschool' },
])

const readyLevelIds = new Set(readyLevels.map((level) => level.id))

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function asTrimmed(value) {
  return String(value || '').trim()
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return null
  const days = [...new Set(value.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
  return days.length ? days.sort((a, b) => a - b) : null
}

export function createReadyItem({
  label = '',
  icon = 'backpack',
  note = '',
  weekdays = null,
  done = false,
  id = '',
} = {}) {
  const text = asTrimmed(label)
  if (!text) return null
  const now = new Date().toISOString()
  return {
    createdAt: now,
    done: Boolean(done),
    icon: asTrimmed(icon) || 'backpack',
    id: asTrimmed(id) || createId('ready-item'),
    label: text,
    note: asTrimmed(note),
    updatedAt: now,
    weekdays: normalizeWeekdays(weekdays),
  }
}

export function normalizeReadyItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return createReadyItem({
    done: raw.done,
    icon: raw.icon,
    id: raw.id,
    label: raw.label,
    note: raw.note,
    weekdays: raw.weekdays,
  })
}

export function createEmptyReadyState(overrides = {}) {
  return normalizeReadyState({
    avatarId: 'nova',
    demoMode: false,
    eyeConsent: false,
    items: [],
    levelId: null,
    personality: 'calm',
    pronouns: '',
    schemaVersion: readySchemaVersion,
    ...overrides,
  })
}

export function normalizeReadyState(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const levelId = readyLevelIds.has(source.levelId) ? source.levelId : null
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeReadyItem).filter(Boolean)
    : []

  return {
    avatarId: asTrimmed(source.avatarId) || 'nova',
    deletedAt: typeof source.deletedAt === 'string' ? source.deletedAt : null,
    demoMode: Boolean(source.demoMode),
    eyeConsent: Boolean(source.eyeConsent),
    items,
    levelId,
    personality: asTrimmed(source.personality) || 'calm',
    pronouns: asTrimmed(source.pronouns),
    schemaVersion: readySchemaVersion,
  }
}

/** Example templates for empty-state help only — never auto-inserted as real user data. */
export function getExampleItemsForLevel(levelId) {
  const catalog = {
    preschool: [
      { icon: 'clothes', label: 'Kläder' },
      { icon: 'extra', label: 'Extrakläder' },
      { icon: 'toy', label: 'Gosedjur' },
    ],
    f3: [
      { icon: 'backpack', label: 'Ryggsäck' },
      { icon: 'lunch', label: 'Matsäck' },
      { icon: 'water', label: 'Vattenflaska' },
    ],
    mid46: [
      { icon: 'backpack', label: 'Ryggsäck' },
      { icon: 'laptop', label: 'Dator + laddare' },
      { icon: 'gym', label: 'Gympakläder' },
    ],
    mid79: [
      { icon: 'backpack', label: 'Ryggsäck' },
      { icon: 'laptop', label: 'Dator + laddare' },
      { icon: 'gym', label: 'Gympakläder' },
      { icon: 'glasses', label: 'Glasögon' },
      { icon: 'book', label: 'Matteboken' },
    ],
    highschool: [
      { icon: 'laptop', label: 'Dator + laddare' },
      { icon: 'book', label: 'Kursböcker' },
      { icon: 'notes', label: 'Anteckningar' },
    ],
  }
  return (catalog[levelId] || catalog.mid79).map((item) => ({ ...item, example: true }))
}

export function extractForgotItemLabel(text) {
  const raw = asTrimmed(text)
  if (!raw) return ''

  const patterns = [
    /^jag\s+glömde\s+(?:bort\s+)?(?:min\s+|mitt\s+|mina\s+)?(.+?)[.!?]*$/iu,
    /^glömde\s+(?:bort\s+)?(?:min\s+|mitt\s+|mina\s+)?(.+?)[.!?]*$/iu,
    /^i\s+forgot\s+(?:my\s+)?(.+?)[.!?]*$/iu,
  ]

  for (const pattern of patterns) {
    const match = raw.match(pattern)
    if (match?.[1]) {
      const label = asTrimmed(match[1]).replace(/[.!?]+$/u, '')
      if (!label) return ''
      return label.charAt(0).toLocaleUpperCase('sv-SE') + label.slice(1)
    }
  }

  return raw.replace(/[.!?]+$/u, '')
}

export function toggleItemDone(state, itemId) {
  const next = normalizeReadyState(state)
  return {
    ...next,
    items: next.items.map((item) => (
      item.id === itemId
        ? { ...item, done: !item.done, updatedAt: new Date().toISOString() }
        : item
    )),
  }
}

export function addItem(state, itemInput) {
  const item = createReadyItem(itemInput)
  if (!item) return normalizeReadyState(state)
  const next = normalizeReadyState(state)
  return { ...next, items: [...next.items, item] }
}

export function updateItem(state, itemId, patch = {}) {
  const next = normalizeReadyState(state)
  return {
    ...next,
    items: next.items.map((item) => {
      if (item.id !== itemId) return item
      return {
        ...item,
        icon: patch.icon !== undefined ? asTrimmed(patch.icon) || item.icon : item.icon,
        label: patch.label !== undefined ? asTrimmed(patch.label) || item.label : item.label,
        note: patch.note !== undefined ? asTrimmed(patch.note) : item.note,
        updatedAt: new Date().toISOString(),
        weekdays: patch.weekdays !== undefined ? normalizeWeekdays(patch.weekdays) : item.weekdays,
      }
    }),
  }
}

export function removeItem(state, itemId) {
  const next = normalizeReadyState(state)
  return {
    ...next,
    items: next.items.filter((item) => item.id !== itemId),
  }
}

export function clearReadyData(state = {}) {
  return createEmptyReadyState({
    deletedAt: new Date().toISOString(),
    levelId: normalizeReadyState(state).levelId,
  })
}

export function getChecklistProgress(items = []) {
  const list = Array.isArray(items) ? items : []
  const total = list.length
  const done = list.filter((item) => item?.done).length
  return { done, total }
}

export function isReadyLevelId(value) {
  return readyLevelIds.has(value)
}
