import { calculateDailyNutritionSummary } from './dailyNutritionSummary.js'
import { buildMealTimeline } from './mealTimeline.js'
import { normalizeNutritionGoals, parseProteinGoal } from './nutritionGoals.js'

const weekDayNames = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']

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

function addDays(dateText, amount) {
  const date = parseDate(`${dateText}T12:00:00`) || new Date()

  date.setDate(date.getDate() + amount)

  return localDateString(date)
}

function getMealDate(meal) {
  const rawDate = String(meal?.date || '')

  if (rawDate.includes('T')) {
    const date = parseDate(rawDate)

    return date ? localDateString(date) : ''
  }

  const dateText = rawDate.slice(0, 10)

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText

  const fallback = parseDate(meal?.createdAt || meal?.timestamp)

  return fallback ? localDateString(fallback) : ''
}

function getWeekStart(dateText = localDateString()) {
  const date = parseDate(`${String(dateText).slice(0, 10)}T12:00:00`) || new Date()
  const day = date.getDay() || 7

  date.setDate(date.getDate() - day + 1)

  return localDateString(date)
}

function getWeekEnd(startDate) {
  return addDays(startDate, 6)
}

function getWeekDates(startDate) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index))
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function round(value) {
  return Math.round(safeNumber(value))
}

function normalizeMealText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

function isFutureDate(dateText, today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && dateText > today
}

export function getWeeklyNutritionRange(dateText = localDateString()) {
  const startDate = getWeekStart(dateText)

  return {
    dates: getWeekDates(startDate),
    endDate: getWeekEnd(startDate),
    startDate,
  }
}

export function classifyDailyGoalProgress(value, goal, options = {}) {
  const target = Number.isFinite(goal?.target) ? goal.target : Number(goal)

  if (!options.hasData || !Number.isFinite(target) || target <= 0) {
    return null
  }

  const ratio = safeNumber(value) / target
  const type = options.type || 'macro'

  if (type === 'calories') {
    if (ratio < 0.85) return { label: 'Under mål', status: 'under' }
    if (ratio <= 1.05) return { label: 'Nära mål', status: 'near' }
    if (ratio <= 1.18) return { label: 'Målet uppnått', status: 'reached' }
    return { label: 'Över mål', status: 'over' }
  }

  return ratio >= 1
    ? { label: 'Uppnått', status: 'reached' }
    : { label: 'Ej uppnått', status: 'under' }
}

export function classifyWeeklyDataCoverage(registeredDays) {
  const count = Math.max(0, Math.min(7, Number(registeredDays) || 0))

  if (count === 7) return { label: 'Fullständig registrering', level: 'complete', registeredDays: count }
  if (count >= 4) return { label: 'Delvis registrering', level: 'partial', registeredDays: count }
  if (count >= 1) return { label: 'Begränsad registrering', level: 'limited', registeredDays: count }
  return { label: 'Ingen registrering', level: 'none', registeredDays: count }
}

export function buildDailyNutritionBreakdown({
  date,
  index = 0,
  meals = [],
  nutritionGoals = {},
  today = localDateString(),
} = {}) {
  const normalizedGoals = normalizeNutritionGoals(nutritionGoals)
  const safeMeals = (Array.isArray(meals) ? meals : [])
    .filter((meal) => isObject(meal) && getMealDate(meal) === date && !isFutureDate(date, today))
  const summary = calculateDailyNutritionSummary(safeMeals, date, {
    nutritionGoals: normalizedGoals,
  })
  const hasData = summary.mealCount > 0
  const proteinGoal = parseProteinGoal(normalizedGoals.protein)
  const caloriesGoal = Number.isFinite(normalizedGoals.calories) ? normalizedGoals.calories : null
  const timeline = buildMealTimeline(safeMeals, date, {
    proteinGoal: normalizedGoals.protein,
  })

  return {
    caloriesGoalStatus: classifyDailyGoalProgress(summary.totals.calories, caloriesGoal, {
      hasData,
      type: 'calories',
    }),
    date,
    dayName: weekDayNames[index] || '',
    hasData,
    mealCount: summary.mealCount,
    proteinGoalStatus: classifyDailyGoalProgress(summary.totals.protein, proteinGoal, {
      hasData,
      type: 'protein',
    }),
    summary,
    timeline,
    totals: summary.totals,
  }
}

function sumDays(days, field) {
  return days.reduce((sum, day) => sum + safeNumber(day.totals[field]), 0)
}

function average(value, divisor) {
  return divisor > 0 ? value / divisor : 0
}

function findDay(days, selector) {
  return days
    .filter((day) => day.hasData)
    .sort((first, second) => selector(second) - selector(first))[0] || null
}

function buildMealPatterns(days) {
  const typeCounts = new Map()
  const typeDays = new Map()
  const textCounts = new Map()
  let lateMeals = 0
  let longGaps = 0
  let vegetableDays = 0

  days.forEach((day) => {
    if (!day.hasData) return

    let hasVegetables = false

    day.timeline.entries.forEach((entry) => {
      const type = normalizeMealText(entry.mealType || entry.analysis?.mealType || 'måltid')
      const text = normalizeMealText(entry.text)

      if (type) {
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
        if (!typeDays.has(type)) typeDays.set(type, new Set())
        typeDays.get(type).add(day.date)
      }

      if (text) {
        textCounts.set(text, (textCounts.get(text) || 0) + 1)
      }

      if (/kvällsmål|nattmål/.test(type) || String(entry.time || '') >= '21:00') lateMeals += 1
      if (entry.analysis?.flags?.containsVegetables) hasVegetables = true
    })

    if (hasVegetables) vegetableDays += 1

    const times = day.timeline.entries
      .map((entry) => String(entry.time || ''))
      .filter((time) => /^\d{2}:\d{2}$/.test(time))
      .sort()
      .map((time) => {
        const [hours, minutes] = time.split(':').map(Number)

        return hours * 60 + minutes
      })

    for (let index = 1; index < times.length; index += 1) {
      if (times[index] - times[index - 1] >= 6 * 60) longGaps += 1
    }
  })

  const mostCommonMealType = [...typeCounts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], 'sv-SE'))[0]
  const recurringMealText = [...textCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], 'sv-SE'))[0]

  const dayCountForType = (type) => typeDays.get(type)?.size || 0

  return {
    breakfastDays: dayCountForType('frukost'),
    dinnerDays: dayCountForType('middag'),
    lateMeals,
    longGaps,
    lunchDays: dayCountForType('lunch'),
    mostCommonMealType: mostCommonMealType
      ? { count: mostCommonMealType[1], type: mostCommonMealType[0] }
      : null,
    recurringMealText: recurringMealText
      ? { count: recurringMealText[1], text: recurringMealText[0] }
      : null,
    vegetableDays,
  }
}

export function buildWeeklyNutritionSummary({
  date = localDateString(),
  meals = [],
  nutritionGoals = {},
  today = localDateString(),
} = {}) {
  const range = getWeeklyNutritionRange(date)
  const safeMeals = Array.isArray(meals) ? meals : []
  const days = range.dates.map((dayDate, index) =>
    buildDailyNutritionBreakdown({
      date: dayDate,
      index,
      meals: safeMeals,
      nutritionGoals,
      today,
    }))
  const registeredDays = days.filter((day) => day.hasData).length
  const totals = {
    calories: sumDays(days, 'calories'),
    carbs: sumDays(days, 'carbs'),
    fat: sumDays(days, 'fat'),
    fiber: sumDays(days, 'fiber'),
    protein: sumDays(days, 'protein'),
  }
  const mealCount = days.reduce((sum, day) => sum + day.mealCount, 0)
  const analyzedMealCount = days.reduce((sum, day) => sum + (day.summary.analyzedMeals || []).filter((entry) => entry.analysis.items.length > 0).length, 0)
  const partiallyAnalyzedMealCount = days.reduce((sum, day) => sum + day.summary.partiallyAnalyzedMealCount, 0)
  const mostProteinDay = findDay(days, (day) => day.totals.protein)
  const highestCalorieDay = findDay(days, (day) => day.totals.calories)
  const lowestLoggedDay = days
    .filter((day) => day.hasData)
    .sort((first, second) => first.totals.calories - second.totals.calories)[0] || null

  return {
    analyzedMealCount,
    averages: {
      caloriesPerCalendarDay: average(totals.calories, 7),
      caloriesPerRegisteredDay: average(totals.calories, registeredDays),
      carbsPerCalendarDay: average(totals.carbs, 7),
      carbsPerRegisteredDay: average(totals.carbs, registeredDays),
      fatPerCalendarDay: average(totals.fat, 7),
      fatPerRegisteredDay: average(totals.fat, registeredDays),
      fiberPerCalendarDay: average(totals.fiber, 7),
      fiberPerRegisteredDay: average(totals.fiber, registeredDays),
      mealsPerRegisteredDay: average(mealCount, registeredDays),
      proteinPerCalendarDay: average(totals.protein, 7),
      proteinPerRegisteredDay: average(totals.protein, registeredDays),
    },
    calorieGoalDays: days.filter((day) => ['near', 'reached'].includes(day.caloriesGoalStatus?.status)).length,
    coverage: classifyWeeklyDataCoverage(registeredDays),
    days,
    endDate: range.endDate,
    highestCalorieDay,
    lowestLoggedDay,
    mealCount,
    mostProteinDay,
    partiallyAnalyzedMealCount,
    patterns: buildMealPatterns(days),
    proteinGoalDays: days.filter((day) => day.proteinGoalStatus?.status === 'reached').length,
    registeredDays,
    startDate: range.startDate,
    totals,
  }
}

export function compareNutritionWeeks(currentWeek, previousWeek) {
  if (!currentWeek || !previousWeek || currentWeek.registeredDays < 2 || previousWeek.registeredDays < 2) {
    return {
      hasComparison: false,
      reasons: ['För lite registrerad data för en rättvis veckojämförelse.'],
      text: [],
    }
  }

  const text = []

  text.push(`Du registrerade mat ${currentWeek.registeredDays} dagar denna vecka jämfört med ${previousWeek.registeredDays} dagar föregående vecka.`)
  text.push(`Genomsnittligt protein var cirka ${round(currentWeek.averages.proteinPerRegisteredDay)} g jämfört med ${round(previousWeek.averages.proteinPerRegisteredDay)} g per registrerad dag.`)
  text.push(`Genomsnittliga kalorier var cirka ${round(currentWeek.averages.caloriesPerRegisteredDay)} kcal jämfört med ${round(previousWeek.averages.caloriesPerRegisteredDay)} kcal per registrerad dag.`)

  return {
    caloriesDifference: round(currentWeek.averages.caloriesPerRegisteredDay - previousWeek.averages.caloriesPerRegisteredDay),
    hasComparison: true,
    mealCountDifference: currentWeek.mealCount - previousWeek.mealCount,
    proteinDifference: round(currentWeek.averages.proteinPerRegisteredDay - previousWeek.averages.proteinPerRegisteredDay),
    registeredDaysDifference: currentWeek.registeredDays - previousWeek.registeredDays,
    text,
  }
}

export function buildWeeklyNutritionInsights(summary, comparison = null) {
  if (!summary) return []

  const insights = []

  if (summary.registeredDays < 7) {
    insights.push(`Du registrerade måltider under ${summary.registeredDays} av veckans 7 dagar, så veckosummeringen är ofullständig.`)
  } else {
    insights.push('Du registrerade måltider under alla veckans 7 dagar.')
  }

  if (summary.registeredDays > 0 && summary.proteinGoalDays > 0) {
    insights.push(`Proteinmålet nåddes under ${summary.proteinGoalDays} registrerade dagar.`)
  }

  if (summary.patterns.mostCommonMealType) {
    insights.push(`${summary.patterns.mostCommonMealType.type} var den vanligaste registrerade måltidstypen.`)
  }

  if (summary.patterns.vegetableDays > 0) {
    insights.push(`Identifierade grönsaker registrerades under ${summary.patterns.vegetableDays} av ${summary.registeredDays} registrerade dagar.`)
  }

  if (summary.patterns.longGaps > 0) {
    insights.push(`${summary.patterns.longGaps} dagar eller tillfällen innehöll långa uppehåll mellan måltider.`)
  }

  if (comparison?.hasComparison && comparison.proteinDifference !== 0) {
    insights.push(`Proteinintaget skiljde sig med cirka ${Math.abs(comparison.proteinDifference)} g per registrerad dag jämfört med föregående vecka.`)
  }

  return insights.slice(0, 4)
}

export function buildNextWeekNutritionFocus(summary) {
  if (!summary) return []

  const focus = []

  if (summary.coverage.level !== 'complete') {
    focus.push('Fortsätt registrera lunch och middag för en tydligare veckobild.')
  }

  if (summary.proteinGoalDays < Math.max(1, Math.floor(summary.registeredDays * 0.6)) && summary.registeredDays >= 2) {
    focus.push('Ett proteinrikt frukost- eller lunchalternativ kan göra fördelningen jämnare.')
  }

  if (summary.patterns.longGaps > 0) {
    focus.push('Planera ett enkelt mellanmål på dagar med långa måltidsuppehåll.')
  }

  if (summary.mealCount >= 8) {
    focus.push('Använd dina måltidsmallar för att registrera återkommande måltider snabbare.')
  }

  return focus.slice(0, 3)
}

export function buildWeeklyNutritionTextSummary(summary) {
  if (!summary) return ''

  const lines = [
    `Vecka ${summary.startDate} till ${summary.endDate}`,
    `Registrerade dagar: ${summary.registeredDays} av 7`,
  ]

  if (summary.registeredDays > 0) {
    lines.push(`Protein i genomsnitt: cirka ${round(summary.averages.proteinPerRegisteredDay)} g per registrerad dag`)
    lines.push(`Kalorier i genomsnitt: cirka ${round(summary.averages.caloriesPerRegisteredDay)} kcal per registrerad dag`)
  }

  if (summary.proteinGoalDays > 0) lines.push(`Proteinmål uppnått: ${summary.proteinGoalDays} dagar`)
  if (summary.mostProteinDay) lines.push(`Mest protein: ${summary.mostProteinDay.dayName.toLocaleLowerCase('sv-SE')}, cirka ${round(summary.mostProteinDay.totals.protein)} g`)

  return lines.join('\n')
}

export function buildWeeklyNutritionReport(options = {}) {
  const current = buildWeeklyNutritionSummary(options)
  const previous = buildWeeklyNutritionSummary({
    ...options,
    date: addDays(current.startDate, -7),
  })
  const comparison = compareNutritionWeeks(current, previous)

  return {
    comparison,
    focus: buildNextWeekNutritionFocus(current),
    insights: buildWeeklyNutritionInsights(current, comparison),
    previous,
    summary: current,
    textSummary: buildWeeklyNutritionTextSummary(current),
  }
}

export const weeklyNutritionInternals = {
  addDays,
  getMealDate,
  getWeekDates,
  getWeekEnd,
  getWeekStart,
  localDateString,
}
