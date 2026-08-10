import { userDataKeys } from '../userDataRepository.js'
import { normalizeNutritionGoals as normalizeNutritionGoalsModel } from '../nutrition/nutritionGoals.js'
import { normalizeCheckInMetrics } from '../checkInNormalization.js'
import { buildHealthSnapshot } from '../healthSnapshot.js'
import {
  getEntryLocalDate,
  getEntrySortTime,
  getLocalDateString,
  parseDateValue,
} from '../localDate.js'

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback
  }

  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return fallback
  }
}

function readStorageValue(storage, key, fallback) {
  if (!storage?.getItem) {
    return fallback
  }

  return parseJson(storage.getItem(key), fallback)
}

function parseFiniteNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }

  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : NaN

  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function normalizeProfile(profile) {
  if (!isObject(profile)) {
    return {}
  }

  return {
    activityLevel: profile.activityLevel || profile.activity || '',
    age: parseFiniteNumber(profile.age, { min: 1, max: 120 }),
    gender: profile.gender || profile.sex || '',
    goal: profile.goal || '',
    goalWeight: parseFiniteNumber(profile.goalWeight, { min: 1, max: 500 }) ?? '',
    height: parseFiniteNumber(profile.height, { min: 30, max: 260 }),
    name: typeof profile.name === 'string' ? profile.name.trim() : '',
    startWeight: parseFiniteNumber(profile.startWeight, { min: 1, max: 500 }) ?? '',
  }
}

function normalizeWeight(entry) {
  if (!isObject(entry)) {
    return null
  }

  const value = parseFiniteNumber(entry.value ?? entry.weight, { min: 1, max: 500 })
  const date = getEntryLocalDate(entry)

  if (!Number.isFinite(value) || !date) {
    return null
  }

  return {
    ...entry,
    date,
    id: String(entry.id || `${date}-${value}`),
    value,
    weight: value,
  }
}

function normalizeWeights(weights, today = getLocalDateString()) {
  return (Array.isArray(weights) ? weights : [])
    .map(normalizeWeight)
    .filter(Boolean)
    .filter((entry) => entry.date <= today)
    .sort((first, second) => getEntrySortTime(first) - getEntrySortTime(second))
}

function normalizeCheckIn(checkIn) {
  if (!isObject(checkIn)) {
    return {}
  }

  const metrics = normalizeCheckInMetrics(checkIn)

  return {
    date: getEntryLocalDate(checkIn) || getLocalDateString(),
    energy: metrics.energy.value,
    energyLabel: metrics.energy.displayLabel,
    energyLevel: metrics.energy.level,
    mood: metrics.mood.displayLabel === 'Saknas' ? '' : metrics.mood.displayLabel,
    moodKey: metrics.mood.key,
    moodScore: metrics.mood.score,
    sleep: metrics.sleep,
    sleepLabel: metrics.sleepLabel,
    sleepLevel: metrics.sleepLevel,
    steps: metrics.steps,
    stepsLabel: metrics.stepsLabel,
    training: metrics.workout.displayLabel,
    water: parseFiniteNumber(checkIn.water, { min: 0, max: 20 }),
    workout: metrics.workout.completed,
  }
}

function normalizeMeal(meal) {
  if (!isObject(meal)) {
    return null
  }

  const date = getEntryLocalDate(meal)

  if (!date) {
    return null
  }

  return {
    ...meal,
    calories: parseFiniteNumber(meal.calories, { min: 0, max: 10000 }),
    date,
    id: String(meal.id || `${date}-${meal.name || meal.text || meal.type || 'meal'}`),
    name: typeof meal.name === 'string' ? meal.name.trim() : '',
    protein: parseFiniteNumber(meal.protein, { min: 0, max: 500 }),
    text: typeof meal.text === 'string' ? meal.text.trim() : '',
    time: /^\d{2}:\d{2}$/.test(String(meal.time || '')) ? meal.time : '',
    type: typeof meal.type === 'string' ? meal.type.trim() : meal.mealType || '',
  }
}

function normalizeMeals(meals, today = getLocalDateString()) {
  const normalized = (Array.isArray(meals) ? meals : [])
    .map(normalizeMeal)
    .filter(Boolean)
    .filter((meal) => meal.date <= today)
    .sort((first, second) => getEntrySortTime(first) - getEntrySortTime(second))

  return {
    all: normalized,
    today: normalized.filter((meal) => meal.date === today),
  }
}

function normalizeChatMessage(message) {
  if (!isObject(message) || !['user', 'assistant'].includes(message.role)) {
    return null
  }

  const text = typeof message.text === 'string' ? message.text.trim().slice(0, 700) : ''

  if (!text) {
    return null
  }

  return {
    createdAt: message.createdAt || message.time || '',
    role: message.role,
    text,
  }
}

function normalizeChatHistory(chatHistory) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .map(normalizeChatMessage)
    .filter(Boolean)
    .sort((first, second) => {
      const firstTime = parseDateValue(first.createdAt)?.getTime() ?? 0
      const secondTime = parseDateValue(second.createdAt)?.getTime() ?? 0

      return firstTime - secondTime
    })
    .slice(-10)
}

export function makePendingCoachChatHistory(chatHistory = [], message, createdAt = new Date().toISOString()) {
  const pendingMessage = normalizeChatMessage({
    createdAt,
    role: 'user',
    text: message,
  })
  const normalizedHistory = normalizeChatHistory(chatHistory)

  if (!pendingMessage) {
    return normalizedHistory
  }

  const alreadyIncluded = normalizedHistory.some(
    (entry) =>
      entry.role === pendingMessage.role &&
      entry.text === pendingMessage.text &&
      entry.createdAt === pendingMessage.createdAt,
  )

  return alreadyIncluded
    ? normalizedHistory
    : normalizeChatHistory([...normalizedHistory, pendingMessage])
}

function normalizeNutritionGoals(goals) {
  return normalizeNutritionGoalsModel(goals)
}

export function buildAiCoachAppContextFromData(data = {}, options = {}) {
  const today = options.today || getLocalDateString()
  const profile = normalizeProfile(data.profile)
  const weights = normalizeWeights(data.weights, today)
  const meals = normalizeMeals(data.meals, today)
  const checkIn = normalizeCheckIn(data.checkIn)
  const chatHistory = normalizeChatHistory(data.chatHistory || data.coachChat)
  const mealHistory = Array.isArray(data.mealHistory) ? data.mealHistory.filter(Boolean) : []
  const nutritionGoals = normalizeNutritionGoals(data.nutritionGoals)
  const checkIns = Array.isArray(data.checkIns) ? data.checkIns.map(normalizeCheckIn).filter(Boolean) : []
  const healthSnapshot = data.healthSnapshot || buildHealthSnapshot({
    checkIn,
    checkIns,
    mealHistory,
    meals: meals.all,
    nutritionGoals,
    profile,
    today,
    weights,
  })

  return {
    bodyAnalysisHistory: Array.isArray(data.bodyAnalysisHistory) ? data.bodyAnalysisHistory.filter(Boolean) : [],
    chatHistory,
    checkIn,
    checkIns,
    currentWeight: weights.at(-1)?.value,
    foods: Array.isArray(data.foods) ? data.foods.filter(Boolean) : [],
    latestWeeklyReport: data.latestWeeklyReport || data.weeklyReportData || null,
    healthSnapshot,
    mealHistory,
    mealPlans: data.mealPlans || null,
    meals: meals.all,
    nutritionGoals,
    profile,
    progressGoalSettings: isObject(data.progressGoalSettings) ? data.progressGoalSettings : {},
    reminderState: isObject(data.reminderState) ? data.reminderState : {},
    todayMeals: healthSnapshot.nutrition.mealsToday,
    weights,
  }
}

export function buildAiCoachAppContextFromStorage(storage, options = {}) {
  const read = (key, fallback) => readStorageValue(storage, key, fallback)

  return buildAiCoachAppContextFromData({
    bodyAnalysisHistory: read(userDataKeys.bodyAnalysisHistory, []),
    chatHistory: read(userDataKeys.chat, []),
    checkIn: read(userDataKeys.checkIn, {}),
    foods: read(userDataKeys.foods, []),
    mealHistory: read(userDataKeys.mealHistory, []),
    meals: read(userDataKeys.meals, []),
    nutritionGoals: read(userDataKeys.nutritionGoals, {}),
    profile: read(userDataKeys.profile, {}),
    progressGoalSettings: read(userDataKeys.progressGoalSettings, {}),
    weights: read(userDataKeys.weights, []),
  }, options)
}

export function buildAiCoachAppContext(options = {}) {
  const storage = options.storage ||
    (typeof window !== 'undefined' ? window.localStorage : null)

  return buildAiCoachAppContextFromStorage(storage, options)
}

export function createDailyPriorityCoachAdvice(context = {}) {
  const advice = []
  const steps = context.checkIn?.steps
  const energy = context.checkIn?.energy
  const sleep = context.checkIn?.sleep
  const todayProtein = (Array.isArray(context.todayMeals) ? context.todayMeals : [])
    .reduce((sum, meal) => sum + (Number.isFinite(meal.protein) ? meal.protein : 0), 0)
  const proteinGoal = parseFiniteNumber(context.nutritionGoals?.protein)

  if (Number.isFinite(sleep) && sleep < 6) {
    advice.push({
      nextStep: 'Sikta på en lugn kväll och undvik att kompensera med hård träning.',
      observation: `Du har registrerat ${sleep.toLocaleString('sv-SE')} timmar sömn.`,
      relevance: 'Kort sömn kan påverka hunger, energi och återhämtning.',
    })
  }

  if (Number.isFinite(energy) && energy <= 3) {
    advice.push({
      nextStep: 'Välj ett lättare nästa steg: vatten, vanlig måltid och kort promenad.',
      observation: `Energin är ${energy}/10 idag.`,
      relevance: 'Låg energi gör det svårare att hålla rutiner.',
    })
  }

  if (Number.isFinite(steps) && steps < 4000) {
    advice.push({
      nextStep: 'En promenad på 15–20 minuter är ett rimligt nästa steg.',
      observation: `Du har gått ${steps.toLocaleString('sv-SE')} steg idag.`,
      relevance: 'Det är lägre rörelse än en aktiv dag.',
    })
  }

  if (Number.isFinite(proteinGoal) && todayProtein > 0 && todayProtein < proteinGoal * 0.5) {
    advice.push({
      nextStep: 'Lägg till en tydlig proteinkälla i nästa måltid.',
      observation: `Du har loggat cirka ${todayProtein.toLocaleString('sv-SE')} g protein idag.`,
      relevance: 'Det är en bit från ditt proteinmål.',
    })
  }

  return advice.slice(0, 3)
}

export const coachAppContextInternals = {
  getLocalDateString,
  normalizeChatHistory,
  normalizeMeals,
  normalizeWeights,
}
