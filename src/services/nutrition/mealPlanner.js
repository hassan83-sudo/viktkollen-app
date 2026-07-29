import { getEffectiveMealNutrition, normalizeNutritionOverride, parseCorrectionNumber } from './mealCorrections.js'
import { filterTemplatesByDietaryPreferences } from './dietaryPreferences.js'
import { createMealFromTemplate, mealTemplateTypes, normalizeMealTemplate, normalizeMealTemplates } from './mealTemplates.js'
import { buildMealSuggestions } from './nutritionRecommendations.js'
import { makeNutritionGoalProgress, normalizeNutritionGoals } from './nutritionGoals.js'

export const mealPlansStorageKey = 'viktkollen.mealPlans'
export const mealPlanVersion = 1
export const plannedMealTypes = ['Frukost', 'Lunch', 'Middag', 'Mellanmål', 'Kvällsmål', 'Nattmål', 'Måltid', 'Dryck', 'Annat']

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^\d{2}:\d{2}$/
const maxTextLength = 1000
const maxTitleLength = 120

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function normalizeText(value, maxLength = maxTextLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizeDate(value, fallback = getLocalDateString()) {
  if (datePattern.test(String(value || ''))) return String(value)

  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? getLocalDateString(date) : fallback
}

function isValidTime(value) {
  if (!timePattern.test(String(value || ''))) return false
  const [hours, minutes] = String(value).split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

function normalizeMealType(value) {
  const text = normalizeText(value)
  const allTypes = [...new Set([...plannedMealTypes, ...mealTemplateTypes])]
  const match = allTypes.find((type) => type.toLocaleLowerCase('sv-SE') === text.toLocaleLowerCase('sv-SE'))

  if (!match || match === 'Automatiskt') return 'Annat'
  return match
}

function parseLocalDate(dateString) {
  const normalized = datePattern.test(String(dateString || '')) ? String(dateString) : getLocalDateString()
  const [year, month, day] = normalized.split('-').map(Number)

  return new Date(year, month - 1, day)
}

function createId(prefix = 'planned-meal', seed = Date.now()) {
  return `${prefix}-${seed}-${Math.random().toString(36).slice(2, 8)}`
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeIngredientList(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,]/)

  return list
    .map((item) => normalizeText(item, 160))
    .filter(Boolean)
}

function normalizeNutritionPreview(value) {
  if (!isObject(value)) return {}

  return ['calories', 'protein', 'carbs', 'fat', 'fiber'].reduce((result, field) => {
    const parsed = parseCorrectionNumber(value[field])
    if (parsed !== null) result[field] = parsed
    return result
  }, {})
}

function previewMealFromPlannedMeal(meal) {
  return {
    description: meal.text || meal.title,
    name: meal.title,
    nutritionOverride: meal.nutritionPreview || {},
    text: meal.text || meal.title,
    type: meal.mealType,
  }
}

export function getLocalDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function addLocalDays(dateString, amount) {
  const date = parseLocalDate(dateString)
  date.setDate(date.getDate() + amount)
  return getLocalDateString(date)
}

export function getMealPlanWeekStart(dateString = getLocalDateString()) {
  const date = parseLocalDate(normalizeDate(dateString))
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return getLocalDateString(date)
}

export function getMealPlanWeekDates(weekStart = getMealPlanWeekStart()) {
  const start = getMealPlanWeekStart(weekStart)
  return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index))
}

export function getMealPlanWeekLabel(weekStart = getMealPlanWeekStart()) {
  const dates = getMealPlanWeekDates(weekStart)
  return `${dates[0]} till ${dates.at(-1)}`
}

export function normalizePlannedMeal(meal = {}, options = {}) {
  if (!isObject(meal)) return null

  const date = normalizeDate(meal.date || options.date)
  const title = normalizeText(meal.title || meal.name, maxTitleLength)
  const text = normalizeText(meal.text || meal.description || title)

  if (!title && !text) return null

  const now = options.now || new Date().toISOString()
  const createdAt = new Date(meal.createdAt || now)
  const updatedAt = new Date(meal.updatedAt || meal.createdAt || now)
  const nutritionPreview = normalizeNutritionPreview(meal.nutritionPreview)
  const fallbackPreview = Object.keys(nutritionPreview).length
    ? nutritionPreview
    : getEffectiveMealNutrition({
      description: text || title,
      name: title || text,
      nutritionOverride: meal.nutritionOverride,
      text: text || title,
      type: meal.mealType,
    }).totals

  return {
    correctionNote: normalizeText(meal.correctionNote || meal.notes, 500),
    createdAt: Number.isNaN(createdAt.getTime()) ? now : createdAt.toISOString(),
    date,
    id: normalizeText(meal.id, 120) || createId('planned-meal', now),
    ingredients: normalizeIngredientList(meal.ingredients),
    mealType: normalizeMealType(meal.mealType || meal.type),
    notes: normalizeText(meal.notes || meal.note, 500),
    nutritionPreview: normalizeNutritionPreview(fallbackPreview),
    scheduledTime: isValidTime(meal.scheduledTime || meal.time) ? meal.scheduledTime || meal.time : '',
    sourceId: normalizeText(meal.sourceId, 160),
    sourceType: ['template', 'custom', 'recommendation'].includes(meal.sourceType) ? meal.sourceType : 'custom',
    text,
    title: title || text.split(',')[0] || 'Planerad måltid',
    updatedAt: Number.isNaN(updatedAt.getTime()) ? now : updatedAt.toISOString(),
  }
}

export function validatePlannedMealDraft(draft = {}) {
  const errors = {}
  const title = normalizeText(draft.title || draft.name, maxTitleLength)
  const text = normalizeText(draft.text || draft.description)
  const date = String(draft.date || '')

  if (!title && !text) errors.title = 'Ange titel eller beskrivning.'
  if (!datePattern.test(date) || normalizeDate(date, '') !== date) errors.date = 'Ange ett giltigt datum.'
  if (draft.scheduledTime && !isValidTime(draft.scheduledTime)) errors.scheduledTime = 'Ange en giltig tid.'
  if (title.length > maxTitleLength) errors.title = 'Titeln är för lång.'
  if (text.length > maxTextLength) errors.text = 'Beskrivningen är för lång.'

  return errors
}

export function normalizeMealPlanWeek(week = {}, weekStart = getMealPlanWeekStart()) {
  const start = getMealPlanWeekStart(week.weekStart || weekStart)
  const now = new Date().toISOString()
  const createdAt = new Date(week.createdAt || now)
  const updatedAt = new Date(week.updatedAt || week.createdAt || now)
  const days = {}
  const sourceDays = isObject(week.days) ? week.days : {}

  getMealPlanWeekDates(start).forEach((date) => {
    days[date] = (Array.isArray(sourceDays[date]) ? sourceDays[date] : [])
      .map((meal) => normalizePlannedMeal(meal, { date }))
      .filter(Boolean)
      .filter((meal, index, entries) => entries.findIndex((entry) => entry.id === meal.id) === index)
      .sort((first, second) => `${first.scheduledTime || '99:99'}|${first.title}`.localeCompare(`${second.scheduledTime || '99:99'}|${second.title}`, 'sv-SE'))
  })

  return {
    createdAt: Number.isNaN(createdAt.getTime()) ? now : createdAt.toISOString(),
    days,
    updatedAt: Number.isNaN(updatedAt.getTime()) ? now : updatedAt.toISOString(),
    weekStart: start,
  }
}

export function normalizeMealPlans(value = {}) {
  const sourceWeeks = isObject(value?.weeks) ? value.weeks : isObject(value) ? value.weeks || {} : {}
  const weeks = {}

  Object.entries(sourceWeeks).forEach(([key, week]) => {
    const normalized = normalizeMealPlanWeek(week, key)
    weeks[normalized.weekStart] = normalized
  })

  return {
    version: mealPlanVersion,
    weeks,
  }
}

export function readMealPlans(storage) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return normalizeMealPlans()

  try {
    return normalizeMealPlans(JSON.parse(resolvedStorage.getItem(mealPlansStorageKey) || '{}'))
  } catch {
    return normalizeMealPlans()
  }
}

export function writeMealPlans(plans, storage) {
  const normalized = normalizeMealPlans(plans)
  const resolvedStorage = getStorage(storage)

  if (!resolvedStorage) return normalized

  try {
    resolvedStorage.setItem(mealPlansStorageKey, JSON.stringify(normalized))
  } catch {
    return normalized
  }

  return normalized
}

export function getMealPlanWeek(plans = {}, weekStart = getMealPlanWeekStart()) {
  const normalizedPlans = normalizeMealPlans(plans)
  const start = getMealPlanWeekStart(weekStart)

  return normalizedPlans.weeks[start] || normalizeMealPlanWeek({ weekStart: start }, start)
}

export function createMealPlanWeek(weekStart = getMealPlanWeekStart(), now = new Date().toISOString()) {
  return normalizeMealPlanWeek({ createdAt: now, updatedAt: now, weekStart }, weekStart)
}

function upsertWeek(plans, week) {
  const normalizedPlans = normalizeMealPlans(plans)
  const normalizedWeek = normalizeMealPlanWeek(week)

  return normalizeMealPlans({
    ...normalizedPlans,
    weeks: {
      ...normalizedPlans.weeks,
      [normalizedWeek.weekStart]: normalizedWeek,
    },
  })
}

export function createPlannedMealFromTemplate(template, options = {}, now = new Date().toISOString()) {
  const normalizedTemplate = normalizeMealTemplate(template)
  if (!normalizedTemplate) return { errors: { template: 'Mallen kunde inte läsas.' }, meal: null }

  const preview = getEffectiveMealNutrition({
    description: normalizedTemplate.text,
    name: normalizedTemplate.name,
    nutritionOverride: normalizedTemplate.nutritionOverride,
    text: normalizedTemplate.text,
    type: normalizedTemplate.mealType,
  }).totals

  return {
    errors: {},
    meal: normalizePlannedMeal({
      correctionNote: normalizedTemplate.correctionNote,
      createdAt: now,
      date: options.date,
      id: createId('planned-meal', now),
      ingredients: options.ingredients || normalizedTemplate.text,
      mealType: normalizedTemplate.mealType,
      notes: options.notes,
      nutritionPreview: preview,
      scheduledTime: options.scheduledTime || normalizedTemplate.defaultTime,
      sourceId: normalizedTemplate.id,
      sourceType: 'template',
      text: normalizedTemplate.text,
      title: normalizedTemplate.name,
      updatedAt: now,
    }, { now }),
  }
}

export function createPlannedMealFromRecommendation(suggestion, options = {}, now = new Date().toISOString()) {
  if (!isObject(suggestion)) return { errors: { suggestion: 'Förslaget kunde inte läsas.' }, meal: null }

  const text = normalizeText(suggestion.description || suggestion.name)
  const preview = getEffectiveMealNutrition({
    description: text,
    name: suggestion.name,
    text,
    type: options.mealType,
  }).totals

  return {
    errors: {},
    meal: normalizePlannedMeal({
      createdAt: now,
      date: options.date,
      id: createId('planned-meal', now),
      ingredients: options.ingredients || text,
      mealType: options.mealType || suggestion.suitableMealTypes?.[0] || 'Annat',
      nutritionPreview: preview,
      scheduledTime: options.scheduledTime,
      sourceId: suggestion.id || suggestion.name,
      sourceType: 'recommendation',
      text,
      title: suggestion.name || 'Planerat förslag',
      updatedAt: now,
    }, { now }),
  }
}

export function createPlannedMealFromDraft(draft = {}, now = new Date().toISOString()) {
  const errors = validatePlannedMealDraft(draft)
  if (Object.keys(errors).length) return { errors, meal: null }

  const preview = getEffectiveMealNutrition({
    description: draft.text || draft.description || draft.title,
    name: draft.title,
    nutritionOverride: draft.nutritionOverride,
    text: draft.text || draft.description || draft.title,
    type: draft.mealType,
  }).totals

  return {
    errors: {},
    meal: normalizePlannedMeal({
      ...draft,
      createdAt: now,
      id: draft.id || createId('planned-meal', now),
      nutritionPreview: preview,
      sourceType: draft.sourceType || 'custom',
      updatedAt: now,
    }, { now }),
  }
}

export function addPlannedMeal(plans, weekStart, plannedMeal, now = new Date().toISOString()) {
  const week = getMealPlanWeek(plans, weekStart)
  const meal = normalizePlannedMeal({ ...plannedMeal, createdAt: plannedMeal?.createdAt || now, updatedAt: now })
  if (!meal) return normalizeMealPlans(plans)

  const days = {
    ...week.days,
    [meal.date]: [...(week.days[meal.date] || []), meal],
  }

  return upsertWeek(plans, { ...week, days, updatedAt: now })
}

export function updatePlannedMeal(plans, weekStart, mealId, patch = {}, now = new Date().toISOString()) {
  const week = getMealPlanWeek(plans, weekStart)
  let updatedMeal = null
  const days = Object.fromEntries(Object.entries(week.days).map(([date, meals]) => [
    date,
    meals.map((meal) => {
      if (meal.id !== mealId) return meal
      updatedMeal = normalizePlannedMeal({ ...meal, ...patch, id: meal.id, createdAt: meal.createdAt, updatedAt: now }, { date: patch.date || meal.date, now })
      return updatedMeal || meal
    }),
  ]))

  if (updatedMeal && updatedMeal.date && !days[updatedMeal.date]?.some((meal) => meal.id === updatedMeal.id)) {
    Object.keys(days).forEach((date) => {
      days[date] = days[date].filter((meal) => meal.id !== mealId)
    })
    days[updatedMeal.date] = [...(days[updatedMeal.date] || []), updatedMeal]
  }

  return upsertWeek(plans, { ...week, days, updatedAt: now })
}

export function removePlannedMeal(plans, weekStart, mealId, now = new Date().toISOString()) {
  const week = getMealPlanWeek(plans, weekStart)
  const days = Object.fromEntries(Object.entries(week.days).map(([date, meals]) => [
    date,
    meals.filter((meal) => meal.id !== mealId),
  ]))

  return upsertWeek(plans, { ...week, days, updatedAt: now })
}

export function movePlannedMeal(plans, weekStart, mealId, targetDate, now = new Date().toISOString()) {
  return updatePlannedMeal(plans, weekStart, mealId, { date: normalizeDate(targetDate) }, now)
}

function clonePlannedMealForDate(meal, date, now = new Date().toISOString()) {
  return normalizePlannedMeal({
    ...meal,
    createdAt: now,
    date,
    id: createId('planned-meal', `${now}-${date}`),
    updatedAt: now,
  }, { date, now })
}

export function copyPlannedDay(plans, weekStart, sourceDate, target = {}, now = new Date().toISOString()) {
  const week = getMealPlanWeek(plans, weekStart)
  const sourceMeals = week.days[normalizeDate(sourceDate)] || []
  const mode = target.mode === 'replace' ? 'replace' : 'append'
  const targetDates = target.scope === 'weekdays'
    ? getMealPlanWeekDates(week.weekStart).slice(0, 5)
    : target.scope === 'week'
      ? getMealPlanWeekDates(week.weekStart)
      : [normalizeDate(target.date)]
  const days = { ...week.days }

  targetDates
    .filter((date) => date !== sourceDate)
    .forEach((date) => {
      const copied = sourceMeals.map((meal) => clonePlannedMealForDate(meal, date, now)).filter(Boolean)
      days[date] = mode === 'replace'
        ? copied
        : [...(days[date] || []), ...copied]
    })

  return upsertWeek(plans, { ...week, days, updatedAt: now })
}

export function clearMealPlanWeek(plans, weekStart, now = new Date().toISOString()) {
  const normalizedPlans = normalizeMealPlans(plans)
  const start = getMealPlanWeekStart(weekStart)

  return normalizeMealPlans({
    ...normalizedPlans,
    weeks: {
      ...normalizedPlans.weeks,
      [start]: createMealPlanWeek(start, now),
    },
  })
}

export function calculatePlannedMealNutrition(meal) {
  const normalized = normalizePlannedMeal(meal)
  if (!normalized) return { known: false, totals: {} }

  const effective = getEffectiveMealNutrition(previewMealFromPlannedMeal(normalized))
  const totals = ['calories', 'protein', 'carbs', 'fat', 'fiber'].reduce((result, field) => {
    const value = effective.totals[field]
    if (Number.isFinite(value) && value > 0) result[field] = value
    return result
  }, {})

  return {
    known: Object.keys(totals).length > 0,
    source: effective.source,
    totals,
  }
}

export function buildPlannedDaySummary(meals = [], goals = {}) {
  const normalizedMeals = (Array.isArray(meals) ? meals : []).map(normalizePlannedMeal).filter(Boolean)
  const normalizedGoals = normalizeNutritionGoals(goals)
  const nutritionEntries = normalizedMeals.map(calculatePlannedMealNutrition)
  const knownEntries = nutritionEntries.filter((entry) => entry.known)
  const totals = ['calories', 'protein', 'carbs', 'fat', 'fiber'].reduce((result, field) => {
    result[field] = knownEntries.reduce((sum, entry) => sum + safeNumber(entry.totals[field]), 0)
    return result
  }, {})

  return {
    knownNutritionMealCount: knownEntries.length,
    mealCount: normalizedMeals.length,
    meals: normalizedMeals,
    missingNutritionMealCount: normalizedMeals.length - knownEntries.length,
    progress: {
      calories: makeNutritionGoalProgress(totals.calories, normalizedGoals.calories, 'kcal', 'Kalorier'),
      protein: makeNutritionGoalProgress(totals.protein, normalizedGoals.protein, 'g', 'Protein'),
    },
    totals,
  }
}

export function buildPlannedWeekSummary(week = {}, goals = {}) {
  const normalizedWeek = normalizeMealPlanWeek(week)
  const days = getMealPlanWeekDates(normalizedWeek.weekStart).map((date) => ({
    date,
    ...buildPlannedDaySummary(normalizedWeek.days[date] || [], goals),
  }))
  const plannedDays = days.filter((day) => day.mealCount > 0)
  const mealCount = plannedDays.reduce((sum, day) => sum + day.mealCount, 0)
  const plannedDayCount = plannedDays.length

  return {
    averageCalories: plannedDayCount ? plannedDays.reduce((sum, day) => sum + day.totals.calories, 0) / plannedDayCount : null,
    averageProtein: plannedDayCount ? plannedDays.reduce((sum, day) => sum + day.totals.protein, 0) / plannedDayCount : null,
    days,
    mealCount,
    plannedDayCount,
    proteinGoalDays: plannedDays.filter((day) => ['reached', 'near'].includes(day.progress.protein.status)).length,
    weekStart: normalizedWeek.weekStart,
  }
}

export function comparePlannedNutritionWithGoals(week = {}, goals = {}) {
  const summary = buildPlannedWeekSummary(week, goals)

  return {
    proteinGoalDays: summary.proteinGoalDays,
    plannedDayCount: summary.plannedDayCount,
    text: summary.plannedDayCount
      ? `Proteinplanen når målet under ${summary.proteinGoalDays} av ${summary.plannedDayCount} planerade dagar.`
      : 'Ingen planerad nutrition finns att jämföra med målen ännu.',
  }
}

export function buildMealPlanInsights(week = {}, goals = {}) {
  const normalizedWeek = normalizeMealPlanWeek(week)
  const summary = buildPlannedWeekSummary(normalizedWeek, goals)
  const insights = []

  if (!summary.mealCount) {
    return ['Ingen vecka är planerad ännu. Lägg till en måltid när du vill bygga veckan.']
  }

  insights.push(`${summary.plannedDayCount} av 7 dagar har minst en planerad måltid.`)
  if (summary.proteinGoalDays > 0) insights.push(`Proteinplanen når målet under ${summary.proteinGoalDays} dagar.`)

  const missing = summary.days.reduce((sum, day) => sum + day.missingNutritionMealCount, 0)
  if (missing > 0) insights.push(`${missing} planerade måltider har begränsad nutritiondata, så kalorierna är osäkra.`)

  const weekdayLunchMissing = summary.days.slice(0, 5).filter((day) => !day.meals.some((meal) => meal.mealType === 'Lunch')).length
  if (weekdayLunchMissing > 0) insights.push(`Lunch saknas i planen under ${weekdayLunchMissing} vardagar.`)

  const titles = summary.days.flatMap((day) => day.meals.map((meal) => meal.title.toLocaleLowerCase('sv-SE')))
  const repeated = [...new Set(titles)].find((title) => titles.filter((entry) => entry === title).length >= 3)
  if (repeated) insights.push(`Samma måltid är planerad minst tre gånger: ${repeated}.`)

  return insights.slice(0, 4)
}

export function buildMealPlanSuggestions({ week = {}, goals = {}, templates = [], dietaryPreferences = {} } = {}) {
  const normalizedWeek = normalizeMealPlanWeek(week)
  const summary = buildPlannedWeekSummary(normalizedWeek, goals)
  const suggestions = []
  const compatibleTemplates = filterTemplatesByDietaryPreferences(normalizeMealTemplates(templates), dietaryPreferences)
  const emptyDay = summary.days.find((day) => day.mealCount === 0)

  if (emptyDay && compatibleTemplates[0]) {
    suggestions.push(`Lägg till mallen "${compatibleTemplates[0].name}" på ${emptyDay.date} om du vill planera fler dagar.`)
  }

  if (summary.plannedDayCount > 0 && summary.proteinGoalDays < summary.plannedDayCount) {
    const proteinSuggestions = buildMealSuggestions({ dietaryPreferences, remainingProtein: 25, templates: compatibleTemplates })
    if (proteinSuggestions[0]) suggestions.push(`Ett kompatibelt proteinförslag är ${proteinSuggestions[0].name}.`)
  }

  const vagueMeal = summary.days.flatMap((day) => day.meals).find((meal) => !meal.ingredients.length || meal.text.length < 8)
  if (vagueMeal) suggestions.push(`Komplettera gärna "${vagueMeal.title}" med mängd eller ingredienser för tydligare inköpslista.`)

  if (!suggestions.length && summary.mealCount > 0) {
    suggestions.push('Planen ser jämn ut utifrån den data som finns. Registrera måltiderna när de faktiskt äts.')
  }

  return suggestions.slice(0, 3)
}

export function plannedMealToMeal(plannedMeal, options = {}, now = new Date().toISOString()) {
  const meal = normalizePlannedMeal(plannedMeal)
  if (!meal) return null

  const templateMeal = meal.sourceType === 'template'
    ? createMealFromTemplate({
      correctionNote: meal.correctionNote,
      defaultTime: meal.scheduledTime,
      id: meal.sourceId,
      mealType: meal.mealType,
      name: meal.title,
      nutritionOverride: normalizeNutritionOverride(meal.nutritionPreview),
      text: meal.text,
    }, { date: meal.date, time: meal.scheduledTime }, now)
    : null

  return templateMeal || {
    calories: meal.nutritionPreview.calories ?? null,
    carbs: meal.nutritionPreview.carbs ?? null,
    correctionNote: meal.correctionNote,
    createdAt: now,
    date: meal.date,
    description: meal.text,
    fat: meal.nutritionPreview.fat ?? null,
    fiber: meal.nutritionPreview.fiber ?? null,
    id: createId('meal', now),
    name: meal.title,
    note: meal.notes,
    nutritionOverride: normalizeNutritionOverride(meal.nutritionPreview),
    nutritionSource: Object.keys(meal.nutritionPreview || {}).length ? 'manual' : 'automatic',
    protein: meal.nutritionPreview.protein ?? null,
    source: options.source || 'Planerad måltid',
    text: meal.text,
    time: meal.scheduledTime || '',
    type: meal.mealType,
    updatedAt: now,
  }
}
