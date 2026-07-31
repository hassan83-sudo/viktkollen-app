import {
  calculateProteinNeed,
  formatKg,
  getUnifiedWeightFacts,
  normalizeDailyWeightEntries,
  parseWeightValue,
} from '../healthCalculations.js'
import {
  buildMealMemory,
  buildMealTimeline,
  buildProteinDistributionPlan,
  calculateSuggestedCalorieGoal,
  calculateSuggestedProteinGoal,
  calculateDailyNutritionSummary,
  buildMonthlyNutritionReport,
  buildNutritionActionPlan,
  buildPlannedWeekSummary,
  buildMealPlanInsights,
  buildMealPlanSuggestions,
  buildWeeklyNutritionReport,
  getMealPlanWeek,
  getMealPlanWeekStart,
  getShoppingList,
  normalizeDietaryPreferences,
  normalizeNutritionGoals,
  readMealPlans,
  readMealTemplates,
  readDietaryPreferences,
  readRecipes,
  readGeneratedMealPlans,
  getLatestGeneratedMealPlan,
  readShoppingLists,
} from '../nutrition/nutritionEngine.js'
import {
  getLastAssistantMessage,
  getLastDiscussedTopic,
  getRecentAssistantTexts,
} from './coachConversation.js'
import { normalizeAiCoachText } from './coachText.js'
import { buildProgressDashboardAnalytics } from '../progress/progressAnalytics.js'
import { normalizeCheckInMetrics } from '../checkInNormalization.js'

function firstNumber(...values) {
  for (const value of values) {
    const parsed = parseWeightValue(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }

  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : NaN

  return Number.isFinite(parsed) ? parsed : null
}

function getWeightEntryValue(entry) {
  return parseWeightValue(entry?.value ?? entry?.weight)
}

function getWeightEntryTime(entry) {
  const date = new Date(entry?.date || entry?.createdAt || 0)

  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getSortedWeightValues(weights = []) {
  return normalizeDailyWeightEntries(weights)
    .map((entry) => ({
      date: entry.date || '',
      time: getWeightEntryTime(entry),
      value: getWeightEntryValue(entry),
    }))
}

function getWeightLossFacts({ currentWeight, profile = {}, weights = [] }) {
  const sortedWeights = getSortedWeightValues(weights)
  const latestWeight = firstNumber(currentWeight, sortedWeights.at(-1)?.value)
  const startWeight = firstNumber(profile.startWeight, sortedWeights[0]?.value)
  const weightLost = Number.isFinite(startWeight) && Number.isFinite(latestWeight)
    ? Number((startWeight - latestWeight).toFixed(1))
    : null

  return {
    latestWeight,
    startWeight,
    weightLost,
  }
}

function getDateString(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? ''
    : [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
}

function getTodayDateString() {
  return getDateString(new Date())
}

function getMealDate(meal) {
  return String(meal?.date || getDateString(meal?.createdAt) || '').slice(0, 10)
}

function getTodayMeals(meals = []) {
  const today = getTodayDateString()

  return (Array.isArray(meals) ? meals : []).filter((meal) => getMealDate(meal) === today)
}

function getRecentMeals(meals = []) {
  return (Array.isArray(meals) ? meals : [])
    .slice(-5)
    .map((meal) => meal?.name || meal?.text || meal?.type || '')
    .filter(Boolean)
}

function getLatestMealAnalysis(mealHistory = []) {
  return Array.isArray(mealHistory) ? mealHistory[0] || null : null
}

function getNumericGoal(goals = {}, key) {
  const value = parseNumber(goals?.[key])

  return Number.isFinite(value) && value > 0 ? value : null
}

function getGoalLabelFromText(value) {
  const text = String(value || '')

  return text.trim() || ''
}

function getFoodTermsFromMeals(meals = []) {
  const text = normalizeAiCoachText(
    (Array.isArray(meals) ? meals : [])
      .map((meal) => `${meal?.name || ''} ${meal?.text || ''}`)
      .join(' '),
  ).plain
  const terms = ['pizza', 'hamburgare', 'godis', 'chips', 'lask', 'kyckling', 'agg', 'kvarg', 'havregryn', 'ris', 'potatis']

  return terms.filter((term) => text.includes(term))
}

function getChangeSinceDays(weights, days) {
  const sortedWeights = getSortedWeightValues(weights)
  const latest = sortedWeights.at(-1)

  if (!latest || sortedWeights.length < 2) {
    return null
  }

  const since = latest.time - days * 24 * 60 * 60 * 1000
  const baseline = [...sortedWeights]
    .reverse()
    .find((entry) => entry.time <= since) || sortedWeights[0]

  return baseline && baseline !== latest
    ? Number((latest.value - baseline.value).toFixed(1))
    : null
}

function getAverageStepData(context) {
  const checkIns = Array.isArray(context.checkIns) ? context.checkIns : []
  const values = checkIns
    .map((entry) => normalizeCheckInMetrics(entry).steps)
    .filter((value) => Number.isFinite(value))

  if (values.length === 0) {
    return null
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function getLowEnergyDays(context) {
  const checkIns = Array.isArray(context.checkIns) ? context.checkIns : []

  return checkIns.filter((entry) => {
    const energy = normalizeCheckInMetrics(entry).energy.value

    return Number.isFinite(energy) && energy <= 4
  }).length
}

function getPoorSleepDays(context) {
  const checkIns = Array.isArray(context.checkIns) ? context.checkIns : []

  return checkIns.filter((entry) => {
    const sleep = normalizeCheckInMetrics(entry).sleep

    return Number.isFinite(sleep) && sleep < 6
  }).length
}

export function hasRecentAdvice(facts, terms) {
  const recentText = normalizeAiCoachText(facts.recentAssistantTexts.join(' ')).plain

  return terms.some((term) => recentText.includes(term))
}

export function createWeightPrognosis(facts) {
  if (
    !Number.isFinite(facts.goalWeight) ||
    !Number.isFinite(facts.latestWeight) ||
    !Number.isFinite(facts.goalRemaining) ||
    facts.weightRegistrationCount < 4
  ) {
    return null
  }

  const sortedWeights = facts.weightHistory
  const first = sortedWeights[0]
  const latest = sortedWeights.at(-1)
  const days = first && latest ? Math.max(1, (latest.time - first.time) / (24 * 60 * 60 * 1000)) : 0

  if (days < 14 || facts.weightVariation === 'high') {
    return null
  }

  const weeklyChange = Number((((latest.value - first.value) / days) * 7).toFixed(1))

  if (!Number.isFinite(weeklyChange) || Math.abs(weeklyChange) < 0.1) {
    return {
      observation: 'Vikten ser ganska stabil ut just nu.',
      text: 'Vikten ser ganska stabil ut just nu, så en målprognos blir osäker. Följ veckosnittet några veckor till innan du drar slutsatser.',
      weeklyChange,
    }
  }

  const directionToGoal = Math.sign(facts.goalWeight - facts.latestWeight)
  const trendDirection = Math.sign(weeklyChange)

  if (directionToGoal !== trendDirection) {
    return {
      observation: `Din senaste trend är cirka ${formatKg(Math.abs(weeklyChange))} per vecka åt fel håll mot målet.`,
      text: `Din senaste trend är cirka ${formatKg(Math.abs(weeklyChange))} per vecka åt fel håll mot målet. Det är en signal att fokusera på sömn, steg och måltidsrytm innan prognosen blir meningsfull.`,
      weeklyChange,
    }
  }

  const weeks = Math.abs(facts.goalRemaining / weeklyChange)

  if (!Number.isFinite(weeks) || weeks <= 0 || weeks > 156) {
    return null
  }

  const monthsMin = Math.max(1, Math.floor(weeks / 4.4))
  const monthsMax = Math.max(monthsMin, Math.ceil(weeks / 4.4))

  return {
    observation: `Din senaste trend motsvarar ungefär ${formatKg(Math.abs(weeklyChange))} per vecka.`,
    text: `Din senaste trend motsvarar ungefär ${formatKg(Math.abs(weeklyChange))} per vecka. Om den fortsätter kan du närma dig målet på cirka ${monthsMin}–${monthsMax} månader. Det är bara en uppskattning.`,
    weeklyChange,
  }
}

export function createProactiveInsights(facts) {
  const insights = []

  if (facts.poorSleepDays >= 2) {
    insights.push({
      nextStep: 'Sätt en lugn kvällsrutin och håll koffein tidigare på dagen.',
      observation: `${facts.poorSleepDays} dagar visar kort sömn.`,
      significance: 'Kort sömn kan påverka hunger, energi och återhämtning.',
    })
  }

  if (facts.averageSteps !== null && facts.averageSteps < 5000) {
    insights.push({
      nextStep: 'Lägg in 10–20 minuter promenad efter en måltid.',
      observation: `Snittet är cirka ${facts.averageSteps.toLocaleString('sv-SE')} steg.`,
      significance: 'Låga steg kan göra viktnedgången trögare.',
    })
  }

  if (facts.lowEnergyDays >= 2) {
    insights.push({
      nextStep: 'Välj ett lätt träningspass eller vilodag och prioritera matrytm.',
      observation: `${facts.lowEnergyDays} dagar har låg energi.`,
      significance: 'Låg energi flera dagar kan öka sötsug och göra rutiner svårare.',
    })
  }

  if (facts.weightRegistrationCount > 0 && facts.weightRegistrationCount < 3) {
    insights.push({
      nextStep: 'Logga vikt 2–3 gånger till innan du tolkar trenden.',
      observation: `${facts.weightRegistrationCount} viktregistreringar finns.`,
      significance: 'För få vägningar gör trendanalysen osäker.',
    })
  }

  if (facts.weightPlateau) {
    insights.push({
      nextStep: 'Jämför veckosnitt och välj en liten justering i steg eller portionsstorlek.',
      observation: 'Vikten ser ut att stå ganska still.',
      significance: 'En platå kan vara normal variation, särskilt med få veckor data.',
    })
  }

  return insights
}

export function buildAiCoachFacts(context = {}) {
  const nestedWeight = context.weight || {}
  const profile = context.profile || {}
  const goalSettings = context.progressGoalSettings || context.goalSettings || {}
  const weights = Array.isArray(context.weights) ? context.weights : nestedWeight.history || []
  const weightHistory = getSortedWeightValues(weights)
  const unifiedWeight = getUnifiedWeightFacts({
    currentWeight: firstNumber(context.currentWeight, nestedWeight.currentWeight),
    goalWeight: firstNumber(profile.goalWeight, nestedWeight.goalWeight, goalSettings.goalWeight, goalSettings.targetWeight),
    profile,
    startWeight: firstNumber(profile.startWeight, nestedWeight.startWeight),
    weights,
  })
  const latestWeight = firstNumber(unifiedWeight.currentWeight, nestedWeight.currentWeight)
  const startWeight = firstNumber(unifiedWeight.startWeight, nestedWeight.startWeight)
  const goalWeight = firstNumber(unifiedWeight.goalWeight, nestedWeight.goalWeight)
  const lossFacts = getWeightLossFacts({
    currentWeight: latestWeight,
    profile,
    weights,
  })
  const todayMeals = Array.isArray(context.todayMeals)
    ? context.todayMeals
    : getTodayMeals(context.meals?.loggedMealsToday || context.meals || [])
  const allMealsForNutrition = Array.isArray(context.meals)
    ? context.meals
    : Array.isArray(context.meals?.loggedMealsToday)
      ? context.meals.loggedMealsToday
      : todayMeals
  const loggedTodayProtein = todayMeals.reduce(
    (sum, meal) => sum + (Number.isFinite(parseNumber(meal?.protein)) ? parseNumber(meal.protein) : 0),
    0,
  )
  const todayCheckin = context.todayCheckin || context.checkIn || {}
  const checkInMetrics = normalizeCheckInMetrics(todayCheckin)
  const nutritionGoals = normalizeNutritionGoals(context.nutritionGoals)
  const dietaryPreferences = normalizeDietaryPreferences(context.dietaryPreferences || readDietaryPreferences())
  const mealTemplates = Array.isArray(context.mealTemplates) ? context.mealTemplates : readMealTemplates()
  const recipes = Array.isArray(context.recipes) ? context.recipes : readRecipes()
  const generatedMealPlans = context.generatedMealPlans || readGeneratedMealPlans()
  const latestGeneratedMealPlan = context.latestGeneratedMealPlan || getLatestGeneratedMealPlan(generatedMealPlans)
  const mealPlans = context.mealPlans || readMealPlans()
  const shoppingLists = context.shoppingLists || readShoppingLists()
  const currentPlanWeek = getMealPlanWeek(mealPlans, getMealPlanWeekStart())
  const plannedWeekSummary = buildPlannedWeekSummary(currentPlanWeek, nutritionGoals)
  const currentShoppingList = getShoppingList(shoppingLists, currentPlanWeek.weekStart)
  const proteinGoal = getNumericGoal(nutritionGoals, 'protein')
  const todayNutrition = calculateDailyNutritionSummary(
    allMealsForNutrition,
    getTodayDateString(),
    {
      ...profile,
      nutritionGoals,
    },
  )
  const todayMealTimeline = buildMealTimeline(
    allMealsForNutrition,
    getTodayDateString(),
    {
      proteinGoal: nutritionGoals.protein,
    },
  )
  const todayMealMemory = buildMealMemory(todayMealTimeline, {
    proteinGoal: nutritionGoals.protein,
  })
  const weeklyNutritionReport = buildWeeklyNutritionReport({
    date: getTodayDateString(),
    meals: allMealsForNutrition,
    nutritionGoals,
  })
  const monthlyNutritionReport = buildMonthlyNutritionReport({
    date: getTodayDateString(),
    meals: allMealsForNutrition,
    nutritionGoals,
    weights,
  })
  const nutritionActionPlan = buildNutritionActionPlan({
    date: getTodayDateString(),
    dietaryPreferences,
    meals: allMealsForNutrition,
    nutritionGoals,
    templates: mealTemplates,
    weights,
  })
  const todayProtein = todayNutrition.totals.protein > 0
    ? todayNutrition.totals.protein
    : loggedTodayProtein
  const proteinNeed = calculateProteinNeed(latestWeight)
  const change7 = getChangeSinceDays(weights, 7)
  const change30 = getChangeSinceDays(weights, 30)
  const recentChange = weightHistory.length >= 2
    ? Number((weightHistory.at(-1).value - weightHistory.at(-2).value).toFixed(1))
    : null
  const weightPlateau = weightHistory.length >= 4 && Number.isFinite(change30) && Math.abs(change30) <= 0.2
  const weightVariation = weightHistory.length >= 4 && Number.isFinite(recentChange) && Math.abs(recentChange) > 2
    ? 'high'
    : 'normal'
  const facts = {
    activityLevel: profile.activityLevel || profile.activity || '',
    age: parseNumber(profile.age),
    averageSteps: getAverageStepData(context),
    bedtimeMealCount: 0,
    caloriesGoal: getNumericGoal(nutritionGoals, 'calories'),
    caloriesGoalSource: nutritionGoals.caloriesGoalSource || '',
    change30,
    change7,
    dietaryPreferences,
    energy: checkInMetrics.energy.value,
    energyLabel: checkInMetrics.energy.displayLabel,
    energyLevel: checkInMetrics.energy.level,
    gender: profile.gender || profile.sex || '',
    goalRemaining: unifiedWeight.goalRemaining,
    goalWeight,
    height: parseNumber(profile.height),
    latestCoachReply: getLastAssistantMessage(context.chatHistory),
    latestMealAnalysis: getLatestMealAnalysis(context.mealHistory || context.meals?.history),
    latestWeight,
    lowEnergyDays: getLowEnergyDays(context),
    mood: checkInMetrics.mood.displayLabel === 'Saknas' ? '' : checkInMetrics.mood.displayLabel,
    moodKey: checkInMetrics.mood.key,
    moodScore: checkInMetrics.mood.score,
    poorSleepDays: getPoorSleepDays(context),
    monthlyNutritionReport,
    mealTemplates,
    recipes,
    generatedMealPlans,
    latestGeneratedMealPlan,
    nutritionActionPlan,
    mealPlanInsights: buildMealPlanInsights(currentPlanWeek, nutritionGoals),
    mealPlanSuggestions: buildMealPlanSuggestions({
      dietaryPreferences,
      goals: nutritionGoals,
      templates: mealTemplates,
      week: currentPlanWeek,
    }),
    proteinDistributionPlan: buildProteinDistributionPlan(nutritionGoals.protein, allMealsForNutrition, { date: getTodayDateString() }),
    proteinGoal: proteinGoal ?? null,
    proteinGoalLabel: proteinGoal
      ? getGoalLabelFromText(nutritionGoals.protein) || `${proteinGoal} g`
      : proteinNeed
        ? `${proteinNeed.lower}–${proteinNeed.upper} g`
        : null,
    proteinGoalSource: nutritionGoals.proteinGoalSource || '',
    recentAssistantTexts: getRecentAssistantTexts(context.chatHistory),
    recentFoods: getFoodTermsFromMeals(context.meals),
    recentMeals: getRecentMeals(context.meals?.loggedMealsToday || context.meals || []),
    sleepHours: checkInMetrics.sleep,
    sleepLabel: checkInMetrics.sleepLabel,
    sleepLevel: checkInMetrics.sleepLevel,
    plannedWeek: currentPlanWeek,
    plannedWeekSummary,
    startWeight: lossFacts.startWeight ?? startWeight,
    steps: checkInMetrics.steps,
    stepsLabel: checkInMetrics.stepsLabel,
    todayCheckin,
    todayMealMemory,
    todayMealTimeline,
    todayMeals,
    todayNutrition,
    todayProtein,
    shoppingList: currentShoppingList,
    suggestedCalorieGoal: calculateSuggestedCalorieGoal(profile, { weights }),
    suggestedProteinGoal: calculateSuggestedProteinGoal(profile, { weights }),
    training: checkInMetrics.workout.completed ? checkInMetrics.workout.displayLabel : '',
    water: todayCheckin.water ?? null,
    weightHistory,
    weightLost: lossFacts.weightLost,
    weeklyNutritionReport,
    weightPlateau,
    weightRegistrationCount: weightHistory.length,
    weightTrend: unifiedWeight.trend,
    weightVariation,
  }

  facts.progressDashboard = buildProgressDashboardAnalytics({
    checkIn: todayCheckin,
    checkIns: context.checkIns,
    foods: context.foods,
    generatedMealPlans,
    mealPlans,
    meals: allMealsForNutrition,
    nutritionGoals,
    profile,
    weights,
    weeklyReportData: context.latestWeeklyReport || context.weeklyReportData,
  }, { period: context.progressPeriod || '30d' })

  facts.lastDiscussedTopic = getLastDiscussedTopic(context.chatHistory)
  facts.proactiveInsights = createProactiveInsights(facts)
  facts.weightPrognosis = createWeightPrognosis(facts)

  return facts
}
