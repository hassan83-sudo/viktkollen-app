import { normalizeCheckInMetrics } from './checkInNormalization.js'
import {
  getUnifiedWeightFacts,
  getWeightStats,
  normalizeDailyWeightEntries,
} from './healthCalculations.js'
import {
  formatCalories,
  formatGrams,
  formatSteps,
  formatWeight,
  formatWeightChange,
} from './healthFormatting.js'
import {
  addLocalDays,
  getEntryLocalDate,
  getEntrySortTime,
  getLocalDateRange,
  getLocalDateString,
  isLocalDateInRange,
  latestEntryPerLocalDate,
  parseLocalDate,
} from './localDate.js'
import { calculateDailyNutritionSummary } from './nutrition/dailyNutritionSummary.js'
import {
  filterActualMealsForDate,
  getMealLocalDate,
  isPlannedMealRecord,
} from './nutrition/mealDateUtils.js'
import { normalizeNutritionGoals } from './nutrition/nutritionGoals.js'
import { analyzeWeights } from './progressService.js'

const technicalDisplayPattern = /\b(undefined|null|nan|infinity|true|false)\b|\[object object\]/i

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value)
}

function roundOne(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : value
}

function hasTechnicalDisplayValue(value) {
  if (typeof value !== 'string') return true

  return technicalDisplayPattern.test(value)
}

function sanitizeDisplayValue(value, fallback = 'Saknas') {
  if (typeof value !== 'string') return fallback

  const trimmed = value.trim()

  return trimmed && !technicalDisplayPattern.test(trimmed) ? trimmed : fallback
}

function sanitizeDisplayObject(value) {
  if (!isPlainObject(value)) return {}

  return Object.entries(value).reduce((display, [key, entry]) => ({
    ...display,
    [key]: isPlainObject(entry)
      ? sanitizeDisplayObject(entry)
      : sanitizeDisplayValue(entry),
  }), {})
}

function addError(errors, path, message) {
  errors.push({ message, path })
}

function validateDisplayObject(value, path, errors) {
  if (!isPlainObject(value)) {
    addError(errors, path, 'Displayfält ska vara ett objekt.')
    return
  }

  Object.entries(value).forEach(([key, entry]) => {
    const entryPath = `${path}.${key}`

    if (isPlainObject(entry)) {
      validateDisplayObject(entry, entryPath, errors)
      return
    }

    if (hasTechnicalDisplayValue(entry)) {
      addError(errors, entryPath, 'Displayfält får inte läcka tekniska värden.')
    }
  })
}

function validateNumberMap(value, path, errors) {
  if (!isPlainObject(value)) return

  Object.entries(value).forEach(([key, entry]) => {
    const entryPath = `${path}.${key}`

    if (typeof entry === 'number' && !Number.isFinite(entry)) {
      addError(errors, entryPath, 'Numeriska råvärden måste vara finita.')
    } else if (isPlainObject(entry)) {
      validateNumberMap(entry, entryPath, errors)
    } else if (Array.isArray(entry)) {
      entry.forEach((item, index) => validateNumberMap(item, `${entryPath}[${index}]`, errors))
    }
  })
}

function validateWeightSnapshot(weight, errors) {
  if (!isPlainObject(weight)) {
    addError(errors, 'weight', 'weight måste vara ett objekt.')
    return
  }

  ;['current', 'start', 'goal', 'totalChange', 'change7', 'change30', 'weeklyRate'].forEach((key) => {
    if (!isFiniteNumberOrNull(weight[key])) {
      addError(errors, `weight.${key}`, 'Värdet ska vara nummer eller null.')
    }
  })

  if (Number.isFinite(weight.current) && Number.isFinite(weight.start)) {
    const expected = roundOne(weight.current - weight.start)
    if (roundOne(weight.totalChange) !== expected) {
      addError(errors, 'weight.totalChange', 'totalChange måste vara current - start.')
    }
  }

  if (Number.isFinite(weight.current) && Number.isFinite(weight.goal)) {
    const expected = roundOne(weight.current - weight.goal)
    if (roundOne(weight.facts?.goalRemaining) !== expected) {
      addError(errors, 'weight.facts.goalRemaining', 'goalRemaining måste vara current - goal.')
    }
  }

  if (!Array.isArray(weight.dailyWeights)) {
    addError(errors, 'weight.dailyWeights', 'dailyWeights måste vara en array.')
  } else {
    weight.dailyWeights.forEach((entry, index) => {
      if (!Number.isFinite(entry?.value)) {
        addError(errors, `weight.dailyWeights[${index}].value`, 'Daglig vikt måste ha ett finit nummer.')
      }
    })
  }

  validateDisplayObject(weight.display, 'weight.display', errors)
  validateNumberMap(weight, 'weight', errors)
}

function validateNutritionSnapshot(nutrition, errors) {
  if (!isPlainObject(nutrition)) {
    addError(errors, 'nutrition', 'nutrition måste vara ett objekt.')
    return
  }

  if (!Array.isArray(nutrition.actualMeals)) {
    addError(errors, 'nutrition.actualMeals', 'actualMeals måste vara en array.')
  } else if (nutrition.actualMeals.some(isPlannedMealRecord)) {
    addError(errors, 'nutrition.actualMeals', 'Planerade måltider får inte finnas i faktiskt intag.')
  }

  if (!Array.isArray(nutrition.mealsToday)) {
    addError(errors, 'nutrition.mealsToday', 'mealsToday måste vara en array.')
  } else if (nutrition.mealCountToday !== nutrition.mealsToday.length) {
    addError(errors, 'nutrition.mealCountToday', 'mealCountToday måste matcha mealsToday.length.')
  }

  ;['caloriesToday', 'proteinToday', 'fiberToday', 'mealCountToday'].forEach((key) => {
    if (!Number.isFinite(nutrition[key]) || nutrition[key] < 0) {
      addError(errors, `nutrition.${key}`, 'Nutritionvärden måste vara finita och icke-negativa.')
    }
  })

  Object.entries(nutrition.progress || {}).forEach(([key, progress]) => {
    if (progress === null) return
    if (!isPlainObject(progress)) {
      addError(errors, `nutrition.progress.${key}`, 'Progress ska vara null eller objekt.')
      return
    }

    ;['value', 'goal', 'percentage', 'visualPercentage'].forEach((field) => {
      if (progress[field] !== null && progress[field] !== undefined && !Number.isFinite(progress[field])) {
        addError(errors, `nutrition.progress.${key}.${field}`, 'Progressvärden måste vara finita nummer eller null.')
      }
    })
  })

  validateDisplayObject(nutrition.display, 'nutrition.display', errors)
  validateNumberMap(nutrition, 'nutrition', errors)
}

function validateCheckInSnapshot(checkIn, snapshotDate, errors) {
  if (!isPlainObject(checkIn)) {
    addError(errors, 'checkIn', 'checkIn måste vara ett objekt.')
    return
  }

  if (checkIn.latestToday && getEntryLocalDate(checkIn.latestToday) !== snapshotDate) {
    addError(errors, 'checkIn.latestToday', 'latestToday måste ligga på snapshotens datum.')
  }

  if (!isFiniteNumberOrNull(checkIn.energy)) {
    addError(errors, 'checkIn.energy', 'Energi ska vara nummer eller null.')
  }
  if (!isFiniteNumberOrNull(checkIn.sleep)) {
    addError(errors, 'checkIn.sleep', 'Sömn ska vara nummer eller null.')
  }
  if (!isFiniteNumberOrNull(checkIn.steps)) {
    addError(errors, 'checkIn.steps', 'Steg ska vara nummer eller null.')
  }

  validateDisplayObject(checkIn.display, 'checkIn.display', errors)
  validateNumberMap(checkIn, 'checkIn', errors)
}

function validatePeriods(periods, date, errors) {
  if (!isPlainObject(periods)) {
    addError(errors, 'periods', 'periods måste vara ett objekt.')
    return
  }

  const expectedSevenStart = getLocalDateString(addLocalDays(date, -6))
  const expectedThirtyStart = getLocalDateString(addLocalDays(date, -29))

  if (periods.sevenDays?.end !== date || periods.sevenDays?.start !== expectedSevenStart || periods.sevenDays?.days !== 7) {
    addError(errors, 'periods.sevenDays', '7-dagarsperioden ska vara valt datum plus 6 föregående dagar.')
  }

  if (periods.thirtyDays?.end !== date || periods.thirtyDays?.start !== expectedThirtyStart || periods.thirtyDays?.days !== 30) {
    addError(errors, 'periods.thirtyDays', '30-dagarsperioden ska vara valt datum plus 29 föregående dagar.')
  }

  ;['sevenDays', 'thirtyDays'].forEach((key) => {
    if (!isFiniteNumberOrNull(periods[key]?.weightChange)) {
      addError(errors, `periods.${key}.weightChange`, 'Periodförändring ska vara nummer eller null.')
    }
    if (hasTechnicalDisplayValue(periods[key]?.weightChangeLabel)) {
      addError(errors, `periods.${key}.weightChangeLabel`, 'Perioddisplay får inte läcka tekniska värden.')
    }
  })
}

export function sanitizeHealthSnapshotDisplay(snapshot) {
  if (!isPlainObject(snapshot)) return snapshot

  return {
    ...snapshot,
    checkIn: snapshot.checkIn
      ? {
        ...snapshot.checkIn,
        display: sanitizeDisplayObject(snapshot.checkIn.display),
      }
      : snapshot.checkIn,
    display: sanitizeDisplayObject(snapshot.display),
    nutrition: snapshot.nutrition
      ? {
        ...snapshot.nutrition,
        display: sanitizeDisplayObject(snapshot.nutrition.display),
      }
      : snapshot.nutrition,
    periods: snapshot.periods
      ? {
        ...snapshot.periods,
        sevenDays: snapshot.periods.sevenDays
          ? {
            ...snapshot.periods.sevenDays,
            weightChangeLabel: sanitizeDisplayValue(snapshot.periods.sevenDays.weightChangeLabel),
          }
          : snapshot.periods.sevenDays,
        thirtyDays: snapshot.periods.thirtyDays
          ? {
            ...snapshot.periods.thirtyDays,
            weightChangeLabel: sanitizeDisplayValue(snapshot.periods.thirtyDays.weightChangeLabel),
          }
          : snapshot.periods.thirtyDays,
      }
      : snapshot.periods,
    weight: snapshot.weight
      ? {
        ...snapshot.weight,
        display: sanitizeDisplayObject(snapshot.weight.display),
      }
      : snapshot.weight,
  }
}

export function validateHealthSnapshot(snapshot) {
  const errors = []

  if (!isPlainObject(snapshot)) {
    return {
      errors: [{ message: 'Snapshot måste vara ett objekt.', path: 'snapshot' }],
      ok: false,
    }
  }

  const date = getLocalDateString(snapshot.date)
  if (!date || date !== snapshot.date) {
    addError(errors, 'date', 'date måste vara ett lokalt datum i formatet YYYY-MM-DD.')
  }

  validateWeightSnapshot(snapshot.weight, errors)
  validateNutritionSnapshot(snapshot.nutrition, errors)
  validateCheckInSnapshot(snapshot.checkIn, snapshot.date, errors)
  validatePeriods(snapshot.periods, snapshot.date, errors)
  validateDisplayObject(snapshot.display, 'display', errors)

  if (!isPlainObject(snapshot.availability)) {
    addError(errors, 'availability', 'availability måste vara ett objekt.')
  }

  return {
    errors,
    ok: errors.length === 0,
  }
}

export function assertHealthSnapshotIntegrity(snapshot) {
  const result = validateHealthSnapshot(snapshot)

  if (!result.ok) {
    const details = result.errors.map((error) => `${error.path}: ${error.message}`).join('\n')
    throw new Error(`Health snapshot contract violation:\n${details}`)
  }

  return snapshot
}

function shouldAssertHealthSnapshot() {
  return Boolean(import.meta.env?.DEV || import.meta.env?.MODE === 'test')
}

function normalizeMealText(meal = {}) {
  return [
    meal.name,
    meal.title,
    meal.description,
    meal.text,
    meal.note,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

function getMealTime(meal = {}) {
  return String(meal.time || meal.createdAt || meal.updatedAt || '').trim()
}

export function getHealthSnapshotMealKey(meal = {}) {
  if (meal.id) return `id:${String(meal.id)}`

  return [
    'fallback',
    getMealLocalDate(meal),
    getMealTime(meal),
    normalizeMealText(meal),
    meal.source || meal.type || meal.mealType || '',
  ].join('|')
}

export function mergeActualMealEntries(mealSources = []) {
  const seen = new Set()
  const result = []

  mealSources.flatMap(safeArray).forEach((meal) => {
    if (!meal || typeof meal !== 'object' || isPlannedMealRecord(meal)) return

    const key = getHealthSnapshotMealKey(meal)
    if (seen.has(key)) return

    seen.add(key)
    result.push({ ...meal })
  })

  return result
}

function normalizeTodayCheckIns({ checkIn = {}, checkIns = [], today }) {
  const todayDate = getLocalDateString(today)
  const single = checkIn && typeof checkIn === 'object' && Object.keys(checkIn).length
    ? [{ ...checkIn, date: checkIn.date || todayDate }]
    : []
  const entries = [...safeArray(checkIns), ...single]
    .filter((entry) => {
      const date = getEntryLocalDate(entry)

      return date && date <= todayDate
    })

  const dailyEntries = latestEntryPerLocalDate(entries).map(({ entry }) => entry)
  const latestToday = dailyEntries
    .filter((entry) => getEntryLocalDate(entry) === todayDate)
    .sort((first, second) => getEntrySortTime(second) - getEntrySortTime(first))[0] || null
  const metrics = normalizeCheckInMetrics(latestToday || {})

  return {
    dailyEntries,
    latestToday,
    metrics,
  }
}

function getPeriodWeightChange(dailyWeights, range) {
  const entries = safeArray(dailyWeights).filter((entry) => isLocalDateInRange(entry.date, range))
  const first = entries[0] || null
  const latest = entries.at(-1) || null

  return first && latest ? Number((latest.value - first.value).toFixed(1)) : null
}

function buildWeightSnapshot({ profile, today, weights }) {
  const todayDate = getLocalDateString(today)
  const dailyWeights = normalizeDailyWeightEntries(weights, { today: parseLocalDate(todayDate) || today })
  const weightStats = getWeightStats(dailyWeights, { startWeight: profile?.startWeight })
  const facts = getUnifiedWeightFacts({
    currentWeight: weightStats.current,
    profile,
    startWeight: weightStats.first,
    weights: dailyWeights,
  })
  const analysis = analyzeWeights(dailyWeights, profile)
  const sevenDays = getLocalDateRange(7, today)
  const thirtyDays = getLocalDateRange(30, today)
  const change7 = getPeriodWeightChange(dailyWeights, sevenDays)
  const change30 = getPeriodWeightChange(dailyWeights, thirtyDays)

  return {
    analysis,
    change30,
    change7,
    current: facts.latestWeight,
    dailyWeights,
    display: {
      change30: change30 === null ? 'Saknas' : formatWeightChange(change30, { showPlus: true }),
      change7: change7 === null ? 'Saknas' : formatWeightChange(change7, { showPlus: true }),
      current: formatWeight(facts.latestWeight, { fallback: 'Saknas' }),
      goal: formatWeight(facts.goalWeight, { fallback: 'Saknas' }),
      goalRemaining: facts.goalRemaining === null ? 'Saknas' : formatWeight(Math.abs(facts.goalRemaining), { fallback: 'Saknas' }),
      start: formatWeight(facts.startWeight, { fallback: 'Saknas' }),
      totalChange: facts.weightChange === null ? 'Saknas' : formatWeightChange(facts.weightChange, { showPlus: true }),
      weeklyRate: analysis.weeklyRate === null ? 'Saknas' : formatWeightChange(analysis.weeklyRate, { showPlus: true }),
    },
    facts,
    goal: facts.goalWeight,
    goalProgress: facts.goalProgress,
    start: facts.startWeight,
    totalChange: facts.weightChange,
    trend: facts.trend,
    weeklyRate: analysis.weeklyRate,
  }
}

function buildNutritionSnapshot({ mealHistory, meals, nutritionGoals, profile, today }) {
  const todayDate = getLocalDateString(today)
  const actualMeals = mergeActualMealEntries([meals, mealHistory])
  const mealsToday = filterActualMealsForDate(actualMeals, todayDate)
  const goals = normalizeNutritionGoals(nutritionGoals)
  const summary = calculateDailyNutritionSummary(actualMeals, todayDate, {
    ...profile,
    nutritionGoals: goals,
  })
  const totals = summary.totals || {}

  return {
    actualMeals,
    caloriesToday: totals.calories || 0,
    display: {
      caloriesToday: formatCalories(totals.calories || 0),
      fiberToday: formatGrams(totals.fiber || 0),
      mealCountToday: `${summary.mealCount || 0}`,
      proteinToday: formatGrams(totals.protein || 0),
    },
    fiberToday: totals.fiber || 0,
    goals,
    mealsToday,
    mealCountToday: summary.mealCount || 0,
    progress: summary.progress || {},
    proteinToday: totals.protein || 0,
    summary,
  }
}

function buildCheckInSnapshot({ checkIn, checkIns, today }) {
  const normalized = normalizeTodayCheckIns({ checkIn, checkIns, today })
  const metrics = normalized.metrics

  return {
    dailyEntries: normalized.dailyEntries,
    display: {
      energy: metrics.energy.displayLabel,
      mood: metrics.mood.displayLabel,
      sleep: metrics.sleepLabel,
      steps: metrics.steps === null ? 'Saknas' : formatSteps(metrics.steps),
      workout: metrics.workout.displayLabel,
    },
    energy: metrics.energy.value,
    latestToday: normalized.latestToday,
    mood: metrics.mood.displayLabel === 'Saknas' ? '' : metrics.mood.displayLabel,
    metrics,
    sleep: metrics.sleep,
    steps: metrics.steps,
    workout: metrics.workout,
  }
}

export function buildHealthSnapshot(data = {}) {
  const today = parseLocalDate(getLocalDateString(data.today || new Date())) || new Date()
  const date = getLocalDateString(today)
  const profile = data.profile && typeof data.profile === 'object' ? { ...data.profile } : {}
  const weight = buildWeightSnapshot({ profile, today, weights: safeArray(data.weights) })
  const nutrition = buildNutritionSnapshot({
    mealHistory: data.mealHistory,
    meals: data.meals,
    nutritionGoals: data.nutritionGoals,
    profile,
    today,
  })
  const checkIn = buildCheckInSnapshot({
    checkIn: data.checkIn,
    checkIns: data.checkIns,
    today,
  })

  const snapshot = {
    availability: {
      checkInToday: Boolean(checkIn.latestToday),
      mealsToday: nutrition.mealCountToday > 0,
      nutritionGoals: Object.values(nutrition.goals || {}).some((value) => Number.isFinite(value) || Boolean(value?.target)),
      weight: weight.current !== null,
      weightGoal: weight.goal !== null,
    },
    checkIn,
    date,
    display: {
      caloriesToday: nutrition.display.caloriesToday,
      currentWeight: weight.display.current,
      energy: checkIn.display.energy,
      fiberToday: nutrition.display.fiberToday,
      mood: checkIn.display.mood,
      proteinToday: nutrition.display.proteinToday,
      sleep: checkIn.display.sleep,
      steps: checkIn.display.steps,
      totalWeightChange: weight.display.totalChange,
    },
    nutrition,
    periods: {
      sevenDays: {
        ...getLocalDateRange(7, today),
        weightChange: weight.change7,
        weightChangeLabel: weight.display.change7,
      },
      thirtyDays: {
        ...getLocalDateRange(30, today),
        weightChange: weight.change30,
        weightChangeLabel: weight.display.change30,
      },
    },
    weight,
  }
  const sanitized = sanitizeHealthSnapshotDisplay(snapshot)

  if (shouldAssertHealthSnapshot()) {
    assertHealthSnapshotIntegrity(sanitized)
  }

  return sanitized
}
