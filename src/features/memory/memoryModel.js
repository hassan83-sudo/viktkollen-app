export const memoryContexts = Object.freeze([
  { id: 'work', label: 'Jobb' },
  { id: 'school', label: 'Skola' },
  { id: 'training', label: 'Träning' },
  { id: 'party', label: 'Fest' },
  { id: 'travel', label: 'Resa' },
  { id: 'everyday', label: 'Vanlig dag' },
  { id: 'custom', label: 'Egen lista' },
])

export const defaultTodoItems = Object.freeze([
  'Deodorant',
  'Borsta tänderna',
  'Munskölj/munspray',
  'Kontrollera ansiktet',
  'Fixa håret',
])

export const defaultCarryItems = Object.freeze([
  'Mobil',
  'Nycklar',
  'Plånbok',
  'Servetter',
  'Vatten',
  'Hörlurar',
])

export const memoryTrainingMethods = Object.freeze([
  { id: 'checklists', title: 'Checklistor', body: 'Skriv ner vad som ska göras och vad som ska följa med. Bocka av i samma ordning varje gång.' },
  { id: 'chunking', title: 'Chunking', body: 'Gruppera saker: mobil–nycklar–plånbok som ett paket, hygien som ett annat.' },
  { id: 'visualization', title: 'Visualisering', body: 'Föreställ dig föremålen på en rad vid dörren innan du går.' },
  { id: 'association', title: 'Associationer', body: 'Koppla varje sak till en handling, till exempel nycklar när du tar på jackan.' },
  { id: 'palace', title: 'Platsmetoden', body: 'Lägg varje sak på en fast plats i hemmet och gå samma rutt i huvudet.' },
  { id: 'spaced', title: 'Repetition med mellanrum', body: 'Öva listan, göm den och återkalla den senare samma dag.' },
  { id: 'homes', title: 'Fasta platser', body: 'Ge viktiga föremål en enda hemplats, till exempel nycklar i hallskålen.' },
  { id: 'triple', title: 'Mobil–nycklar–plånbok', body: 'Gör de tre sakerna till en fast rutin innan dörren öppnas.' },
  { id: 'recall', title: 'Aktiv återkallning', body: 'Försök komma ihåg listan utan att titta. Jämför sedan med originalet.' },
])

export function getMemoryContext(id) {
  return memoryContexts.find((context) => context.id === id) || memoryContexts[5]
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createChecklistItem(label, { done = false } = {}) {
  const text = String(label || '').trim()
  if (!text) return null
  return {
    done: Boolean(done),
    id: createId('item'),
    label: text,
  }
}

export function createChecklist({
  contextId = 'everyday',
  items = [],
  kind = 'carry',
  title = '',
} = {}) {
  const context = getMemoryContext(contextId)
  const nextItems = items
    .map((item) => (typeof item === 'string' ? createChecklistItem(item) : createChecklistItem(item?.label, { done: item?.done })))
    .filter(Boolean)

  return {
    contextId: context.id,
    id: createId('list'),
    items: nextItems,
    kind: kind === 'todo' ? 'todo' : 'carry',
    title: String(title || '').trim() || `${context.label} · ${kind === 'todo' ? 'Att göra' : 'Att ta med'}`,
    updatedAt: new Date().toISOString(),
  }
}

export function getDefaultChecklistTemplates() {
  return [
    createChecklist({
      contextId: 'everyday',
      items: defaultTodoItems,
      kind: 'todo',
      title: 'Att göra innan jag går ut',
    }),
    createChecklist({
      contextId: 'everyday',
      items: defaultCarryItems,
      kind: 'carry',
      title: 'Att ta med',
    }),
    createChecklist({
      contextId: 'training',
      items: ['Vatten', 'Träningsskor', 'Hörlurar'],
      kind: 'carry',
      title: 'Träning',
    }),
    createChecklist({
      contextId: 'work',
      items: ['Nycklar', 'Plånbok', 'Lunch', 'Passerkort'],
      kind: 'carry',
      title: 'Jobb',
    }),
    createChecklist({
      contextId: 'travel',
      items: ['Pass/ID', 'Laddare', 'Hörlurar', 'Mediciner', 'Ombyte'],
      kind: 'carry',
      title: 'Resa',
    }),
  ]
}

export function createItemLocation({ itemLabel = '', placeLabel = '' } = {}) {
  const item = String(itemLabel || '').trim()
  const place = String(placeLabel || '').trim()
  if (!item || !place) return null
  return {
    id: createId('place'),
    itemLabel: item,
    placeLabel: place,
    updatedAt: new Date().toISOString(),
  }
}

export function findItemLocation(locations = [], query = '') {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return null
  return locations.find((entry) => {
    const label = String(entry?.itemLabel || '').toLowerCase()
    return label === needle || label.includes(needle) || needle.includes(label)
  }) || null
}

export function formatLocationAnswer(entry, query = '') {
  if (!entry) {
    return `Jag har ingen sparad plats för ${String(query || 'det föremålet').trim() || 'det föremålet'}.`
  }
  return `${entry.itemLabel} → ${entry.placeLabel}`
}

export function createRoutine({ contextId = 'everyday', items = [], title = '', weatherTag = '' } = {}) {
  const context = getMemoryContext(contextId)
  return {
    contextId: context.id,
    id: createId('routine'),
    items: items.map((item) => String(item || '').trim()).filter(Boolean),
    title: String(title || '').trim() || context.label,
    updatedAt: new Date().toISOString(),
    weatherTag: String(weatherTag || '').trim(),
  }
}

export function getDefaultRoutines() {
  return [
    createRoutine({ contextId: 'training', items: ['Vatten', 'Träningsskor', 'Hörlurar'], title: 'Träning' }),
    createRoutine({ contextId: 'work', items: ['Nycklar', 'Plånbok', 'Lunch', 'Passerkort'], title: 'Jobb' }),
    createRoutine({
      contextId: 'everyday',
      items: ['Paraply/regnjacka'],
      title: 'Regn',
      weatherTag: 'rain',
    }),
    createRoutine({
      contextId: 'everyday',
      items: ['Solglasögon'],
      title: 'Sol',
      weatherTag: 'sun',
    }),
  ]
}

export const emptyMemoryState = Object.freeze({
  checklists: [],
  locations: [],
  packingLists: [],
  routines: [],
  version: 1,
})

export function normalizeMemoryState(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    checklists: Array.isArray(source.checklists) ? source.checklists : [],
    locations: Array.isArray(source.locations) ? source.locations : [],
    packingLists: Array.isArray(source.packingLists) ? source.packingLists : [],
    routines: Array.isArray(source.routines) ? source.routines : [],
    version: 1,
  }
}
