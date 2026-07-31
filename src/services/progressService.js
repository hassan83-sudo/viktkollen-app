import { getUnifiedWeightFacts, normalizeDailyWeightEntries } from './healthCalculations.js'
import { formatWeight, formatWeightChange } from './healthFormatting.js'

export const weightSources = ['Manuell', 'Importerad', 'Check-in', 'Kroppsanalys', 'Annat']

export const bodyMeasurementTypes = [
  'Midja',
  'Höft',
  'Bröst',
  'Överarm vänster',
  'Överarm höger',
  'Lår vänster',
  'Lår höger',
  'Vad vänster',
  'Vad höger',
  'Hals',
]

const progressExportVersion = 1
const dayMs = 24 * 60 * 60 * 1000

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function getDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getTimeString(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function parseDate(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function addDays(dateString, amount) {
  const date = parseDate(dateString) || new Date()

  date.setDate(date.getDate() + amount)

  return getDateString(date)
}

export function parsePositiveNumber(value, fallback = null, max = 500) {
  if (value === '' || value === null || value === undefined) {
    return fallback
  }

  const parsed = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    return fallback
  }

  return parsed
}

export function formatKg(value, fallback = 'Saknas') {
  return formatWeight(value, { fallback })
}

export function formatSignedKg(value, fallback = 'Saknas') {
  return formatWeightChange(value, { fallback, showPlus: true })
}

function normalizeSource(value) {
  const match = weightSources.find(
    (source) => source.toLocaleLowerCase('sv-SE') === String(value || '').toLocaleLowerCase('sv-SE'),
  )

  return match || 'Manuell'
}

function normalizeMeasurementType(value) {
  const match = bodyMeasurementTypes.find(
    (type) => type.toLocaleLowerCase('sv-SE') === String(value || '').toLocaleLowerCase('sv-SE'),
  )

  return match || 'Midja'
}

export function createProgressId(prefix = 'progress') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function splitDateTime(entry) {
  const date = parseDate(entry?.createdAt || entry?.date || Date.now()) || new Date()

  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.date || '')) ? entry.date : getDateString(date),
    time: /^\d{2}:\d{2}$/.test(String(entry?.time || '')) ? entry.time : getTimeString(date),
  }
}

export function normalizeWeightEntry(entry) {
  if (!isObject(entry)) {
    return null
  }

  const value = parsePositiveNumber(entry.weight ?? entry.value, null, 500)

  if (value === null) {
    return null
  }

  const dateTime = splitDateTime(entry)
  const now = new Date().toISOString()

  return {
    ...entry,
    createdAt: parseDate(entry.createdAt)?.toISOString() || now,
    date: dateTime.date,
    id: String(entry.id || createProgressId('weight')),
    note: typeof entry.note === 'string' ? entry.note : '',
    source: normalizeSource(entry.source),
    time: dateTime.time,
    updatedAt: parseDate(entry.updatedAt)?.toISOString() || now,
    value,
    weight: value,
  }
}

export function compareProgressNewest(first, second) {
  return `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`)
}

export function compareProgressOldest(first, second) {
  return `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
}

export function getWeightEntrySignature(entry) {
  const normalized = normalizeWeightEntry(entry)

  if (!normalized) {
    return ''
  }

  return [
    normalized.date,
    normalized.time,
    normalized.value.toFixed(1),
    normalized.source,
    normalized.note.trim().toLocaleLowerCase('sv-SE'),
  ].join('|')
}

function getWeightMigrationGroupSignature(entry) {
  const normalized = normalizeWeightEntry(entry)

  if (!normalized) {
    return ''
  }

  return [
    normalized.date,
    normalized.value.toFixed(1),
    normalized.source,
    normalized.note.trim().toLocaleLowerCase('sv-SE'),
  ].join('|')
}

function getWeightTimeMinutes(entry) {
  const [, hours = '0', minutes = '0'] = /^(\d{2}):(\d{2})$/.exec(String(entry?.time || '')) || []

  return Number(hours) * 60 + Number(minutes)
}

function getWeightRecencyTime(entry) {
  return Math.max(
    parseDate(entry?.updatedAt)?.getTime() || 0,
    parseDate(entry?.createdAt)?.getTime() || 0,
    new Date(`${entry?.date || '1970-01-01'}T${entry?.time || '00:00'}`).getTime() || 0,
  )
}

function getLatestWeightEntry(entries) {
  return [...entries].sort((first, second) => {
    const timeDifference = getWeightTimeMinutes(second) - getWeightTimeMinutes(first)

    if (timeDifference !== 0) {
      return timeDifference
    }

    return getWeightRecencyTime(second) - getWeightRecencyTime(first)
  })[0]
}

export function normalizeWeights(weights) {
  const seenIds = new Set()
  const seenSignatures = new Set()

  return (Array.isArray(weights) ? weights : [])
    .map(normalizeWeightEntry)
    .filter(Boolean)
    .filter((entry) => {
      const signature = getWeightEntrySignature(entry)

      if (seenIds.has(entry.id) || seenSignatures.has(signature)) {
        return false
      }

      seenIds.add(entry.id)
      seenSignatures.add(signature)
      return true
    })
    .sort(compareProgressOldest)
}

export function migrateDuplicateWeightEntries(weights = []) {
  const validWeights = (Array.isArray(weights) ? weights : [])
    .map(normalizeWeightEntry)
    .filter(Boolean)
  const byGroup = validWeights.reduce((groups, entry) => {
    const signature = getWeightMigrationGroupSignature(entry)

    groups.set(signature, [...(groups.get(signature) || []), entry])
    return groups
  }, new Map())
  const clusteredWeights = []

  byGroup.forEach((entries) => {
    const sortedEntries = [...entries].sort(compareProgressOldest)
    let currentCluster = []
    let previousMinutes = null

    sortedEntries.forEach((entry) => {
      const minutes = getWeightTimeMinutes(entry)

      if (previousMinutes !== null && minutes - previousMinutes > 5) {
        clusteredWeights.push(getLatestWeightEntry(currentCluster))
        currentCluster = []
      }

      currentCluster.push(entry)
      previousMinutes = minutes
    })

    if (currentCluster.length > 0) {
      clusteredWeights.push(getLatestWeightEntry(currentCluster))
    }
  })

  const migratedWeights = normalizeWeights(clusteredWeights)
  const removedCount = Math.max(0, validWeights.length - migratedWeights.length)

  return {
    changed: removedCount > 0,
    removedCount,
    weights: migratedWeights,
  }
}

export function getEmptyWeightDraft(latestWeight = null) {
  return {
    date: getDateString(),
    note: '',
    source: 'Manuell',
    time: getTimeString(),
    value: latestWeight?.value ? String(latestWeight.value).replace('.', ',') : '',
  }
}

export function validateWeightDraft(draft) {
  const errors = {}

  if (!draft.date || !parseDate(draft.date)) {
    errors.date = 'Välj ett giltigt datum.'
  }

  if (!/^\d{2}:\d{2}$/.test(String(draft.time || ''))) {
    errors.time = 'Välj en giltig tid.'
  }

  if (parsePositiveNumber(draft.value, null, 500) === null) {
    errors.value = 'Ange en rimlig vikt mellan 1 och 500 kg.'
  }

  return errors
}

export function weightDraftToEntry(draft, existingEntry = null) {
  const now = new Date().toISOString()

  return normalizeWeightEntry({
    ...existingEntry,
    ...draft,
    createdAt: existingEntry?.createdAt || now,
    id: existingEntry?.id || draft.id || createProgressId('weight'),
    updatedAt: now,
    value: draft.value,
    weight: draft.value,
  })
}

export function upsertWeight(weights, entry) {
  const normalized = normalizeWeightEntry(entry)

  if (!normalized) {
    return normalizeWeights(weights)
  }

  const signature = getWeightEntrySignature(normalized)

  return normalizeWeights([
    normalized,
    ...normalizeWeights(weights).filter((item) => item.id !== normalized.id && getWeightEntrySignature(item) !== signature),
  ])
}

export function copyWeightToDate(entry, date, time = getTimeString()) {
  return normalizeWeightEntry({
    ...entry,
    createdAt: new Date().toISOString(),
    date,
    id: createProgressId('weight'),
    source: entry.source || 'Manuell',
    time,
    updatedAt: new Date().toISOString(),
  })
}

export function getDailyWeights(weights) {
  return normalizeDailyWeightEntries(weights)
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value))

  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : null
}

function getChangeBetween(entries, days) {
  if (entries.length < 2) {
    return null
  }

  const latest = entries.at(-1)
  const cutoff = new Date(latest.date)

  cutoff.setDate(cutoff.getDate() - days)

  const previous = [...entries].reverse().find((entry) => new Date(entry.date) <= cutoff) || entries[0]

  return Number((latest.value - previous.value).toFixed(1))
}

function countCurrentStreak(entries) {
  const dates = new Set(entries.map((entry) => entry.date))
  let streak = 0
  let cursor = parseDate(entries.at(-1)?.date)

  while (cursor && dates.has(getDateString(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

function countLongestStreak(entries) {
  const dates = [...new Set(entries.map((entry) => entry.date))].sort()
  let longest = 0
  let current = 0
  let previous = null

  dates.forEach((date) => {
    if (!previous || (parseDate(date) - parseDate(previous)) / dayMs === 1) {
      current += 1
    } else {
      current = 1
    }

    longest = Math.max(longest, current)
    previous = date
  })

  return longest
}

function getVariation(entries) {
  if (entries.length < 2) {
    return null
  }

  const changes = entries.slice(1).map((entry, index) => Math.abs(entry.value - entries[index].value))

  return average(changes)
}

export function analyzeWeights(weights, profile = {}) {
  const entries = getDailyWeights(weights)
  const first = entries[0] || null
  const latest = entries.at(-1) || null
  const values = entries.map((entry) => entry.value)
  const changeTotal = first && latest ? Number((latest.value - first.value).toFixed(1)) : null
  const change7 = getChangeBetween(entries, 7)
  const change30 = getChangeBetween(entries, 30)
  const days = first && latest ? Math.max(1, (parseDate(latest.date) - parseDate(first.date)) / dayMs) : 0
  const weeklyRate = changeTotal !== null ? Number(((changeTotal / days) * 7).toFixed(2)) : null
  const monthlyRate = changeTotal !== null ? Number(((changeTotal / days) * 30).toFixed(2)) : null
  const variation = getVariation(entries)
  const weightFacts = getUnifiedWeightFacts({
    currentWeight: latest?.value,
    profile,
    weights: entries,
  })
  const goalWeight = weightFacts.goalWeight
  const startWeight = weightFacts.startWeight
  const completePercent = weightFacts.completePercent

  return {
    averageWeight: average(values),
    change30,
    change7,
    changeTotal,
    currentStreak: countCurrentStreak(entries),
    dateRangeLabel: first && latest ? `${first.date} till ${latest.date}` : 'För lite data',
    highestWeight: values.length ? Math.max(...values) : null,
    isPlateau: entries.length >= 5 && Math.abs(change7 ?? 99) <= 0.2,
    latest,
    longestStreak: countLongestStreak(entries),
    lowestWeight: values.length ? Math.min(...values) : null,
    monthlyRate,
    registrationDays: entries.length,
    stability:
      variation === null
        ? 'För lite data'
        : variation < 0.25
          ? 'Stabil'
          : variation < 0.7
            ? 'Normal variation'
            : 'Stor variation',
    start: first,
    target: {
      completePercent,
      goalWeight,
      kilosChanged: changeTotal,
      kilosRemaining:
        weightFacts.goalRemaining === null ? null : Math.abs(weightFacts.goalRemaining),
      startWeight,
    },
    trend:
      weeklyRate === null
        ? 'För lite data'
        : weeklyRate < -0.1
          ? 'Nedåt'
          : weeklyRate > 0.1
            ? 'Uppåt'
            : 'Stabil',
    variation,
    weighingCount: normalizeWeights(weights).length,
    weeklyRate,
  }
}

export function createMovingAverage(entries, windowSize = 7) {
  return entries.map((entry, index) => {
    const slice = entries.slice(Math.max(0, index - windowSize + 1), index + 1)

    return {
      ...entry,
      value: Number((slice.reduce((sum, item) => sum + item.value, 0) / slice.length).toFixed(2)),
    }
  })
}

export function getWeeklyAverages(weights) {
  const groups = getDailyWeights(weights).reduce((map, entry) => {
    const date = parseDate(entry.date)
    const day = date.getDay() || 7

    date.setDate(date.getDate() - day + 1)

    const week = getDateString(date)
    const current = map.get(week) || []

    current.push(entry.value)
    map.set(week, current)
    return map
  }, new Map())

  return [...groups.entries()].map(([date, values]) => ({
    date,
    value: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
  }))
}

export function createWeightProjection(weights, profile = {}) {
  const analysis = analyzeWeights(weights, profile)
  const entries = getDailyWeights(weights)
  const recent = entries.slice(-60)
  const sourceEntries = recent.length >= 6 ? recent : entries
  const rate =
    sourceEntries.length >= 2
      ? Number(((sourceEntries.at(-1).value - sourceEntries[0].value) /
        Math.max(1, (parseDate(sourceEntries.at(-1).date) - parseDate(sourceEntries[0].date)) / dayMs) *
        7).toFixed(2))
      : null
  const variation = getVariation(sourceEntries)
  const frequency =
    sourceEntries.length >= 2
      ? sourceEntries.length /
        Math.max(1, (parseDate(sourceEntries.at(-1).date) - parseDate(sourceEntries[0].date)) / dayMs)
      : 0
  const uncertainty =
    sourceEntries.length < 6 || rate === null || Math.abs(rate) < 0.05
      ? 'hög'
      : variation !== null && variation > 0.8
        ? 'hög'
        : frequency < 0.25
          ? 'medel'
          : 'låg'
  const latest = analysis.latest
  const goalWeight = analysis.target.goalWeight
  const startWeight = analysis.target.startWeight
  const daysBetween =
    sourceEntries.length >= 2
      ? (parseDate(sourceEntries.at(-1).date) - parseDate(sourceEntries[0].date)) / dayMs
      : 0
  const goalDirection =
    startWeight !== null && goalWeight !== null && startWeight !== goalWeight
      ? Math.sign(goalWeight - startWeight)
      : latest && goalWeight !== null
        ? Math.sign(goalWeight - latest.value)
        : 0
  const hasReachedGoal =
    latest && goalWeight !== null && (
      goalDirection < 0
        ? latest.value <= goalWeight
        : goalDirection > 0
          ? latest.value >= goalWeight
          : Math.abs(latest.value - goalWeight) <= 0.1
    )
  const hasProjectionData =
    latest &&
    goalWeight !== null &&
    rate !== null &&
    Math.abs(rate) >= 0.05 &&
    sourceEntries.length >= 6 &&
    daysBetween >= 14
  const canProject = Boolean(hasProjectionData && !hasReachedGoal)

  function projectedWeight(weeks) {
    if (!canProject) {
      return null
    }

    const projected = latest.value + rate * weeks

    return projected > 30 && projected < 300 ? Number(projected.toFixed(1)) : null
  }

  let goalDate = 'För lite data för en tillförlitlig prognos.'

  if (!latest) {
    goalDate = 'Logga vikt för att få en prognos.'
  } else if (goalWeight === null) {
    goalDate = 'Sätt en målvikt för att få en prognos.'
  } else if (hasReachedGoal) {
    goalDate = 'Målet är nått.'
  } else if (canProject) {
    const direction = latest.value > goalWeight ? -1 : 1
    const rateDirection = rate < 0 ? -1 : 1

    if (direction === rateDirection) {
      const weeks = Math.ceil(Math.abs(latest.value - goalWeight) / Math.abs(rate))
      const cappedWeeks = Math.min(weeks, 156)
      const date = new Date()

      date.setDate(date.getDate() + cappedWeeks * 7)
      goalDate = weeks > 156 ? 'Längre än 3 år' : date.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
    } else {
      goalDate = 'Trenden går inte mot målet just nu'
    }
  }

  return {
    basedOn: sourceEntries.length ? `${sourceEntries[0].date} till ${sourceEntries.at(-1).date}` : 'För lite data',
    canProject: Boolean(canProject),
    estimatedGoalDate: goalDate,
    trendPerWeek: rate,
    uncertainty,
    weightIn12Weeks: projectedWeight(12),
    weightIn4Weeks: projectedWeight(4),
    weightIn8Weeks: projectedWeight(8),
  }
}

export function normalizeGoalSettings(settings = {}) {
  return {
    desiredGoalDate: /^\d{4}-\d{2}-\d{2}$/.test(String(settings.desiredGoalDate || ''))
      ? settings.desiredGoalDate
      : '',
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(settings.startDate || ''))
      ? settings.startDate
      : '',
    targetRatePerWeek: parsePositiveNumber(settings.targetRatePerWeek, null, 5),
  }
}

export function normalizeBodyMeasurement(entry) {
  if (!isObject(entry)) {
    return null
  }

  const value = parsePositiveNumber(entry.value ?? entry.cm, null, 300)

  if (value === null) {
    return null
  }

  const dateTime = splitDateTime(entry)
  const now = new Date().toISOString()

  return {
    ...entry,
    createdAt: parseDate(entry.createdAt)?.toISOString() || now,
    date: dateTime.date,
    id: String(entry.id || createProgressId('measurement')),
    note: typeof entry.note === 'string' ? entry.note : '',
    type: normalizeMeasurementType(entry.type || entry.measurementType),
    updatedAt: parseDate(entry.updatedAt)?.toISOString() || now,
    value,
  }
}

export function normalizeBodyMeasurements(measurements) {
  const seen = new Set()

  return (Array.isArray(measurements) ? measurements : [])
    .map(normalizeBodyMeasurement)
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry.id)) {
        return false
      }

      seen.add(entry.id)
      return true
    })
    .sort(compareProgressOldest)
}

export function getEmptyMeasurementDraft() {
  return {
    date: getDateString(),
    note: '',
    type: 'Midja',
    value: '',
  }
}

export function validateMeasurementDraft(draft) {
  const errors = {}

  if (!draft.date || !parseDate(draft.date)) {
    errors.date = 'Välj ett giltigt datum.'
  }

  if (parsePositiveNumber(draft.value, null, 300) === null) {
    errors.value = 'Ange ett rimligt mått mellan 1 och 300 cm.'
  }

  return errors
}

export function measurementDraftToEntry(draft, existingEntry = null) {
  const now = new Date().toISOString()

  return normalizeBodyMeasurement({
    ...existingEntry,
    ...draft,
    createdAt: existingEntry?.createdAt || now,
    id: existingEntry?.id || draft.id || createProgressId('measurement'),
    updatedAt: now,
  })
}

export function upsertMeasurement(measurements, entry) {
  const normalized = normalizeBodyMeasurement(entry)

  if (!normalized) {
    return normalizeBodyMeasurements(measurements)
  }

  return normalizeBodyMeasurements([
    normalized,
    ...normalizeBodyMeasurements(measurements).filter((item) => item.id !== normalized.id),
  ])
}

export function analyzeBodyMeasurements(measurements) {
  const normalized = normalizeBodyMeasurements(measurements)
  const byType = bodyMeasurementTypes.map((type) => {
    const entries = normalized.filter((entry) => entry.type === type)
    const first = entries[0] || null
    const latest = entries.at(-1) || null
    const change = first && latest ? Number((latest.value - first.value).toFixed(1)) : null

    return {
      change,
      count: entries.length,
      first,
      latest,
      percentChange: first && change !== null ? Number(((change / first.value) * 100).toFixed(1)) : null,
      type,
    }
  }).filter((entry) => entry.count > 0)
  const biggestDecrease = [...byType].sort((first, second) => (first.change || 0) - (second.change || 0))[0] || null
  const biggestIncrease = [...byType].sort((first, second) => (second.change || 0) - (first.change || 0))[0] || null

  return {
    biggestDecrease,
    biggestIncrease,
    byType,
    latestDate: normalized.at(-1)?.date || null,
    trackedTypes: byType.length,
    totalEntries: normalized.length,
  }
}

export function createProgressInsights({ bodyMeasurements = [], profile = {}, seenTypes = [], weights = [] } = {}) {
  const analysis = analyzeWeights(weights, profile)
  const measurementAnalysis = analyzeBodyMeasurements(bodyMeasurements)
  const insights = []

  if (analysis.registrationDays < 2) {
    insights.push({
      basis: `${analysis.registrationDays} registrerade viktdagar.`,
      priority: 100,
      type: 'low-weight-data',
      text: 'Logga några fler vikter för att göra trendanalysen mer pålitlig.',
    })
  }

  if (analysis.isPlateau) {
    insights.push({
      basis: `Förändring senaste 7 dagar: ${formatSignedKg(analysis.change7)}.`,
      priority: 95,
      type: 'plateau',
      text: 'Vikten ser stabil ut just nu. Det kan vara normalt, särskilt över korta perioder.',
    })
  }

  if (analysis.trend === 'Nedåt') {
    insights.push({
      basis: `Veckotakt: ${formatSignedKg(analysis.weeklyRate)}.`,
      priority: 85,
      type: 'weight-down',
      text: 'Vikttrenden går nedåt. Fortsätt följa helheten med mat, steg och återhämtning.',
    })
  }

  if (analysis.trend === 'Uppåt') {
    insights.push({
      basis: `Veckotakt: ${formatSignedKg(analysis.weeklyRate)}.`,
      priority: 82,
      type: 'weight-up',
      text: 'Vikten rör sig uppåt i den här perioden. Se det som data och välj ett lugnt nästa steg.',
    })
  }

  if (analysis.latest && analysis.lowestWeight === analysis.latest.value) {
    insights.push({
      basis: `Senaste vikt: ${formatKg(analysis.latest.value)}.`,
      priority: 78,
      type: 'new-low',
      text: 'Du har registrerat en ny lägsta vikt i den lokala historiken.',
    })
  }

  if (measurementAnalysis.biggestDecrease?.change < 0) {
    insights.push({
      basis: `${measurementAnalysis.biggestDecrease.type}: ${formatSignedKg(measurementAnalysis.biggestDecrease.change).replace('kg', 'cm')}.`,
      priority: 76,
      type: 'measurement-down',
      text: `${measurementAnalysis.biggestDecrease.type} har minskat jämfört med första registreringen.`,
    })
  }

  return insights
    .filter((insight) => !seenTypes.slice(0, 6).includes(insight.type))
    .sort((first, second) => second.priority - first.priority)
    .slice(0, 5)
}

export function buildProgressTimeline({ bodyAnalysisHistory = [], bodyMeasurements = [], progressPhotos = [], weights = [] } = {}) {
  return [
    ...normalizeWeights(weights).map((entry) => ({
      date: entry.date,
      description: `${formatKg(entry.value)}${entry.note ? ` - ${entry.note}` : ''}`,
      id: `weight-${entry.id}`,
      title: 'Vikt registrerad',
      type: 'Vikt',
    })),
    ...normalizeBodyMeasurements(bodyMeasurements).map((entry) => ({
      date: entry.date,
      description: `${entry.type}: ${entry.value.toLocaleString('sv-SE')} cm${entry.note ? ` - ${entry.note}` : ''}`,
      id: `measurement-${entry.id}`,
      title: 'Kroppsmått registrerat',
      type: 'Kroppsmått',
    })),
    ...(Array.isArray(progressPhotos) ? progressPhotos : []).map((photo) => ({
      date: getDateString(parseDate(photo.createdAt || photo.date) || new Date()),
      description: photo.note || 'Framstegsbild sparad.',
      id: `photo-${photo.id}`,
      title: 'Framstegsbild',
      type: 'Bild',
    })),
    ...(Array.isArray(bodyAnalysisHistory) ? bodyAnalysisHistory : []).map((entry) => ({
      date: getDateString(parseDate(entry.createdAt || entry.date) || new Date()),
      description: entry.summary || entry.observation || 'AI-kroppsanalys sparad.',
      id: `analysis-${entry.id || entry.createdAt}`,
      title: 'AI-kroppsanalys',
      type: 'AI',
    })),
  ].sort((first, second) => second.date.localeCompare(first.date))
}

export function createProgressReport({ bodyMeasurements = [], period = 'week', profile = {}, progressPhotos = [], today = new Date(), weights = [] } = {}) {
  const normalizedWeights = getDailyWeights(weights)
  const now = parseDate(today) || new Date()
  const days = period === 'month' ? 30 : 7
  const cutoff = new Date(now.getTime() - days * dayMs)
  const periodWeights = normalizedWeights.filter((entry) => parseDate(entry.date) >= cutoff)
  const periodMeasurements = normalizeBodyMeasurements(bodyMeasurements).filter((entry) => parseDate(entry.date) >= cutoff)
  const periodPhotos = (Array.isArray(progressPhotos) ? progressPhotos : []).filter((photo) =>
    (parseDate(photo.createdAt || photo.date) || new Date(0)) >= cutoff)
  const analysis = analyzeWeights(periodWeights.length ? periodWeights : normalizedWeights, profile)

  return {
    createdAt: new Date().toISOString(),
    id: createProgressId('report'),
    insight:
      analysis.registrationDays === 0
        ? 'Perioden saknar viktdata.'
        : `Rapporten bygger på ${analysis.weighingCount} invägningar och ${periodMeasurements.length} kroppsmått.`,
    measurementCount: periodMeasurements.length,
    period,
    photoCount: periodPhotos.length,
    registrationFrequency: periodWeights.length ? `${periodWeights.length} av ${days} dagar` : 'Saknas',
    version: 1,
    weightAverage: analysis.averageWeight,
    weightChange: analysis.changeTotal,
    weightEnd: analysis.latest?.value ?? null,
    weightStart: analysis.start?.value ?? null,
  }
}

export function exportProgressData({
  bodyMeasurements,
  goalSettings,
  includeImages = false,
  progressPhotos,
  progressReports,
  weights,
}) {
  const photoPayload = (Array.isArray(progressPhotos) ? progressPhotos : []).map((photo) => ({
    ...photo,
    image: includeImages ? photo.image : undefined,
    imageIncluded: Boolean(includeImages && photo.image),
  }))

  return {
    app: 'Viktkollen',
    exportedAt: new Date().toISOString(),
    format: 'viktkollen-progress',
    version: progressExportVersion,
    counts: {
      bodyMeasurements: normalizeBodyMeasurements(bodyMeasurements).length,
      progressPhotos: photoPayload.length,
      progressReports: Array.isArray(progressReports) ? progressReports.length : 0,
      weights: normalizeWeights(weights).length,
    },
    data: {
      bodyMeasurements: normalizeBodyMeasurements(bodyMeasurements),
      goalSettings: normalizeGoalSettings(goalSettings),
      progressPhotos: photoPayload,
      progressReports: Array.isArray(progressReports) ? progressReports : [],
      weights: normalizeWeights(weights),
    },
  }
}

export function parseProgressImport(payload) {
  if (!isObject(payload) || payload.format !== 'viktkollen-progress') {
    return {
      ok: false,
      reason: 'Filen är inte en giltig Viktkollen framstegsexport.',
    }
  }

  const weights = normalizeWeights(payload.data?.weights || [])
  const bodyMeasurements = normalizeBodyMeasurements(payload.data?.bodyMeasurements || [])

  return {
    bodyMeasurements,
    goalSettings: normalizeGoalSettings(payload.data?.goalSettings || {}),
    ok: true,
    progressReports: Array.isArray(payload.data?.progressReports) ? payload.data.progressReports : [],
    summary: {
      bodyMeasurementCount: bodyMeasurements.length,
      progressReportCount: Array.isArray(payload.data?.progressReports) ? payload.data.progressReports.length : 0,
      weightCount: weights.length,
    },
    weights,
  }
}
