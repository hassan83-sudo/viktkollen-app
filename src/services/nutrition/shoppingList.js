import { getMealPlanWeekStart, normalizeMealPlanWeek } from './mealPlanner.js'

export const shoppingListsStorageKey = 'viktkollen.shoppingLists'
export const shoppingCategories = [
  'Frukt och grönt',
  'Kött och fisk',
  'Mejeri och ägg',
  'Bröd och spannmål',
  'Skafferi',
  'Fryst',
  'Dryck',
  'Övrigt',
]

const supportedUnits = ['g', 'kg', 'ml', 'l', 'st', 'paket']

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function normalizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function createId(prefix = 'shopping-item', seed = Date.now()) {
  return `${prefix}-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeQuantity(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeUnit(value) {
  const unit = normalizeText(value, 20).toLocaleLowerCase('sv-SE')
  return supportedUnits.includes(unit) ? unit : ''
}

function normalizeComparableUnit(quantity, unit) {
  if (unit === 'kg') return { quantity: quantity * 1000, unit: 'g' }
  if (unit === 'l') return { quantity: quantity * 1000, unit: 'ml' }
  return { quantity, unit }
}

function parseIngredientLine(line) {
  const text = normalizeText(line, 200)
  if (!text) return null

  const match = text.match(/^(\d+(?:[,.]\d+)?)\s*(kg|g|ml|l|st|paket)\s+(.+)$/i) ||
    text.match(/^(\d+(?:[,.]\d+)?)\s+(.+)$/i)
  const quantity = match ? normalizeQuantity(match[1]) : null
  const unit = match?.[3] ? normalizeUnit(match[2]) : match ? 'st' : ''
  const name = normalizeText(match?.[3] || match?.[2] || text)

  if (!name) return null

  return {
    name,
    quantity,
    unit,
  }
}

function itemKey(item) {
  const quantityUnit = item.quantity !== null && item.unit
    ? normalizeComparableUnit(item.quantity, item.unit).unit
    : item.unit || ''

  return `${item.name.toLocaleLowerCase('sv-SE')}|${quantityUnit}`
}

export function categorizeShoppingListItem(item = {}) {
  const name = normalizeText(item.name).toLocaleLowerCase('sv-SE')
  const explicit = shoppingCategories.find((category) => category === item.category)
  if (explicit) return explicit

  if (/(broccoli|morot|tomat|gurka|potatis|äpple|apple|banan|apelsin|avokado|sallad|lök|lok|frukt|bär|bar)/.test(name)) return 'Frukt och grönt'
  if (/(kyckling|nötkött|notkott|fläsk|flask|lax|torsk|tonfisk|fisk|kött|kott)/.test(name)) return 'Kött och fisk'
  if (/(mjölk|mjolk|ost|kvarg|keso|yoghurt|ägg|agg)/.test(name)) return 'Mejeri och ägg'
  if (/(bröd|brod|pasta|ris|havregryn|spannmål|spannmal|wrap|tortilla)/.test(name)) return 'Bröd och spannmål'
  if (/(läsk|lask|juice|vatten|dryck|kaffe|te)/.test(name)) return 'Dryck'
  if (/(fryst|glass)/.test(name)) return 'Fryst'
  if (/(olja|bönor|bonor|linser|krydda|salt|sås|sas|konserv|mjöl|mjol)/.test(name)) return 'Skafferi'

  return 'Övrigt'
}

export function normalizeShoppingListItem(item = {}, options = {}) {
  if (!isObject(item)) return null

  const parsed = item.name && item.quantity === undefined && item.unit === undefined
    ? parseIngredientLine(item.name)
    : null
  const name = normalizeText(parsed?.name || item.name)
  if (!name) return null

  const quantity = normalizeQuantity(item.quantity ?? parsed?.quantity)
  const unit = normalizeUnit(item.unit ?? parsed?.unit)
  const normalized = quantity !== null && unit ? normalizeComparableUnit(quantity, unit) : { quantity, unit }
  const sourceIds = Array.isArray(item.sourcePlannedMealIds)
    ? [...new Set(item.sourcePlannedMealIds.map((id) => normalizeText(id)).filter(Boolean))]
    : options.sourcePlannedMealId
      ? [normalizeText(options.sourcePlannedMealId)]
      : []

  return {
    category: categorizeShoppingListItem({ ...item, name }),
    checked: Boolean(item.checked),
    id: normalizeText(item.id, 120) || createId('shopping-item', options.now || Date.now()),
    manual: Boolean(item.manual),
    name,
    quantity: normalized.quantity,
    sourcePlannedMealIds: sourceIds,
    unit: normalized.unit,
  }
}

export function mergeShoppingListItems(items = [], previousItems = []) {
  const previousByKey = new Map((Array.isArray(previousItems) ? previousItems : [])
    .map(normalizeShoppingListItem)
    .filter(Boolean)
    .map((item) => [itemKey(item), item]))
  const merged = new Map()

  ;(Array.isArray(items) ? items : [])
    .map(normalizeShoppingListItem)
    .filter(Boolean)
    .forEach((item) => {
      const key = itemKey(item)
      const existing = merged.get(key)
      const previous = previousByKey.get(key)

      if (!existing) {
        merged.set(key, {
          ...item,
          checked: previous?.checked || item.checked,
          id: previous?.id || item.id,
          sourcePlannedMealIds: [...new Set([...(item.sourcePlannedMealIds || []), ...(previous?.manual ? previous.sourcePlannedMealIds || [] : [])])],
        })
        return
      }

      const canAdd = existing.unit === item.unit && existing.quantity !== null && item.quantity !== null
      merged.set(key, {
        ...existing,
        checked: existing.checked || item.checked,
        quantity: canAdd ? existing.quantity + item.quantity : existing.quantity,
        sourcePlannedMealIds: [...new Set([...(existing.sourcePlannedMealIds || []), ...(item.sourcePlannedMealIds || [])])],
      })
    })

  return [...merged.values()].sort((first, second) =>
    first.category.localeCompare(second.category, 'sv-SE') || first.name.localeCompare(second.name, 'sv-SE'))
}

export function categorizeShoppingListItems(items = []) {
  return shoppingCategories
    .map((category) => ({
      category,
      items: (Array.isArray(items) ? items : []).map(normalizeShoppingListItem).filter(Boolean).filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0)
}

export function normalizeShoppingList(list = {}, weekStart = getMealPlanWeekStart()) {
  const start = getMealPlanWeekStart(list.weekStart || weekStart)
  const now = new Date().toISOString()

  return {
    generatedAt: new Date(list.generatedAt || now).toString() === 'Invalid Date' ? now : new Date(list.generatedAt || now).toISOString(),
    items: mergeShoppingListItems(Array.isArray(list.items) ? list.items : []),
    updatedAt: new Date(list.updatedAt || list.generatedAt || now).toString() === 'Invalid Date' ? now : new Date(list.updatedAt || list.generatedAt || now).toISOString(),
    weekStart: start,
  }
}

export function normalizeShoppingLists(value = {}) {
  const sourceLists = isObject(value?.weeks) ? value.weeks : {}
  const weeks = {}

  Object.entries(sourceLists).forEach(([key, list]) => {
    const normalized = normalizeShoppingList(list, key)
    weeks[normalized.weekStart] = normalized
  })

  return { weeks }
}

export function readShoppingLists(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalizeShoppingLists()

  try {
    return normalizeShoppingLists(JSON.parse(resolvedStorage.getItem(shoppingListsStorageKey) || '{}'))
  } catch {
    return normalizeShoppingLists()
  }
}

export function writeShoppingLists(lists, storage) {
  const normalized = normalizeShoppingLists(lists)
  const resolvedStorage = getStorage(storage)

  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(shoppingListsStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function getShoppingList(lists = {}, weekStart = getMealPlanWeekStart()) {
  const normalized = normalizeShoppingLists(lists)
  const start = getMealPlanWeekStart(weekStart)
  return normalized.weeks[start] || normalizeShoppingList({ weekStart: start }, start)
}

export function buildShoppingListFromMealPlan(week = {}, previousList = null, now = new Date().toISOString()) {
  const normalizedWeek = normalizeMealPlanWeek(week)
  const plannedItems = Object.values(normalizedWeek.days)
    .flat()
    .flatMap((meal) => (meal.ingredients || []).map((ingredient) => ({
      ...parseIngredientLine(ingredient),
      id: '',
      manual: false,
      sourcePlannedMealIds: [meal.id],
    })))
    .filter((item) => item.name)
  const manualItems = (previousList?.items || [])
    .map(normalizeShoppingListItem)
    .filter((item) => item?.manual)
  const merged = mergeShoppingListItems([...plannedItems, ...manualItems], previousList?.items || [])

  return normalizeShoppingList({
    generatedAt: previousList?.generatedAt || now,
    items: merged,
    updatedAt: now,
    weekStart: normalizedWeek.weekStart,
  }, normalizedWeek.weekStart)
}

export function updateShoppingListFromMealPlan(lists = {}, week = {}, now = new Date().toISOString()) {
  const normalizedLists = normalizeShoppingLists(lists)
  const previous = getShoppingList(normalizedLists, week.weekStart)
  const next = buildShoppingListFromMealPlan(week, previous, now)
  const previousKeys = new Set(previous.items.filter((item) => !item.manual).map(itemKey))
  const nextKeys = new Set(next.items.filter((item) => !item.manual).map(itemKey))
  const added = [...nextKeys].filter((key) => !previousKeys.has(key)).length
  const removed = [...previousKeys].filter((key) => !nextKeys.has(key)).length

  return {
    lists: normalizeShoppingLists({
      ...normalizedLists,
      weeks: {
        ...normalizedLists.weeks,
        [next.weekStart]: next,
      },
    }),
    list: next,
    summary: `${added} varor lades till och ${removed} togs bort.`,
  }
}

export function toggleShoppingListItem(list = {}, itemId, checked = null, now = new Date().toISOString()) {
  const normalized = normalizeShoppingList(list)
  return normalizeShoppingList({
    ...normalized,
    items: normalized.items.map((item) => item.id === itemId ? { ...item, checked: checked === null ? !item.checked : Boolean(checked) } : item),
    updatedAt: now,
  }, normalized.weekStart)
}

export function addManualShoppingListItem(list = {}, item = {}, now = new Date().toISOString()) {
  const normalized = normalizeShoppingList(list)
  const nextItem = normalizeShoppingListItem({ ...item, manual: true }, { now })
  if (!nextItem) return normalized

  return normalizeShoppingList({
    ...normalized,
    items: mergeShoppingListItems([...normalized.items, nextItem], normalized.items),
    updatedAt: now,
  }, normalized.weekStart)
}

export function removeShoppingListItem(list = {}, itemId, now = new Date().toISOString()) {
  const normalized = normalizeShoppingList(list)
  return normalizeShoppingList({
    ...normalized,
    items: normalized.items.filter((item) => item.id !== itemId),
    updatedAt: now,
  }, normalized.weekStart)
}

export function clearCheckedShoppingListItems(list = {}, now = new Date().toISOString()) {
  const normalized = normalizeShoppingList(list)
  return normalizeShoppingList({
    ...normalized,
    items: normalized.items.filter((item) => !item.checked),
    updatedAt: now,
  }, normalized.weekStart)
}

export function clearShoppingListWeek(lists = {}, weekStart = getMealPlanWeekStart(), now = new Date().toISOString()) {
  const normalized = normalizeShoppingLists(lists)
  const start = getMealPlanWeekStart(weekStart)

  return normalizeShoppingLists({
    ...normalized,
    weeks: {
      ...normalized.weeks,
      [start]: normalizeShoppingList({ generatedAt: now, items: [], updatedAt: now, weekStart: start }, start),
    },
  })
}

export function formatShoppingListForClipboard(list = {}) {
  const normalized = normalizeShoppingList(list)
  const groups = categorizeShoppingListItems(normalized.items)
  const week = normalized.weekStart
  const lines = [`Inköpslista vecka ${week}`]

  groups.forEach((group) => {
    lines.push('', group.category)
    group.items.forEach((item) => {
      const quantity = item.quantity !== null && item.unit ? ` – ${item.quantity.toLocaleString('sv-SE')} ${item.unit}` : ''
      lines.push(`[${item.checked ? 'x' : ' '}] ${item.name}${quantity}`)
    })
  })

  return lines.join('\n')
}

export const shoppingListInternals = {
  itemKey,
  parseIngredientLine,
}
