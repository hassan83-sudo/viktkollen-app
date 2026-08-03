import { buildCoachActionSummary } from './adaptiveCoachActions.js'
import { buildAdaptiveCoachFeedbackSummary, normalizeAdaptiveCoachFeedback } from './adaptiveCoachFeedback.js'
import { buildAdaptiveCoachTimelineSummary } from './adaptiveCoachTimeline.js'
import { getEntryDateTime, getEntryLocalDate, getLocalDateRange, isFutureLocalDate } from './localDate.js'

export const adaptiveCoachPatternTypes = [
  'weekdayDifference',
  'weekendDifference',
  'consistency',
  'recurringGap',
  'recurringSuccess',
  'improvingCoverage',
  'decliningCoverage',
  'timeOfDayPattern',
  'actionFollowThrough',
  'reminderResponse',
  'insufficientData',
]

export const patternEligibilityStatuses = ['supported', 'tentative', 'insufficient', 'notComparable', 'blocked']

const unsafeTextPatterns = [
  /diagnos/i,
  /medicin/i,
  /kommer att/i,
  /alltid/i,
  /aldrig/i,
  /lat/i,
  /disciplin/i,
  /misslyckas/i,
  /straff/i,
  /svält/i,
  /extrem/i,
  /hoppa över (mat|måltid|frukost|lunch|middag)/i,
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeText(value, fallback = '', max = 260) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeNumber(value, fallback = null) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min

  return Math.min(max, Math.max(min, number))
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

function hashText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function sanitizeCoachPatternText(text) {
  const clean = safeText(text)
  if (!clean) return ''
  if (unsafeTextPatterns.some((pattern) => pattern.test(clean))) {
    return 'Registrerad data visar ett möjligt mönster, men texten har neutraliserats av säkerhetsskäl.'
  }

  return clean
}

function isActualMeal(meal) {
  const source = safeText(meal?.source).toLocaleLowerCase('sv-SE')
  const status = safeText(meal?.status).toLocaleLowerCase('sv-SE')

  return !(meal?.planned || meal?.isPlanned || source === 'planned' || status === 'planned')
}

function inPeriod(entry, range, analysisDate) {
  const date = getEntryLocalDate(entry)

  return Boolean(date && date >= range.start && date <= range.end && !isFutureLocalDate(date, analysisDate))
}

function getMetric(entry, metric) {
  if (metric === 'meals') return 1
  if (metric === 'protein') return safeNumber(entry?.protein ?? entry?.totals?.protein ?? entry?.nutrition?.protein)
  if (metric === 'calories') return safeNumber(entry?.calories ?? entry?.kcal ?? entry?.totals?.calories ?? entry?.nutrition?.calories)
  if (metric === 'steps') return safeNumber(entry?.steps ?? entry?.metrics?.steps)
  if (metric === 'energy') return safeNumber(entry?.energy?.value ?? entry?.energy ?? entry?.metrics?.energy?.value)
  if (metric === 'weight') return safeNumber(entry?.value ?? entry?.weight)
  if (metric === 'workout') return entry?.workout || entry?.training || entry?.exercise ? 1 : null
  return null
}

function groupDayTotals(entries, metric) {
  const days = new Map()
  entries.forEach((entry) => {
    const date = getEntryLocalDate(entry)
    const value = getMetric(entry, metric)
    if (!date || !Number.isFinite(value)) return
    const current = days.get(date) || { count: 0, date, total: 0 }
    days.set(date, {
      count: current.count + 1,
      date,
      total: current.total + value,
    })
  })

  return [...days.values()].sort((first, second) => first.date.localeCompare(second.date))
}

function average(items) {
  const values = items.map((item) => item.total).filter(Number.isFinite)
  if (!values.length) return null

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function dayType(date) {
  const day = new Date(`${date}T12:00:00`).getDay()

  return day === 0 || day === 6 ? 'weekend' : 'weekday'
}

function eligibilityFor({ difference = 0, sampleSize = 0, coverage = 0 }) {
  if (sampleSize < 2) return { reason: 'För få observationer.', status: 'insufficient' }
  if (coverage < 0.15) return { reason: 'Datatäckningen är låg.', status: 'tentative' }
  if (Math.abs(difference) < 0.15) return { reason: 'Skillnaden är liten.', status: 'notComparable' }
  if (sampleSize < 5 || coverage < 0.35) return { reason: 'Underlaget är användbart men begränsat.', status: 'tentative' }
  return { reason: 'Mönstret stöds av flera registreringar.', status: 'supported' }
}

function createPattern(source) {
  const eligibility = patternEligibilityStatuses.includes(source.eligibility) ? source.eligibility : 'insufficient'
  const coverage = clamp(source.coverage ?? 0, 0, 1)
  const confidence = eligibility === 'supported'
    ? clamp(source.confidence ?? 0.72, 0.4, 0.95)
    : eligibility === 'tentative'
      ? clamp(source.confidence ?? 0.46, 0.2, 0.65)
      : clamp(source.confidence ?? 0.18, 0, 0.35)
  const text = sanitizeCoachPatternText(source.textualSummary)

  return {
    category: safeText(source.category, 'coverage'),
    confidence: round(confidence),
    coverage: round(coverage),
    direction: safeText(source.direction, 'neutral'),
    eligibility,
    evidence: safeArray(source.evidence).map((item) => sanitizeCoachPatternText(item)).slice(0, 4),
    id: safeText(source.id) || `pattern-${hashText(`${source.category}|${source.patternType}|${text}|${source.period?.start}|${source.period?.end}`)}`,
    limitations: safeArray(source.limitations).map((item) => sanitizeCoachPatternText(item)).slice(0, 3),
    patternType: adaptiveCoachPatternTypes.includes(source.patternType) ? source.patternType : 'insufficientData',
    period: source.period || {},
    recommendedResponse: sanitizeCoachPatternText(source.recommendedResponse || 'Välj ett litet nästa steg och följ upp utan press.'),
    safetyCategory: safeText(source.safetyCategory || 'standard'),
    sampleSize: Math.max(0, Math.floor(Number(source.sampleSize) || 0)),
    strength: round(clamp(source.strength ?? confidence, 0, 1)),
    supportingDates: safeArray(source.supportingDates).map((date) => safeText(date).slice(0, 10)).filter(Boolean).slice(0, 12),
    textualSummary: text,
  }
}

function buildConsistencyPattern(entries, metric, category, period, expectedDays) {
  const days = groupDayTotals(entries, metric)
  const coverage = expectedDays ? days.length / expectedDays : 0
  const eligibility = eligibilityFor({ sampleSize: days.length, coverage }).status
  const label = category === 'nutrition'
    ? 'måltidsloggning'
    : category === 'activity'
      ? 'check-ins'
      : 'viktregistrering'

  return createPattern({
    category,
    coverage,
    direction: coverage >= 0.5 ? 'stable' : 'lowCoverage',
    eligibility,
    evidence: [`${days.length} registrerade dagar av ${expectedDays}.`],
    limitations: eligibility === 'supported' ? [] : ['Underlaget är begränsat och ska tolkas försiktigt.'],
    patternType: coverage >= 0.45 ? 'consistency' : 'recurringGap',
    period,
    recommendedResponse: coverage >= 0.45 ? 'Behåll en enkel registreringsrytm.' : 'Välj en liten registrering som är lätt att upprepa.',
    sampleSize: days.length,
    strength: coverage,
    supportingDates: days.map((day) => day.date),
    textualSummary: coverage >= 0.45
      ? `Registrerad data visar relativt jämn ${label} i perioden.`
      : `Registrerad data visar luckor i ${label} under perioden.`,
  })
}

function buildWeekdayPattern(entries, metric, category, period, expectedDays) {
  const days = groupDayTotals(entries, metric)
  const weekdays = days.filter((day) => dayType(day.date) === 'weekday')
  const weekends = days.filter((day) => dayType(day.date) === 'weekend')
  const weekdayAverage = average(weekdays)
  const weekendAverage = average(weekends)
  const diff = Number.isFinite(weekdayAverage) && Number.isFinite(weekendAverage) ? weekdayAverage - weekendAverage : 0
  const coverage = expectedDays ? days.length / expectedDays : 0
  const comparable = weekdays.length >= 2 && weekends.length >= 2
  const eligibility = comparable
    ? eligibilityFor({ coverage, difference: diff / Math.max(Math.abs(weekdayAverage || 0), Math.abs(weekendAverage || 0), 1), sampleSize: days.length })
    : { reason: 'Vardag och helg har inte flera jämförbara observationer.', status: 'notComparable' }
  const metricLabel = metric === 'steps' ? 'steg' : metric === 'protein' ? 'protein' : metric === 'meals' ? 'måltider' : 'registreringar'
  const weekdayHigher = diff > 0

  return createPattern({
    category,
    confidence: comparable ? 0.58 + Math.min(0.22, days.length / 40) : 0.2,
    coverage,
    direction: comparable ? weekdayHigher ? 'weekdayHigher' : 'weekendHigher' : 'neutral',
    eligibility: eligibility.status,
    evidence: comparable
      ? [
        `Vardagssnitt ${round(weekdayAverage, 1)} ${metricLabel}.`,
        `Helgsnitt ${round(weekendAverage, 1)} ${metricLabel}.`,
      ]
      : [eligibility.reason],
    limitations: eligibility.status === 'supported' ? [] : [eligibility.reason],
    patternType: weekdayHigher ? 'weekdayDifference' : 'weekendDifference',
    period,
    recommendedResponse: comparable
      ? 'Använd skillnaden som planeringsstöd, inte som omdöme.'
      : 'Samla fler jämförbara dagar innan coachen drar en tydligare slutsats.',
    sampleSize: days.length,
    strength: Math.abs(diff) / Math.max(Math.abs(weekdayAverage || 0), Math.abs(weekendAverage || 0), 1),
    supportingDates: days.map((day) => day.date),
    textualSummary: comparable
      ? `Under registrerade dagar var ${metricLabel} i genomsnitt ${weekdayHigher ? 'högre på vardagar än helger' : 'högre på helger än vardagar'}.`
      : `Underlaget är ännu för litet för ett säkert vardag/helg-mönster för ${metricLabel}.`,
  })
}

function buildTimeOfDayPattern(entries, category, period, expectedDays) {
  const buckets = { förmiddag: 0, kväll: 0, middag: 0, natt: 0 }
  const dated = entries
    .map((entry) => getEntryDateTime(entry))
    .filter(Boolean)

  dated.forEach((date) => {
    const hour = date.getHours()
    if (hour < 5) buckets.natt += 1
    else if (hour < 11) buckets.förmiddag += 1
    else if (hour < 17) buckets.middag += 1
    else buckets.kväll += 1
  })
  const top = Object.entries(buckets).sort((first, second) => second[1] - first[1])[0]
  const coverage = expectedDays ? dated.length / expectedDays : 0
  const eligibility = top?.[1] >= 3 ? eligibilityFor({ coverage, difference: top[1] / Math.max(dated.length, 1), sampleSize: dated.length }).status : 'insufficient'

  return createPattern({
    category,
    coverage,
    direction: top?.[0] || 'neutral',
    eligibility,
    evidence: top ? [`${top[1]} registreringar i grovt tidsintervall ${top[0]}.`] : [],
    limitations: eligibility === 'supported' ? [] : ['Saknade eller få tidsstämplar ignoreras.'],
    patternType: 'timeOfDayPattern',
    period,
    recommendedResponse: 'Planera bara grovt efter de tider som redan fungerar.',
    sampleSize: dated.length,
    strength: top ? top[1] / Math.max(dated.length, 1) : 0,
    textualSummary: top && eligibility !== 'insufficient'
      ? `Registrerad data visar att ${category === 'nutrition' ? 'måltider' : 'check-ins'} ofta loggas under ${top[0]}.`
      : 'Underlaget är ännu för litet för ett tidsmönster.',
  })
}

function buildActionPatterns(input, options, period) {
  const feedback = normalizeAdaptiveCoachFeedback(input.adaptiveCoachFeedback || {}, { now: options.now })
  const feedbackSummary = buildAdaptiveCoachFeedbackSummary(feedback, { now: options.now })
  const actionSummary = buildCoachActionSummary(feedback)
  const timelineSummary = buildAdaptiveCoachTimelineSummary(input, {
    analysisDate: options.analysisDate,
    filter: { period: '30d' },
    now: options.now,
  })
  const total = feedbackSummary.total
  const completionRate = feedbackSummary.completionRate

  return [
    createPattern({
      category: 'coachActions',
      confidence: total >= 3 ? 0.72 : 0.36,
      coverage: Math.min(1, total / 6),
      direction: completionRate >= 50 ? 'positive' : total ? 'needsSimplerAction' : 'neutral',
      eligibility: total >= 3 ? 'supported' : total > 0 ? 'tentative' : 'insufficient',
      evidence: [
        `${feedbackSummary.accepted} accepterade råd.`,
        `${feedbackSummary.completed} klara råd.`,
        `${feedbackSummary.dismissed} avfärdade råd.`,
      ],
      limitations: total >= 3 ? [] : ['Coachhistoriken är ännu kort.'],
      patternType: total >= 3 && completionRate >= 50 ? 'recurringSuccess' : 'actionFollowThrough',
      period,
      recommendedResponse: completionRate >= 50 ? 'Fortsätt föreslå små actions i samma anda.' : 'Gör nästa action enklare och lättare att avbryta.',
      sampleSize: total,
      strength: completionRate === null ? 0.2 : completionRate / 100,
      textualSummary: total
        ? `Coachhistoriken visar ${actionSummary.total} skapade actions och ${feedbackSummary.completionRateLabel} genomförandegrad.`
        : 'Det finns ännu ingen coachfeedback att analysera.',
    }),
    createPattern({
      category: 'timeline',
      confidence: timelineSummary.totalEvents >= 4 ? 0.7 : 0.3,
      coverage: Math.min(1, timelineSummary.totalEvents / 10),
      direction: timelineSummary.positiveOutcome ? 'positive' : 'neutral',
      eligibility: timelineSummary.totalEvents >= 2 ? 'tentative' : 'insufficient',
      evidence: [`${timelineSummary.totalEvents} tidslinjehändelser.`],
      limitations: timelineSummary.totalEvents >= 2 ? [] : ['Tidslinjen behöver fler händelser för effektmönster.'],
      patternType: timelineSummary.positiveOutcome ? 'recurringSuccess' : 'actionFollowThrough',
      period,
      recommendedResponse: 'Använd tidslinjen för att undvika upprepade råd.',
      sampleSize: timelineSummary.totalEvents,
      strength: Math.min(1, timelineSummary.totalEvents / 10),
      textualSummary: timelineSummary.latestEvent
        ? `Senaste coachhändelsen är ${timelineSummary.latestEvent.title}.`
        : 'Ingen tydlig coachhändelse finns ännu.',
    }),
  ]
}

export function buildAdaptiveCoachPatterns(input = {}, options = {}) {
  const analysisDate = safeText(options.analysisDate || input.analysisDate || input.today)
  const range = getLocalDateRange(Number(options.days) || 30, analysisDate || new Date())
  const period = { end: range.end, label: `${range.days} dagar`, start: range.start }
  const expectedDays = range.days || 30
  const meals = safeArray(input.meals || input.healthSnapshot?.nutrition?.actualMeals)
    .filter(isActualMeal)
    .filter((meal) => inPeriod(meal, range, analysisDate || range.end))
  const checkIns = safeArray(input.checkIns || input.healthSnapshot?.checkIn?.dailyEntries)
    .filter((entry) => inPeriod(entry, range, analysisDate || range.end))
  const weights = safeArray(input.weights || input.healthSnapshot?.weight?.dailyWeights)
    .filter((entry) => inPeriod(entry, range, analysisDate || range.end))
  const mealDays = groupDayTotals(meals, 'meals')
  const checkInDays = groupDayTotals(checkIns, 'energy')
  const weightDays = groupDayTotals(weights, 'weight')
  const patterns = [
    buildConsistencyPattern(meals, 'meals', 'nutrition', period, expectedDays),
    buildWeekdayPattern(meals, 'protein', 'nutrition', period, expectedDays),
    buildTimeOfDayPattern(meals, 'nutrition', period, expectedDays),
    buildConsistencyPattern(checkIns, 'energy', 'activity', period, expectedDays),
    buildWeekdayPattern(checkIns, 'steps', 'activity', period, expectedDays),
    buildTimeOfDayPattern(checkIns, 'activity', period, expectedDays),
    buildConsistencyPattern(weights, 'weight', 'weight', period, expectedDays),
    ...buildActionPatterns(input, { ...options, analysisDate }, period),
  ]
  const visible = patterns
    .map((pattern) => pattern.sampleSize <= 1 && pattern.eligibility !== 'blocked'
      ? { ...pattern, eligibility: 'insufficient', limitations: [...pattern.limitations, 'Enstaka datapunkt visas inte som säkert mönster.'] }
      : pattern)
    .filter((pattern, index, list) => list.findIndex((item) => item.id === pattern.id) === index)
    .sort((first, second) =>
      (second.eligibility === 'supported') - (first.eligibility === 'supported') ||
      second.confidence - first.confidence ||
      second.coverage - first.coverage ||
      first.id.localeCompare(second.id))

  if (!mealDays.length && !checkInDays.length && !weightDays.length) {
    return {
      analysisDate: analysisDate || range.end,
      coverage: { actualDays: 0, expectedDays, ratio: 0 },
      patterns: [createPattern({
        category: 'coverage',
        coverage: 0,
        eligibility: 'insufficient',
        evidence: ['Ingen vikt-, måltids- eller check-in-data i perioden.'],
        patternType: 'insufficientData',
        period,
        recommendedResponse: 'Börja med en liten registrering.',
        sampleSize: 0,
        textualSummary: 'Underlaget är ännu för litet för coachmönster.',
      })],
      sourceStatus: 'derivedOnly',
    }
  }

  return {
    analysisDate: analysisDate || range.end,
    coverage: {
      actualDays: new Set([...mealDays, ...checkInDays, ...weightDays].map((day) => day.date)).size,
      expectedDays,
      ratio: round(new Set([...mealDays, ...checkInDays, ...weightDays].map((day) => day.date)).size / expectedDays),
    },
    patterns: visible,
    sourceStatus: 'derivedOnly',
  }
}

export function buildAdaptiveCoachPatternSummary(input = {}, options = {}) {
  const result = buildAdaptiveCoachPatterns(input, options)
  const supported = result.patterns.filter((pattern) => pattern.eligibility === 'supported')
  const tentative = result.patterns.filter((pattern) => pattern.eligibility === 'tentative')
  const insufficient = result.patterns.filter((pattern) => pattern.eligibility === 'insufficient')
  const primary = supported[0] || tentative[0] || result.patterns[0] || null

  return {
    analysisDate: result.analysisDate,
    coverage: result.coverage,
    insufficientCount: insufficient.length,
    primaryPattern: primary,
    sourceStatus: result.sourceStatus,
    supportedCount: supported.length,
    tentativeCount: tentative.length,
    topPatterns: result.patterns.slice(0, 3),
    text: primary?.textualSummary || 'Underlaget är ännu för litet för coachmönster.',
  }
}

export const adaptiveCoachPatternInternals = {
  createPattern,
  groupDayTotals,
  isActualMeal,
  safeObject,
}
