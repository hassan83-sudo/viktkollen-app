import { calculateDailyNutritionSummary } from './dailyNutritionSummary.js'
import { buildNutritionDataQualitySummary } from './nutritionConfidence.js'
import {
  buildWeeklyNutritionSummary,
  classifyDailyGoalProgress,
  weeklyNutritionInternals,
} from './weeklyNutritionSummary.js'
import { normalizeNutritionGoals, parseProteinGoal } from './nutritionGoals.js'

const monthNames = [
  'Januari',
  'Februari',
  'Mars',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'Augusti',
  'September',
  'Oktober',
  'November',
  'December',
]

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function monthStart(year, month) {
  return `${year}-${pad(month)}-01`
}

function getMonthDate(value = localDateString()) {
  const date = parseDate(`${String(value).slice(0, 10)}T12:00:00`) || new Date()
  return { month: date.getMonth() + 1, year: date.getFullYear() }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function addMonths(dateText, amount) {
  const { month, year } = getMonthDate(dateText)
  const date = new Date(year, month - 1 + amount, 1, 12)
  return localDateString(date)
}

function getMealDate(meal) {
  const raw = String(meal?.date || '')
  if (raw.includes('T')) {
    const date = parseDate(raw)
    return date ? localDateString(date) : ''
  }
  const dateText = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText
  const fallback = parseDate(meal?.createdAt || meal?.timestamp)
  return fallback ? localDateString(fallback) : ''
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function round(value) {
  return Math.round(safeNumber(value))
}

function average(value, divisor) {
  return divisor > 0 ? value / divisor : 0
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('sv-SE')
}

function getMealType(meal, summaryEntry) {
  return normalizeText(meal?.type || meal?.mealType || summaryEntry?.analysis?.mealType || 'måltid')
}

function getWeightDate(entry) {
  const raw = String(entry?.date || entry?.createdAt || '')
  if (raw.includes('T')) {
    const date = parseDate(raw)
    return date ? localDateString(date) : ''
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) ? raw.slice(0, 10) : ''
}

function getWeightValue(entry) {
  const parsed = Number(String(entry?.weight ?? entry?.value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 25 && parsed <= 350 ? parsed : null
}

function standardDeviation(values) {
  if (!values.length) return 0
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

export function getMonthlyNutritionRange(dateText = localDateString(), today = localDateString()) {
  const { month, year } = getMonthDate(dateText)
  const calendarDays = daysInMonth(year, month)
  const startDate = monthStart(year, month)
  const endDate = `${year}-${pad(month)}-${pad(calendarDays)}`
  const currentMonth = today.slice(0, 7) === startDate.slice(0, 7)
  const futureMonth = startDate.slice(0, 7) > today.slice(0, 7)
  const elapsedDays = futureMonth
    ? 0
    : currentMonth
      ? Math.min(calendarDays, Number(today.slice(8, 10)))
      : calendarDays

  return {
    calendarDays,
    currentMonth,
    dates: Array.from({ length: calendarDays }, (_, index) => `${year}-${pad(month)}-${pad(index + 1)}`),
    elapsedDays,
    endDate,
    futureMonth,
    label: `${monthNames[month - 1]} ${year}`,
    month,
    startDate,
    year,
  }
}

export function classifyMonthlyDataCoverage(registeredDays, possibleDays, isCurrentMonth = false) {
  const possible = Math.max(0, Number(possibleDays) || 0)
  const count = Math.max(0, Math.min(possible || 31, Number(registeredDays) || 0))
  const ratio = possible > 0 ? count / possible : 0

  if (count === 0) return { label: 'Ingen registrering', level: 'none', possibleDays: possible, registeredDays: count }
  if (ratio < 0.25) return { label: 'Begränsad registrering', level: 'limited', possibleDays: possible, registeredDays: count }
  if (ratio < 0.55) return { label: 'Delvis registrering', level: 'partial', possibleDays: possible, registeredDays: count }
  if (ratio < 0.85) return { label: 'God registrering', level: 'good', possibleDays: possible, registeredDays: count }
  return {
    label: isCurrentMonth ? 'Nästan fullständig registrering' : 'Nästan fullständig registrering',
    level: 'near_complete',
    possibleDays: possible,
    registeredDays: count,
  }
}

export function buildMonthlyDailyBreakdown({
  date = localDateString(),
  meals = [],
  nutritionGoals = {},
  today = localDateString(),
} = {}) {
  const range = getMonthlyNutritionRange(date, today)
  const goals = normalizeNutritionGoals(nutritionGoals)
  const proteinGoal = parseProteinGoal(goals.protein)
  const caloriesGoal = Number.isFinite(goals.calories) ? goals.calories : null
  const safeMeals = Array.isArray(meals) ? meals : []

  return range.dates.map((dayDate) => {
    const isFuture = dayDate > today
    const dayMeals = safeMeals.filter((meal) => isObject(meal) && getMealDate(meal) === dayDate && !isFuture)
    const summary = calculateDailyNutritionSummary(dayMeals, dayDate, { nutritionGoals: goals })
    const hasData = summary.mealCount > 0

    return {
      caloriesGoalStatus: classifyDailyGoalProgress(summary.totals.calories, caloriesGoal, { hasData, type: 'calories' }),
      date: dayDate,
      dayOfMonth: Number(dayDate.slice(8, 10)),
      hasData,
      isFuture,
      mealCount: summary.mealCount,
      proteinGoalStatus: classifyDailyGoalProgress(summary.totals.protein, proteinGoal, { hasData, type: 'protein' }),
      summary,
      totals: summary.totals,
    }
  })
}

function buildMonthlyWeeklyBreakdown({ date, meals, nutritionGoals, today }) {
  const range = getMonthlyNutritionRange(date, today)
  const weekStarts = [...new Set(range.dates.map((day) => weeklyNutritionInternals.getWeekStart(day)))]

  return weekStarts.map((weekStart) => {
    const week = buildWeeklyNutritionSummary({ date: weekStart, meals, nutritionGoals, today })
    const monthDays = week.days.filter((day) => day.date >= range.startDate && day.date <= range.endDate)
    const registeredDays = monthDays.filter((day) => day.hasData).length
    const mealCount = monthDays.reduce((sum, day) => sum + day.mealCount, 0)
    const protein = monthDays.reduce((sum, day) => sum + safeNumber(day.totals.protein), 0)
    const calories = monthDays.reduce((sum, day) => sum + safeNumber(day.totals.calories), 0)

    return {
      caloriesAverage: average(calories, registeredDays),
      coverage: classifyMonthlyDataCoverage(registeredDays, monthDays.filter((day) => day.date <= today).length),
      endDate: week.endDate,
      mealCount,
      proteinAverage: average(protein, registeredDays),
      proteinGoalDays: monthDays.filter((day) => day.proteinGoalStatus?.status === 'reached').length,
      registeredDays,
      startDate: week.startDate,
      week,
    }
  })
}

function buildPatterns(dailyBreakdown) {
  const typeCounts = new Map()
  const typeDays = new Map()
  const textCounts = new Map()
  const proteinValues = []
  const calorieValues = []
  let lateMeals = 0
  let longGaps = 0

  dailyBreakdown.forEach((day) => {
    if (!day.hasData) return
    proteinValues.push(day.totals.protein)
    calorieValues.push(day.totals.calories)

    const times = []
    day.summary.analyzedMeals.forEach((entry) => {
      const meal = entry.meal || {}
      const type = getMealType(meal, entry)
      const text = normalizeText([meal.name, meal.description, meal.text].filter(Boolean).join(' '))

      if (type) {
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
        if (!typeDays.has(type)) typeDays.set(type, new Set())
        typeDays.get(type).add(day.date)
      }
      if (text) textCounts.set(text, (textCounts.get(text) || 0) + 1)
      if (/kvällsmål|nattmål/.test(type) || String(meal.time || '') >= '21:00') lateMeals += 1
      if (/^\d{2}:\d{2}$/.test(String(meal.time || ''))) {
        const [hours, minutes] = meal.time.split(':').map(Number)
        times.push(hours * 60 + minutes)
      }
    })

    times.sort((first, second) => first - second)
    for (let index = 1; index < times.length; index += 1) {
      if (times[index] - times[index - 1] >= 360) longGaps += 1
    }
  })

  const mostCommonMealType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv-SE'))[0]
  const recurringMeal = [...textCounts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1])[0]
  const typeDayCount = (type) => typeDays.get(type)?.size || 0

  return {
    breakfastDays: typeDayCount('frukost'),
    calorieConsistency: standardDeviation(calorieValues),
    dinnerDays: typeDayCount('middag'),
    lateMeals,
    longGaps,
    lunchDays: typeDayCount('lunch'),
    mostCommonMealType: mostCommonMealType ? { count: mostCommonMealType[1], type: mostCommonMealType[0] } : null,
    mostUsedTemplate: null,
    proteinConsistency: standardDeviation(proteinValues),
    recurringMeal: recurringMeal ? { count: recurringMeal[1], text: recurringMeal[0] } : null,
  }
}

function findDay(days, selector) {
  return days.filter((day) => day.hasData).sort((a, b) => selector(b) - selector(a))[0] || null
}

export function buildMonthlyNutritionSummary({
  date = localDateString(),
  meals = [],
  nutritionGoals = {},
  today = localDateString(),
  weights = [],
} = {}) {
  const range = getMonthlyNutritionRange(date, today)
  const dailyBreakdown = buildMonthlyDailyBreakdown({ date, meals, nutritionGoals, today })
  const registeredDays = dailyBreakdown.filter((day) => day.hasData).length
  const totals = {
    calories: dailyBreakdown.reduce((sum, day) => sum + safeNumber(day.totals.calories), 0),
    carbs: dailyBreakdown.reduce((sum, day) => sum + safeNumber(day.totals.carbs), 0),
    fat: dailyBreakdown.reduce((sum, day) => sum + safeNumber(day.totals.fat), 0),
    fiber: dailyBreakdown.reduce((sum, day) => sum + safeNumber(day.totals.fiber), 0),
    protein: dailyBreakdown.reduce((sum, day) => sum + safeNumber(day.totals.protein), 0),
  }
  const mealCount = dailyBreakdown.reduce((sum, day) => sum + day.mealCount, 0)
  const quality = buildNutritionDataQualitySummary(dailyBreakdown.flatMap((day) => day.summary.analyzedMeals || []))
  const weeklyBreakdown = buildMonthlyWeeklyBreakdown({ date, meals, nutritionGoals, today })
  const summary = {
    averages: {
      caloriesPerCalendarDay: average(totals.calories, range.elapsedDays || range.calendarDays),
      caloriesPerRegisteredDay: average(totals.calories, registeredDays),
      mealsPerRegisteredDay: average(mealCount, registeredDays),
      proteinPerCalendarDay: average(totals.protein, range.elapsedDays || range.calendarDays),
      proteinPerRegisteredDay: average(totals.protein, registeredDays),
    },
    calendarDays: range.calendarDays,
    calorieGoalDays: dailyBreakdown.filter((day) => ['near', 'reached'].includes(day.caloriesGoalStatus?.status)).length,
    coverage: classifyMonthlyDataCoverage(registeredDays, range.elapsedDays, range.currentMonth),
    dailyBreakdown,
    elapsedDays: range.elapsedDays,
    endDate: range.endDate,
    goals: normalizeNutritionGoals(nutritionGoals),
    highestCalorieDay: findDay(dailyBreakdown, (day) => day.totals.calories),
    label: range.label,
    mealCount,
    month: range.month,
    mostProteinDay: findDay(dailyBreakdown, (day) => day.totals.protein),
    patterns: null,
    proteinGoalDays: dailyBreakdown.filter((day) => day.proteinGoalStatus?.status === 'reached').length,
    quality,
    registeredDays,
    startDate: range.startDate,
    totals,
    weeklyBreakdown,
    weightRelation: null,
    year: range.year,
  }

  summary.patterns = buildPatterns(dailyBreakdown)
  summary.weightRelation = buildMonthlyWeightNutritionRelation(summary, weights, today)
  summary.insights = buildMonthlyNutritionInsights(summary)
  summary.nextMonthFocus = buildNextMonthNutritionFocus(summary)

  return summary
}

export function compareNutritionMonths(current, previous) {
  if (!current || !previous || current.registeredDays < 3 || previous.registeredDays < 3) {
    return {
      hasComparison: false,
      reasons: ['För lite registrerad data för en meningsfull månadsjämförelse.'],
      text: [],
    }
  }

  return {
    calorieAverageDifference: round(current.averages.caloriesPerRegisteredDay - previous.averages.caloriesPerRegisteredDay),
    hasComparison: true,
    mealCountDifference: current.mealCount - previous.mealCount,
    proteinAverageDifference: round(current.averages.proteinPerRegisteredDay - previous.averages.proteinPerRegisteredDay),
    registeredDaysDifference: current.registeredDays - previous.registeredDays,
    text: [
      `Du registrerade mat under ${current.registeredDays} dagar denna månad, jämfört med ${previous.registeredDays} dagar föregående månad.`,
      `Genomsnittligt protein låg på cirka ${round(current.averages.proteinPerRegisteredDay)} g per registrerad dag, jämfört med ${round(previous.averages.proteinPerRegisteredDay)} g föregående månad.`,
      `Genomsnittliga kalorier låg på cirka ${round(current.averages.caloriesPerRegisteredDay)} kcal per registrerad dag, jämfört med ${round(previous.averages.caloriesPerRegisteredDay)} kcal föregående månad.`,
    ],
  }
}

export function buildMonthlyWeightNutritionRelation(monthSummary, weightLog = [], today = localDateString()) {
  if (!monthSummary) return null
  const weights = (Array.isArray(weightLog) ? weightLog : [])
    .map((entry) => ({ date: getWeightDate(entry), value: getWeightValue(entry) }))
    .filter((entry) => entry.date && entry.date <= today && entry.date >= monthSummary.startDate && entry.date <= monthSummary.endDate && Number.isFinite(entry.value))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!weights.length) {
    return {
      hasData: false,
      text: 'Ingen giltig viktdata finns för månaden.',
      weightCount: 0,
    }
  }

  const first = weights[0]
  const last = weights.at(-1)
  const change = Number((last.value - first.value).toFixed(1))

  return {
    change,
    endWeight: last.value,
    hasData: true,
    limited: weights.length < 3,
    startWeight: first.value,
    text: weights.length < 2
      ? `Månaden har ${weights.length} viktregistrering och bör tolkas försiktigt.`
      : `Vikten förändrades från ${first.value.toLocaleString('sv-SE')} kg till ${last.value.toLocaleString('sv-SE')} kg under perioden. Underlaget visar en förändring men kan inte avgöra orsaken.`,
    weightCount: weights.length,
  }
}

export function buildMonthlyNutritionInsights(summary, comparison = null) {
  if (!summary) return []
  const insights = []
  insights.push(`Du registrerade måltider under ${summary.registeredDays} av ${summary.elapsedDays} möjliga dagar.`)
  if (summary.registeredDays > 0 && summary.proteinGoalDays > 0) insights.push(`Proteinmålet nåddes under ${summary.proteinGoalDays} registrerade dagar.`)
  if (summary.patterns.proteinConsistency > 0 && summary.registeredDays >= 4) insights.push('Proteinintaget varierade mellan registrerade dagar, så en jämnare fördelning kan göra månaden lättare att läsa.')
  if (summary.patterns.mostCommonMealType) insights.push(`${summary.patterns.mostCommonMealType.type} var den vanligaste måltidstypen.`)
  if (summary.patterns.longGaps > 0) insights.push('Flera registrerade dagar innehöll långa uppehåll mellan måltider.')
  if (summary.quality?.reviewMealCount > 0) insights.push(`${summary.quality.reviewMealCount} måltider hade begränsat underlag och kan behöva kompletteras.`)
  if (comparison?.hasComparison) insights.push(comparison.text[0])
  if (summary.weightRelation?.limited) insights.push(`Månadens viktdata består av ${summary.weightRelation.weightCount} registreringar och bör tolkas försiktigt.`)
  return insights.slice(0, 5)
}

export function buildNextMonthNutritionFocus(summary) {
  if (!summary) return []
  const focus = []
  if (!['good', 'near_complete'].includes(summary.coverage.level)) focus.push('Registrera åtminstone en måltid fler dagar för tydligare månadsmönster.')
  if (summary.mealCount >= 8) focus.push('Använd Quick Add eller måltidsmallar för återkommande måltider.')
  if (summary.patterns.longGaps > 0) focus.push('Planera ett enkelt mellanmål på dagar med långa måltidsuppehåll.')
  if (summary.proteinGoalDays < Math.max(1, Math.floor(summary.registeredDays * 0.6)) && summary.registeredDays >= 4) focus.push('Fördela proteinet jämnare mellan lunch och middag.')
  return focus.slice(0, 4)
}

export function buildMonthlyTextReport(summary, comparison = null) {
  if (!summary) return ''
  const lines = [
    summary.label,
    `Registrerade dagar: ${summary.registeredDays} av ${summary.elapsedDays}`,
    `Måltider: ${summary.mealCount}`,
  ]
  if (summary.registeredDays > 0) {
    lines.push(`Protein i genomsnitt: cirka ${round(summary.averages.proteinPerRegisteredDay)} g per registrerad dag`)
    lines.push(`Kalorier i genomsnitt: cirka ${round(summary.averages.caloriesPerRegisteredDay)} kcal per registrerad dag`)
  }
  if (summary.proteinGoalDays > 0) lines.push(`Proteinmål uppnått: ${summary.proteinGoalDays} dagar`)
  if (summary.mostProteinDay) lines.push(`Mest protein: ${summary.mostProteinDay.date}, cirka ${round(summary.mostProteinDay.totals.protein)} g`)
  if (summary.weightRelation?.hasData && summary.weightRelation.weightCount >= 2) lines.push(`Viktförändring: ${summary.weightRelation.startWeight.toLocaleString('sv-SE')} kg till ${summary.weightRelation.endWeight.toLocaleString('sv-SE')} kg`)
  lines.push(`Datakvalitet: ${summary.coverage.label.toLocaleLowerCase('sv-SE')}`)
  if (summary.quality?.validMealCount > 0) {
    lines.push(`Underlag: ${summary.quality.analyzedCoverage}`)
    lines.push(`Kalorier: ${summary.quality.macroCoverage.calories.label}`)
    lines.push(`Protein: ${summary.quality.macroCoverage.protein.label}`)
  }
  if (comparison?.hasComparison) lines.push(comparison.text[0])
  if (summary.nextMonthFocus.length) {
    lines.push('', 'Fokus nästa månad:')
    summary.nextMonthFocus.forEach((item) => lines.push(`- ${item}`))
  }
  return lines.join('\n')
}

export function buildMonthlyNutritionReport(options = {}) {
  const summary = buildMonthlyNutritionSummary(options)
  const previous = buildMonthlyNutritionSummary({
    ...options,
    date: addMonths(summary.startDate, -1),
  })
  const comparison = compareNutritionMonths(summary, previous)
  return {
    comparison,
    previous,
    summary,
    textReport: buildMonthlyTextReport(summary, comparison),
  }
}

export function buildMonthlyExportPayload(report) {
  const quality = report?.summary?.quality

  return {
    app: 'Viktkollen',
    feature: 'monthly-nutrition-report',
    month: report?.summary?.startDate?.slice(0, 7) || '',
    quality: quality
      ? {
          analyzedCoverage: quality.analyzedCoverage,
          analyzedMealCount: quality.analyzedMealCount,
          calorieCoverage: quality.macroCoverage.calories.label,
          lowConfidenceMeals: quality.lowConfidenceMeals,
          manualMealCount: quality.manualMealCount,
          proteinCoverage: quality.macroCoverage.protein.label,
          reviewMealCount: quality.reviewMealCount,
          unanalyzedMealCount: quality.unanalyzedMealCount,
          validMealCount: quality.validMealCount,
        }
      : null,
    reportVersion: 1,
    summary: report?.summary || {},
  }
}

export const monthlyNutritionInternals = {
  addMonths,
  daysInMonth,
  getMealDate,
  getMonthDate,
  localDateString,
  monthNames,
}
