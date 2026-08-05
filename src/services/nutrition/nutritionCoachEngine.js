import { buildCoachPlanCenterModel } from '../coachActionPlanEngine.js'
import { buildCoachMemory } from '../coachMemory/coachMemoryBuilder.js'
import { buildInsightsEngine } from '../insights/insightsEngine.js'
import { getEntryLocalDate, getLocalDateString, isSameLocalDate } from '../localDate.js'
import { buildPhotoAnalysisUsageSummary } from '../nutritionPhotoAnalysis.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'
import { buildMealTimeline } from './mealTimeline.js'
import { normalizeDietaryPreferences, rankMealSuggestionsByPreferences } from './dietaryPreferences.js'
import { normalizeMeals, summarizeDay } from '../nutritionService.js'

export const nutritionCoachEngineVersion = 2

const mealTypes = ['Frukost', 'Lunch', 'Middag', 'Mellanmål']
const processedTerms = ['pizza', 'hamburgare', 'pommes', 'chips', 'godis', 'läsk', 'lask', 'glass', 'choklad']
const sugarTerms = ['godis', 'läsk', 'lask', 'glass', 'choklad', 'kaka', 'bull', 'saft']
const vegetableTerms = ['broccoli', 'morot', 'tomat', 'gurka', 'sallad', 'grönsak', 'gronsak', 'spenat', 'paprika']
const healthyFatTerms = ['lax', 'avokado', 'olja', 'olivolja', 'nötter', 'notter', 'frön', 'fron']

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim()
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function hasAny(text, terms) {
  const normalized = safeText(text).toLocaleLowerCase('sv-SE')
  return terms.some((term) => normalized.includes(term))
}

function scoreComponent({ explanation, max, score }) {
  return {
    explanation,
    max,
    score: clamp(score, 0, max),
  }
}

export function scoreMealQuality(meal = {}, options = {}) {
  const text = [
    meal.name,
    meal.text,
    meal.description,
    meal.note,
    meal.type,
  ].join(' ')
  const calories = Number(meal.calories ?? meal.nutritionOverride?.calories ?? 0) || 0
  const protein = Number(meal.protein ?? meal.nutritionOverride?.protein ?? 0) || 0
  const carbs = Number(meal.carbs ?? meal.carbohydrates ?? meal.nutritionOverride?.carbs ?? 0) || 0
  const fat = Number(meal.fat ?? meal.nutritionOverride?.fat ?? 0) || 0
  const fiber = Number(meal.fiber ?? meal.nutritionOverride?.fiber ?? 0) || 0
  const hasVegetables = hasAny(text, vegetableTerms)
  const processed = hasAny(text, processedTerms)
  const sugary = hasAny(text, sugarTerms)
  const healthyFat = hasAny(text, healthyFatTerms)
  const proteinGoalPerMeal = Number(options.proteinGoalPerMeal || 25)
  const components = {
    balance: scoreComponent({
      explanation: calories > 0 && protein > 0 && (carbs > 0 || fat > 0)
        ? 'Måltiden har flera makron registrerade.'
        : 'Balansen är osäker eftersom någon huvuddelsdata saknas.',
      max: 15,
      score: calories > 0 && protein > 0 && (carbs > 0 || fat > 0) ? 13 : 7,
    }),
    fiber: scoreComponent({
      explanation: fiber >= 6 ? 'Fiberinnehållet ser starkt ut.' : fiber > 0 ? 'Det finns lite fiber, men mer fullkorn/frukt/grönt kan hjälpa.' : 'Fiber saknas eller är inte registrerat.',
      max: 12,
      score: fiber >= 6 ? 12 : fiber >= 3 ? 8 : fiber > 0 ? 5 : 2,
    }),
    healthyFats: scoreComponent({
      explanation: healthyFat ? 'Måltiden innehåller tecken på bra fettkälla.' : 'Ingen tydlig bra fettkälla hittades.',
      max: 8,
      score: healthyFat ? 8 : fat > 0 ? 4 : 2,
    }),
    processedFood: scoreComponent({
      explanation: processed ? 'Måltiden verkar innehålla snabbmat eller energität processad mat.' : 'Inga tydliga snabbmatsmarkörer hittades.',
      max: 12,
      score: processed ? 4 : 12,
    }),
    protein: scoreComponent({
      explanation: protein >= proteinGoalPerMeal ? 'Proteinmängden ser stark ut för en måltid.' : protein >= 15 ? 'Måltiden bidrar med okej protein.' : 'Proteinmängden är låg eller saknas.',
      max: 24,
      score: protein >= proteinGoalPerMeal ? 24 : protein >= 15 ? 17 : protein >= 8 ? 10 : 4,
    }),
    sugar: scoreComponent({
      explanation: sugary ? 'Det finns tecken på sötsaker eller söt dryck.' : 'Inga tydliga socker-/sötsaksmarkörer hittades.',
      max: 12,
      score: sugary ? 4 : 12,
    }),
    vegetables: scoreComponent({
      explanation: hasVegetables ? 'Grönsaker verkar finnas med.' : 'Grönsaker syns inte tydligt i måltiden.',
      max: 17,
      score: hasVegetables ? 17 : 6,
    }),
  }
  const score = Math.round(Object.values(components).reduce((sum, item) => sum + item.score, 0))

  return {
    components,
    explanation: score >= 75
      ? 'Måltiden ser balanserad ut och bidrar bra till dagen.'
      : score >= 55
        ? 'Måltiden fungerar, men ett litet tillägg kan göra den jämnare.'
        : 'Måltiden kan balanseras med protein, fiber eller grönsaker vid nästa tillfälle.',
    mealId: meal.id || '',
    mealType: meal.type || 'Måltid',
    score: clamp(score, 0, 100),
    title: meal.name || meal.text || 'Måltid',
  }
}

function buildDailyTimeline(meals, analysisDate, nutritionGoals) {
  const todayMeals = normalizeMeals(meals).filter((meal) => isSameLocalDate(getEntryLocalDate(meal), analysisDate))
  const timeline = buildMealTimeline(todayMeals, { date: analysisDate, proteinGoal: nutritionGoals.protein })
  const byType = mealTypes.map((type) => {
    const items = todayMeals.filter((meal) => String(meal.type || '').toLocaleLowerCase('sv-SE').includes(type.toLocaleLowerCase('sv-SE')))
    return {
      missing: items.length === 0,
      mealCount: items.length,
      meals: items,
      type,
    }
  })

  return {
    byType,
    gaps: byType.filter((entry) => entry.missing).map((entry) => `${entry.type} saknas i dagens logg.`),
    mealCount: todayMeals.length,
    meals: todayMeals,
    timeline,
  }
}

function averageScore(entries) {
  const scores = safeArray(entries).map((entry) => entry.quality.score).filter(Number.isFinite)
  if (!scores.length) return null
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

function buildSuggestions(preferences = {}, gaps = []) {
  const base = [
    { budgetFriendly: true, category: 'protein', description: 'Kvarg med bär eller frukt går snabbt och ger protein.', name: 'Kvarg + frukt', quick: true, tags: ['kvarg', 'frukt'] },
    { budgetFriendly: true, category: 'protein', description: 'Ägg med potatis eller bröd är enkelt och mättande.', name: 'Ägg och potatis', quick: true, tags: ['ägg', 'potatis'] },
    { budgetFriendly: true, category: 'fiber', description: 'Havregryn med mjölk/yoghurt och frukt ger fiber.', name: 'Havregryn', quick: true, tags: ['havregryn'] },
    { budgetFriendly: false, category: 'balanced', description: 'Kyckling, ris och grönsaker är ett stabilt huvudmål.', name: 'Kyckling, ris och grönsaker', quick: false, tags: ['kyckling', 'ris', 'grönsaker'] },
    { budgetFriendly: true, category: 'snack', description: 'Keso eller yoghurt med frukt passar som mellanmål.', name: 'Keso/yoghurt med frukt', quick: true, tags: ['keso', 'yoghurt'] },
  ]
  const ranked = rankMealSuggestionsByPreferences(base, preferences)

  return ranked.slice(0, 4).map((suggestion) => ({
    ...suggestion,
    reason: gaps.length ? 'Vald för att täcka dagens luckor på ett realistiskt sätt.' : 'Vald som enkel och balanserad matidé.',
  }))
}

export function buildNutritionCoachModel(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.analysisDate || input.today || new Date())
  const meals = normalizeMeals(input.meals || [])
  const nutritionGoals = input.nutritionGoals || {}
  const proteinGoal = Number(nutritionGoals.protein?.target || nutritionGoals.protein || 90)
  const proteinGoalPerMeal = Math.max(18, Math.round(proteinGoal / 4))
  const mealQuality = meals.map((meal) => ({
    date: getEntryLocalDate(meal),
    meal,
    quality: scoreMealQuality(meal, { proteinGoalPerMeal }),
  }))
  const dailyTimeline = buildDailyTimeline(meals, analysisDate, nutritionGoals)
  const dailyEntries = mealQuality.filter((entry) => entry.date === analysisDate)
  const weekStart = getLocalDateString(new Date(new Date(`${analysisDate}T12:00:00`).getTime() - 6 * 86400000))
  const weeklyEntries = mealQuality.filter((entry) => entry.date >= weekStart && entry.date <= analysisDate)
  const dailySummary = summarizeDay(meals, analysisDate, nutritionGoals)
  const shared = buildSharedAnalytics(input, { analysisDate, period: '30d' })
  const insights = buildInsightsEngine(input, { analysisDate, period: '90d' })
  const coachMemory = buildCoachMemory(input, { analysisDate })
  const actionPlan = buildCoachPlanCenterModel(input, { analysisDate })
  const scanner = buildPhotoAnalysisUsageSummary(meals, shared.period)
  const dietaryPreferences = normalizeDietaryPreferences(input.dietaryPreferences)
  const gaps = [
    dailySummary.totals.protein < proteinGoal * 0.6 ? 'Protein ligger lågt hittills idag.' : '',
    dailySummary.totals.fiber < Number(nutritionGoals.fiber || 20) * 0.5 ? 'Fiber/grönsaker kan stärkas idag.' : '',
    ...dailyTimeline.gaps,
  ].filter(Boolean).slice(0, 5)
  const recommendations = [
    gaps.some((gap) => gap.includes('Protein')) ? 'Lägg till en enkel proteinkälla i nästa måltid.' : '',
    gaps.some((gap) => gap.includes('Fiber')) ? 'Välj gärna frukt, grönsaker, potatis eller fullkorn i nästa steg.' : '',
    scanner.photoMealCount > 0 ? 'Fortsätt granska scannerresultat innan du sparar måltiden.' : '',
    actionPlan.plan ? `Koppla nästa matsteg till coachplanen: ${actionPlan.adaptiveChanges}` : '',
  ].filter(Boolean).slice(0, 4)
  const coverage = Math.min(1, (dailyTimeline.mealCount / 3) * 0.45 + (weeklyEntries.length / 12) * 0.35 + (shared.coverage.ratio || 0) * 0.2)
  const confidence = Math.round(clamp(coverage * 100, 10, 95))

  return {
    actionPlanSummary: actionPlan.adaptiveChanges,
    analysisDate,
    coachMemorySummary: {
      enabled: coachMemory.consent.personalizationEnabled,
      nutritionFocus: coachMemory.preferences.preferredFocusAreas.includes('nutrition'),
    },
    confidenceScore: confidence,
    dailyScore: averageScore(dailyEntries),
    dailySummary,
    dailyTimeline,
    gaps,
    insightsSummary: insights.insights.slice(0, 3),
    mealQuality,
    recommendations,
    scannerSummary: scanner,
    suggestions: buildSuggestions(dietaryPreferences, gaps),
    version: nutritionCoachEngineVersion,
    weeklyScore: averageScore(weeklyEntries),
    weightTrend: shared.weightSummary?.periodChangeLabel || shared.weightSummary?.dataText || 'Saknas',
  }
}

export function buildMinimalNutritionCoachAiContext(model = {}) {
  return {
    confidenceScore: model.confidenceScore,
    dailyScore: model.dailyScore,
    gapCount: model.gaps?.length || 0,
    mealCategories: model.dailyTimeline?.byType?.map((entry) => ({ missing: entry.missing, type: entry.type })) || [],
    recommendationCount: model.recommendations?.length || 0,
    scannerMeals: model.scannerSummary?.photoMealCount || 0,
    weeklyScore: model.weeklyScore,
  }
}
