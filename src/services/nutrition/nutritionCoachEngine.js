import { buildCoachPlanCenterModel } from '../coachActionPlanEngine.js'
import { buildCoachMemory } from '../coachMemory/coachMemoryBuilder.js'
import { buildInsightsEngine } from '../insights/insightsEngine.js'
import { getEntryLocalDate, getLocalDateString, isSameLocalDate } from '../localDate.js'
import { buildPhotoAnalysisUsageSummary } from '../nutritionPhotoAnalysis.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'
import { buildDailyMealPlannerModel, buildDailyMealPlannerSaveState } from './dailyMealPlanner.js'
import { buildMealTimeline } from './mealTimeline.js'
import { buildWeeklyNutritionReport } from './weeklyNutritionSummary.js'
import { normalizeDietaryPreferences, rankMealSuggestionsByPreferences } from './dietaryPreferences.js'
import { normalizeMeals, summarizeDay } from '../nutritionService.js'
import { normalizeNutritionGoals, parseProteinGoal } from './nutritionGoals.js'

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

function round(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

function formatNumber(value, unit) {
  return `${Math.round(Number(value) || 0).toLocaleString('sv-SE')} ${unit}`
}

function getProgressStatus(progress = {}) {
  if (!progress.hasGoal) return 'missing'
  if (progress.status === 'reached') return 'reached'
  if (progress.percent >= 85) return 'near'
  if (progress.percent >= 50) return 'active'
  return 'low'
}

function extractMealNutrition(meal = {}) {
  const nutrition = meal.nutritionOverride || meal.nutritionPreview || meal.nutrition || {}

  return {
    calories: Number(meal.calories ?? nutrition.calories ?? 0) || 0,
    carbs: Number(meal.carbs ?? meal.carbohydrates ?? nutrition.carbs ?? 0) || 0,
    fat: Number(meal.fat ?? nutrition.fat ?? 0) || 0,
    protein: Number(meal.protein ?? nutrition.protein ?? 0) || 0,
  }
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

function buildBaseSuggestions(preferences = {}, gaps = []) {
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

function getMealName(meal = {}, fallback = 'Matförslag') {
  return safeText(meal.name || meal.title || meal.text || meal.description || fallback, fallback)
}

function getMealIngredients(meal = {}) {
  return safeArray(meal.ingredients).length
    ? safeArray(meal.ingredients).join(', ')
    : safeText(meal.text || meal.description || meal.name || meal.title)
}

function collectSuggestionCandidates(input = {}, plannedMeals = []) {
  const history = safeArray(input.meals)
    .filter((meal) => meal?.planned !== true && meal?.status !== 'planned')
    .slice(-16)
  const recipes = safeArray(input.recipes)
  const templates = safeArray(input.templates || input.mealTemplates)

  return [...safeArray(plannedMeals), ...recipes, ...templates, ...history]
    .map((meal, index) => {
      const nutrition = extractMealNutrition(meal)
      const name = getMealName(meal, `Matförslag ${index + 1}`)

      return {
        budgetFriendly: Boolean(meal.budgetFriendly),
        calories: nutrition.calories,
        category: nutrition.protein >= 25 ? 'protein' : nutrition.calories <= 350 ? 'snack' : 'balanced',
        description: getMealIngredients(meal) || `${formatNumber(nutrition.protein, 'g protein')} och ${formatNumber(nutrition.calories, 'kcal')}.`,
        name,
        protein: nutrition.protein,
        quick: meal.quick !== false,
        tags: [name, getMealIngredients(meal)].join(' ').split(/[,\s]+/).filter(Boolean),
      }
    })
    .filter((meal) => meal.name && (meal.protein > 0 || meal.calories > 0))
}

function buildSuggestions(preferences = {}, gaps = [], input = {}, dailyAdvice = {}, plannedMeals = []) {
  const targetCategory = dailyAdvice.category === 'protein'
    ? 'protein'
    : dailyAdvice.category === 'calories'
      ? 'snack'
      : ''
  const ranked = rankMealSuggestionsByPreferences([
    ...collectSuggestionCandidates(input, plannedMeals),
    ...buildBaseSuggestions(preferences, gaps),
  ], preferences)
    .filter((suggestion) => !targetCategory || suggestion.category === targetCategory || suggestion.protein >= 20)
  const unique = []

  ranked.forEach((suggestion) => {
    const key = suggestion.name.toLocaleLowerCase('sv-SE')
    if (!unique.some((item) => item.name.toLocaleLowerCase('sv-SE') === key)) unique.push(suggestion)
  })

  return unique.slice(0, 3).map((suggestion) => ({
    ...suggestion,
    reason: suggestion.reason || (gaps.length ? 'Vald för dagens nutritionlucka.' : 'Vald som enkel och balanserad matidé.'),
  }))
}

function buildDailyNutritionCoach(dailySummary = {}) {
  const protein = dailySummary.progress?.protein || {}
  const calories = dailySummary.progress?.calories || {}
  const mealCount = dailySummary.mealCount || 0
  const missingMeals = safeArray(dailySummary.byType).filter((entry) => entry.count === 0).length
  const balanced = mealCount >= 2 &&
    (!protein.hasGoal || protein.percent >= 75) &&
    (!calories.hasGoal || (calories.percent >= 70 && calories.percent <= 110))
  let primaryAdvice = {
    category: 'data',
    priority: 'low',
    text: 'Du saknar tillräcklig matdata för ett personligt råd ännu.',
  }

  if (mealCount > 0 && protein.hasGoal && protein.remaining > 0 && protein.percent < 100) {
    primaryAdvice = {
      category: 'protein',
      priority: protein.percent >= 75 ? 'medium' : 'high',
      text: `${protein.remaining.toLocaleString('sv-SE')} g protein kvar idag.`,
    }
  } else if (mealCount > 0 && protein.hasGoal && protein.status === 'reached') {
    primaryAdvice = {
      category: 'protein',
      priority: 'low',
      text: 'Du har redan nått proteinmålet idag.',
    }
  } else if (mealCount > 0 && calories.hasGoal && calories.remaining > 0) {
    primaryAdvice = {
      category: 'calories',
      priority: calories.percent >= 85 ? 'medium' : 'low',
      text: calories.percent >= 85 && protein.hasGoal && protein.remaining > 0
        ? 'Du ligger nära kalorimålet. Välj ett proteinrikt lättare kvällsmål.'
        : `${calories.remaining.toLocaleString('sv-SE')} kcal kvar till dagens kalorimål.`,
    }
  } else if (balanced) {
    primaryAdvice = {
      category: 'balance',
      priority: 'low',
      text: 'Dagen ser ungefär balanserad ut utifrån registrerad mat.',
    }
  }

  return {
    balanced,
    calories: {
      goal: calories.goal,
      percent: calories.percent,
      remaining: calories.remaining,
      status: getProgressStatus(calories),
      text: calories.hasGoal ? calories.text : 'Kalorimal saknas',
      value: dailySummary.totals?.calories || 0,
    },
    missingMeals,
    nextStep: primaryAdvice.text,
    primaryAdvice,
    protein: {
      goal: protein.goal,
      percent: protein.percent,
      remaining: protein.remaining,
      status: getProgressStatus(protein),
      text: protein.hasGoal ? protein.text : 'Proteinmal saknas',
      value: dailySummary.totals?.protein || 0,
    },
  }
}

function buildMealPlannerNutritionSignal(input = {}, options = {}) {
  const date = options.analysisDate
  const nutritionGoals = normalizeNutritionGoals(input.nutritionGoals || {})
  const generated = input.dailyMealPlanner || buildDailyMealPlannerModel({
    date,
    dietaryPreferences: normalizeDietaryPreferences(input.dietaryPreferences),
    meals: input.meals,
    nutritionGoals,
    recipes: input.recipes,
    templates: input.templates || input.mealTemplates,
  })
  const saveState = input.mealPlanner?.saveState || buildDailyMealPlannerSaveState({
    date,
    mealPlans: input.mealPlans,
    nutritionGoals,
  })
  const savedMeals = safeArray(saveState.week?.days?.[date])
  const plannedMeals = savedMeals.length ? savedMeals : safeArray(generated.meals)

  return {
    generated,
    hasSavedPlan: saveState.saved || savedMeals.length > 0,
    plannedMeals,
    saveState,
  }
}

function buildPlannedDinnerInsight(planner = {}, dailyCoach = {}) {
  const remaining = Number(dailyCoach.protein?.remaining)
  if (!Number.isFinite(remaining) || remaining <= 0) return ''

  const dinner = safeArray(planner.plannedMeals).find((meal) =>
    /middag/i.test(String(meal.mealType || meal.type || meal.title || meal.name || '')))
  const protein = extractMealNutrition(dinner).protein

  if (!Number.isFinite(protein) || protein <= 0) return ''

  return `Din planerade middag täcker cirka ${formatNumber(Math.min(protein, remaining), 'g')} av det protein du har kvar.`
}

function getMostConsistentDay(summary = {}) {
  const scored = safeArray(summary.days)
    .filter((day) => day.hasData)
    .map((day) => {
      const proteinScore = day.proteinGoalStatus?.status === 'reached' ? 1 : 0
      const calorieScore = ['near', 'reached'].includes(day.caloriesGoalStatus?.status) ? 1 : 0

      return {
        date: day.date,
        label: day.dayName || day.date,
        score: proteinScore + calorieScore + Math.min(1, day.mealCount / 3),
      }
    })
    .sort((first, second) => second.score - first.score || first.date.localeCompare(second.date, 'sv-SE'))

  return scored[0]?.label || 'Saknas'
}

function buildWeeklyCoachStatus(input = {}, options = {}) {
  const report = buildWeeklyNutritionReport({
    date: options.analysisDate,
    meals: input.meals,
    nutritionGoals: input.nutritionGoals,
    today: options.analysisDate,
  })
  const summary = report.summary
  const trend = report.comparison.hasComparison
    ? report.comparison.proteinDifference > 0
      ? 'Proteinintaget ökar jämfört med föregående vecka.'
      : report.comparison.proteinDifference < 0
        ? 'Proteinintaget är lägre än föregående vecka.'
        : 'Proteinintaget är stabilt jämfört med föregående vecka.'
    : 'Trend visas när två veckor har tillräckligt med data.'

  return {
    averageCalories: summary.registeredDays ? round(summary.averages.caloriesPerRegisteredDay) : null,
    averageProtein: summary.registeredDays ? round(summary.averages.proteinPerRegisteredDay) : null,
    insights: report.insights.slice(0, 3),
    mostConsistentDay: getMostConsistentDay(summary),
    proteinGoalDays: summary.proteinGoalDays,
    registeredDays: summary.registeredDays,
    trend,
  }
}

function buildPredictionNutritionInsight(input = {}) {
  const dashboard = input.healthPrediction?.dashboard || input.prediction?.dashboard
  const confidence = dashboard?.confidence?.label
  const trend = dashboard?.trend?.label || dashboard?.weightTrendLabel || ''

  if (!dashboard || confidence === 'Låg') return ''
  if (/stabil/i.test(trend)) return 'Din vikttrend är stabil. Fokusera på konsekvens snarare än stora förändringar.'
  if (confidence === 'Hög' && trend) return `Om nuvarande trend fortsätter: ${trend.toLocaleLowerCase('sv-SE')}. Håll nutritionen lugn och konsekvent.`
  return ''
}

export function buildNutritionCoachModel(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.analysisDate || input.today || new Date())
  const meals = normalizeMeals(input.meals || [])
  const nutritionGoals = normalizeNutritionGoals(input.nutritionGoals || {})
  const parsedProteinGoal = parseProteinGoal(nutritionGoals.protein)
  const proteinGoal = parsedProteinGoal?.target || 90
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
  const dailyCoach = buildDailyNutritionCoach(dailySummary)
  const mealPlanner = buildMealPlannerNutritionSignal({
    ...input,
    meals,
    nutritionGoals,
  }, { analysisDate })
  const plannedDinnerInsight = buildPlannedDinnerInsight(mealPlanner, dailyCoach)
  const weeklyNutrition = buildWeeklyCoachStatus({ ...input, meals, nutritionGoals }, { analysisDate })
  const predictionInsight = buildPredictionNutritionInsight(input)
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
    dailyCoach.primaryAdvice.category !== 'data' ? dailyCoach.primaryAdvice.text : '',
    gaps.some((gap) => gap.includes('Protein')) ? 'Lägg till en enkel proteinkälla i nästa måltid.' : '',
    gaps.some((gap) => gap.includes('Fiber')) ? 'Välj gärna frukt, grönsaker, potatis eller fullkorn i nästa steg.' : '',
    scanner.photoMealCount > 0 ? 'Fortsätt granska scannerresultat innan du sparar måltiden.' : '',
    plannedDinnerInsight,
    predictionInsight,
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
    dailyCoach,
    dailyScore: averageScore(dailyEntries),
    dailySummary,
    dailyTimeline,
    gaps,
    insightsSummary: insights.insights.slice(0, 3),
    mealQuality,
    mealPlanner: {
      hasSavedPlan: mealPlanner.hasSavedPlan,
      plannedDinnerInsight,
      plannedMealCount: mealPlanner.plannedMeals.length,
    },
    recommendations,
    scannerSummary: scanner,
    suggestions: buildSuggestions(dietaryPreferences, gaps, { ...input, meals }, dailyCoach.primaryAdvice, mealPlanner.plannedMeals),
    version: nutritionCoachEngineVersion,
    weeklyNutrition,
    weeklyScore: averageScore(weeklyEntries),
    weightTrend: shared.weightSummary?.periodChangeLabel || shared.weightSummary?.dataText || 'Saknas',
  }
}

export function buildMinimalNutritionCoachAiContext(model = {}) {
  return {
    confidenceScore: model.confidenceScore,
    dailyAdvice: model.dailyCoach?.primaryAdvice?.text || '',
    dailyScore: model.dailyScore,
    gapCount: model.gaps?.length || 0,
    mealCategories: model.dailyTimeline?.byType?.map((entry) => ({ missing: entry.missing, type: entry.type })) || [],
    nutritionStatus: {
      caloriesPercent: model.dailyCoach?.calories?.percent ?? null,
      proteinPercent: model.dailyCoach?.protein?.percent ?? null,
      weeklyRegisteredDays: model.weeklyNutrition?.registeredDays ?? 0,
    },
    recommendationCount: model.recommendations?.length || 0,
    scannerMeals: model.scannerSummary?.photoMealCount || 0,
    weeklyScore: model.weeklyScore,
  }
}
