import {
  addLocalDays,
  getEntryLocalDate,
  getLocalCalendarDayDiff,
  getLocalDateString,
  parseLocalDate,
} from './localDate.js'

export const healthDashboardPeriodDefinitions = [
  { days: 7, id: '7d', label: '7 dagar' },
  { days: 30, id: '30d', label: '30 dagar' },
  { days: 90, id: '90d', label: '3 månader' },
  { days: 180, id: '180d', label: '6 månader' },
  { days: 365, id: '365d', label: '12 månader' },
  { days: null, id: 'all', label: 'Hela perioden' },
]

const bucketLimits = {
  day: 60,
  month: 36,
  week: 80,
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function getHealthDashboardPeriodDefinition(period = '30d') {
  return healthDashboardPeriodDefinitions.find((entry) => entry.id === period) || healthDashboardPeriodDefinitions[1]
}

function dateFromEntry(entry) {
  if (typeof entry === 'string') return getLocalDateString(entry)
  if (entry instanceof Date) return getLocalDateString(entry)
  if (!entry || typeof entry !== 'object') return ''

  return getEntryLocalDate(entry) || getLocalDateString(entry.date || entry.createdAt || entry.updatedAt || entry.timestamp)
}

export function collectAvailableDates(groups = {}) {
  return Object.values(groups)
    .flatMap((entries) => safeArray(entries))
    .map(dateFromEntry)
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second, 'sv-SE'))
}

function getEarliestDate(dates = [], fallbackEnd) {
  const valid = safeArray(dates)
    .map(dateFromEntry)
    .filter(Boolean)
    .filter((date) => !fallbackEnd || date <= fallbackEnd)
    .sort((first, second) => first.localeCompare(second, 'sv-SE'))

  return valid[0] || fallbackEnd
}

function getBucketStrategy({ days, id, availableDays }) {
  if (id === 'all') return availableDays > 240 ? 'month' : availableDays > 90 ? 'week' : 'day'
  if (days <= 30) return 'day'
  if (days <= 180) return 'week'
  return availableDays > 240 ? 'month' : 'week'
}

function formatPeriodLabel(period, start, end) {
  if (period.id === 'all') return `Hela perioden till ${end}`
  return `${period.label} till ${end}`
}

function buildPreviousRange({ days, start }) {
  if (!days || !start) return null
  const previousEnd = getLocalDateString(addLocalDays(start, -1))
  const previousStart = getLocalDateString(addLocalDays(previousEnd, -days + 1))

  return {
    days,
    end: previousEnd,
    start: previousStart,
  }
}

export function buildHealthDashboardPeriod(periodId = '30d', options = {}) {
  const period = getHealthDashboardPeriodDefinition(periodId)
  const end = getLocalDateString(options.analysisDate || new Date())
  const availableDates = collectAvailableDates(options.availableDates || {})
  const start = period.days
    ? getLocalDateString(addLocalDays(end, -period.days + 1))
    : getEarliestDate(availableDates, end)
  const dayCount = start && end ? (getLocalCalendarDayDiff(start, end) ?? 0) + 1 : 0
  const days = period.days || Math.max(1, dayCount)
  const previousPeriod = buildPreviousRange({ days: period.days, start })
  const bucketStrategy = getBucketStrategy({ availableDays: days, days, id: period.id })
  const expectedDataPoints = bucketStrategy === 'day'
    ? days
    : bucketStrategy === 'week'
      ? Math.ceil(days / 7)
      : Math.max(1, (parseLocalDate(end).getFullYear() - parseLocalDate(start).getFullYear()) * 12 + parseLocalDate(end).getMonth() - parseLocalDate(start).getMonth() + 1)

  return {
    bucketStrategy,
    calendarDays: days,
    comparisonLabel: previousPeriod ? `föregående ${period.label.toLocaleLowerCase('sv-SE')}` : 'ingen föregående jämförbar period',
    completedDays: Math.max(0, days - 1),
    days: period.days,
    end,
    expectedDataPoints,
    id: period.id,
    isPartialPeriod: Boolean(period.days && availableDates.some((date) => date >= start && date <= end) && availableDates.filter((date) => date >= start && date <= end).length < days),
    label: period.label,
    ongoingDay: end,
    periodLabel: formatPeriodLabel(period, start, end),
    previousEnd: previousPeriod?.end || '',
    previousPeriod,
    previousStart: previousPeriod?.start || '',
    start,
  }
}

function getBucketKey(date, strategy) {
  if (strategy === 'day') return date

  const parsed = parseLocalDate(date)
  if (!parsed) return date

  if (strategy === 'month') {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
  }

  const day = parsed.getDay() || 7
  const weekStart = getLocalDateString(addLocalDays(date, 1 - day))

  return weekStart
}

function getBucketEnd(key, strategy, rangeEnd) {
  if (strategy === 'day') return key
  if (strategy === 'month') {
    const start = parseLocalDate(`${key}-01`)
    const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    const end = getLocalDateString(addLocalDays(nextMonth, -1))

    return end > rangeEnd ? rangeEnd : end
  }

  const end = getLocalDateString(addLocalDays(key, 6))

  return end > rangeEnd ? rangeEnd : end
}

export function buildPeriodBuckets(period = {}) {
  if (!period.start || !period.end) return []

  const buckets = new Map()
  let cursor = period.start
  while (cursor <= period.end) {
    const key = getBucketKey(cursor, period.bucketStrategy)
    if (!buckets.has(key)) {
      buckets.set(key, {
        end: getBucketEnd(key, period.bucketStrategy, period.end),
        hasData: false,
        id: key,
        label: period.bucketStrategy === 'month' ? key : `${key} - ${getBucketEnd(key, period.bucketStrategy, period.end)}`,
        start: key,
        type: period.bucketStrategy,
      })
    }
    cursor = getLocalDateString(addLocalDays(cursor, 1))
  }

  return [...buckets.values()].slice(0, bucketLimits[period.bucketStrategy] || 80)
}

function average(values) {
  const valid = values.filter(Number.isFinite)
  if (!valid.length) return null

  return round(valid.reduce((sum, value) => sum + value, 0) / valid.length, 1)
}

function trendFromPoints(points = []) {
  const values = points.map((point) => point.value).filter(Number.isFinite)
  if (values.length < 2) return 'insufficient'
  const change = values.at(-1) - values[0]
  if (change < -0.1) return 'down'
  if (change > 0.1) return 'up'
  return 'stable'
}

export function buildTrendSeries({ aggregation = 'average', entries = [], getDate = (entry) => entry.date, getValue = (entry) => entry.value, id, label, period, unit = '' }) {
  const buckets = buildPeriodBuckets(period)
  const grouped = new Map(buckets.map((bucket) => [bucket.id, []]))

  safeArray(entries).forEach((entry) => {
    const date = getDate(entry)
    if (!date || date < period.start || date > period.end) return
    const bucketKey = getBucketKey(date, period.bucketStrategy)
    if (!grouped.has(bucketKey)) return
    grouped.get(bucketKey).push(getValue(entry))
  })

  const points = buckets.map((bucket) => {
    const values = safeArray(grouped.get(bucket.id)).filter(Number.isFinite)
    const value = aggregation === 'sum'
      ? values.length ? round(values.reduce((sum, item) => sum + item, 0), 1) : null
      : average(values)

    return {
      ...bucket,
      count: values.length,
      hasData: values.length > 0,
      value,
    }
  })
  const values = points.map((point) => point.value).filter(Number.isFinite)

  return {
    average: average(values),
    bucketType: period.bucketStrategy,
    coverage: {
      actual: points.filter((point) => point.hasData).length,
      expected: points.length,
      ratio: points.length ? round(points.filter((point) => point.hasData).length / points.length, 2) : 0,
    },
    end: period.end,
    id,
    label,
    max: values.length ? Math.max(...values) : null,
    min: values.length ? Math.min(...values) : null,
    points,
    start: period.start,
    textualSummary: values.length
      ? `${label}: ${values.length} datapunkter i ${period.label.toLocaleLowerCase('sv-SE')}.`
      : `${label}: ingen registrerad data i vald period.`,
    trend: trendFromPoints(points),
    unit,
  }
}

export function compareMetricPeriods({ currentCoverage = 1, currentValue, direction = 'higherIsBetter', label, previousCoverage = 1, previousValue, unit = '' }) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return {
      absoluteDifference: null,
      comparisonStatus: 'insufficient',
      confidence: 'low',
      label,
      percentDifference: null,
      text: `${label}: jämförelse saknar tillräcklig data.`,
      trendDirection: 'insufficient',
    }
  }

  const coverageGap = Math.abs((currentCoverage || 0) - (previousCoverage || 0))
  if (coverageGap > 0.45) {
    return {
      absoluteDifference: round(currentValue - previousValue, 1),
      comparisonStatus: 'notComparable',
      confidence: 'low',
      label,
      percentDifference: null,
      text: `${label}: datatäckningen skiljer sig för mycket för en rättvis jämförelse.`,
      trendDirection: 'changed',
    }
  }

  const absoluteDifference = round(currentValue - previousValue, 1)
  const denominator = Math.abs(previousValue)
  const percentDifference = denominator >= 1 ? round((absoluteDifference / denominator) * 100, 1) : null
  const stable = Math.abs(absoluteDifference) < 0.05
  const trendDirection = stable ? 'stable' : absoluteDifference > 0 ? 'up' : 'down'
  const domainBetter = direction === 'lowerIsBetter' ? absoluteDifference < 0 : direction === 'towardGoal' ? false : absoluteDifference > 0
  const comparisonStatus = stable ? 'stable' : domainBetter ? 'improved' : 'changed'

  return {
    absoluteDifference,
    comparisonStatus,
    confidence: currentCoverage >= 0.5 && previousCoverage >= 0.5 ? 'medium' : 'low',
    label,
    percentDifference,
    text: `${label}: ${absoluteDifference.toLocaleString('sv-SE')} ${unit}`.trim(),
    trendDirection,
  }
}

export const healthDashboardPeriodEngineInternals = {
  average,
  getBucketKey,
  getBucketStrategy,
  round,
  trendFromPoints,
}
