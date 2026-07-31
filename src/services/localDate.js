const localDatePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

export function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  }

  if (localDatePattern.test(String(value))) {
    return parseLocalDate(String(value))
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function getLocalDateString(value = new Date()) {
  const date = parseDateValue(value)

  if (!date) return ''

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function parseLocalDate(dateText) {
  if (!localDatePattern.test(String(dateText || ''))) return null

  const [year, month, day] = String(dateText).split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return Number.isNaN(date.getTime()) ? null : date
}

export function addLocalDays(value, amount) {
  const date = parseLocalDate(getLocalDateString(value))
  if (!date) return null

  const next = new Date(date)
  next.setDate(next.getDate() + amount)

  return next
}

export function getLocalCalendarDayDiff(first, second) {
  const firstDate = parseLocalDate(getLocalDateString(first))
  const secondDate = parseLocalDate(getLocalDateString(second))

  if (!firstDate || !secondDate) return null

  const firstUtc = Date.UTC(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate())
  const secondUtc = Date.UTC(secondDate.getFullYear(), secondDate.getMonth(), secondDate.getDate())

  return Math.round((secondUtc - firstUtc) / 86400000)
}

export function getLocalDateRange(days, today = new Date()) {
  const endDate = parseLocalDate(getLocalDateString(today))
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : null
  const startDate = safeDays ? addLocalDays(endDate, -safeDays + 1) : null

  return {
    days: safeDays,
    end: getLocalDateString(endDate),
    start: startDate ? getLocalDateString(startDate) : '',
  }
}

function normalizeTime(time) {
  const match = String(time || '').match(timePattern)
  if (!match) return ''

  const hour = Math.max(0, Math.min(Number(match[1]), 23))
  const minute = Math.max(0, Math.min(Number(match[2]), 59))
  const second = Math.max(0, Math.min(Number(match[3] || 0), 59))

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

export function getEntryDateTime(entry = {}) {
  if (!entry || typeof entry !== 'object') return null

  const dateText = String(entry.date || '')
  const timeText = normalizeTime(entry.time)

  if (dateText.includes('T') && !timeText) {
    return parseDateValue(dateText)
  }

  if (localDatePattern.test(dateText.slice(0, 10))) {
    return parseDateValue(`${dateText.slice(0, 10)}T${timeText || '12:00:00'}`)
  }

  return parseDateValue(entry.updatedAt || entry.createdAt || entry.timestamp || entry.time)
}

export function getEntryLocalDate(entry = {}) {
  if (!entry || typeof entry !== 'object') return ''

  const dateText = String(entry.date || '')

  if (dateText.includes('T')) {
    return getLocalDateString(parseDateValue(dateText))
  }

  if (localDatePattern.test(dateText.slice(0, 10))) {
    return dateText.slice(0, 10)
  }

  return getLocalDateString(parseDateValue(entry.createdAt || entry.timestamp || entry.updatedAt || entry.time))
}

export function getEntrySortTime(entry = {}) {
  const updated = parseDateValue(entry?.updatedAt)
  if (updated) return updated.getTime()

  const created = parseDateValue(entry?.createdAt)
  const dateTime = getEntryDateTime(entry)

  return (dateTime || created)?.getTime() || 0
}

export function isFutureLocalDate(dateText, today = new Date()) {
  const date = typeof dateText === 'string' ? dateText : getLocalDateString(dateText)
  const todayDate = getLocalDateString(today)

  return Boolean(date && todayDate && date > todayDate)
}

export function isSameLocalDate(first, second = new Date()) {
  return getLocalDateString(first) === getLocalDateString(second)
}

export function isEntryOnLocalDate(entry, date = new Date()) {
  const target = typeof date === 'string' ? date.slice(0, 10) : getLocalDateString(date)

  return Boolean(target && getEntryLocalDate(entry) === target)
}

export function isLocalDateInRange(dateText, range = {}) {
  if (!dateText) return false
  if (range.start && dateText < range.start) return false
  if (range.end && dateText > range.end) return false
  return true
}

export function latestEntryPerLocalDate(entries = []) {
  const groups = new Map()

  ;(Array.isArray(entries) ? entries : []).forEach((entry) => {
    const date = getEntryLocalDate(entry)
    if (!date) return

    const current = groups.get(date)
    if (!current || getEntrySortTime(entry) >= getEntrySortTime(current)) {
      groups.set(date, entry)
    }
  })

  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second, 'sv-SE'))
    .map(([date, entry]) => ({ date, entry }))
}

export function filterEntriesThroughLocalToday(entries = [], today = new Date()) {
  const todayDate = getLocalDateString(today)

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const date = getEntryLocalDate(entry)

    return date && date <= todayDate
  })
}
