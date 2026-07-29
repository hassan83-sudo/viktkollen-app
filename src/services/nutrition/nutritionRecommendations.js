import { calculateDailyNutritionSummary } from './dailyNutritionSummary.js'
import { getMealTemplatePreview, normalizeMealTemplates } from './mealTemplates.js'
import { buildMonthlyNutritionReport } from './monthlyNutritionSummary.js'
import { formatApproxCalories, formatApproxGrams } from './nutritionCalculator.js'
import { makeNutritionGoalProgress, normalizeNutritionGoals } from './nutritionGoals.js'
import { buildWeeklyNutritionReport } from './weeklyNutritionSummary.js'

const defaultLimit = { day: 3, month: 4, week: 3 }
const suggestionLibrary = [
  {
    description: 'Två ägg med kvarg eller yoghurt.',
    estimatedCaloriesRange: 'cirka 250-400 kcal',
    estimatedProteinRange: 'cirka 25-35 g protein',
    name: 'Ägg och kvarg',
    suitableMealTypes: ['frukost', 'mellanmål', 'kvällsmål'],
    tags: ['protein'],
  },
  {
    description: 'Kyckling med potatis, ris eller grönsaker.',
    estimatedCaloriesRange: 'cirka 450-650 kcal',
    estimatedProteinRange: 'cirka 30-45 g protein',
    name: 'Kycklingmåltid',
    suitableMealTypes: ['lunch', 'middag'],
    tags: ['protein', 'måltid'],
  },
  {
    description: 'Keso eller yoghurt med frukt.',
    estimatedCaloriesRange: 'cirka 180-350 kcal',
    estimatedProteinRange: 'cirka 18-30 g protein',
    name: 'Keso och frukt',
    suitableMealTypes: ['mellanmål', 'kvällsmål'],
    tags: ['protein', 'snabb'],
  },
  {
    description: 'Fisk med potatis eller ris och något grönt.',
    estimatedCaloriesRange: 'cirka 450-700 kcal',
    estimatedProteinRange: 'cirka 30-45 g protein',
    name: 'Fiskmåltid',
    suitableMealTypes: ['lunch', 'middag'],
    tags: ['protein', 'måltid'],
  },
  {
    description: 'Bönor eller tofu med ris och grönsaker.',
    estimatedCaloriesRange: 'cirka 400-650 kcal',
    estimatedProteinRange: 'cirka 20-35 g protein',
    name: 'Bönor eller tofu',
    suitableMealTypes: ['lunch', 'middag'],
    tags: ['protein', 'vegetariskt'],
  },
]

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function round(value) {
  return Math.round(safeNumber(value))
}

function hasMealType(summary, type) {
  return summary.analyzedMeals.some((entry) =>
    String(entry.meal?.type || entry.meal?.mealType || entry.analysis?.mealType || '')
      .toLocaleLowerCase('sv-SE')
      .includes(type),
  )
}

function confidenceFromQuality(quality) {
  if (!quality?.validMealCount) return 'low'
  if (quality.reviewMealCount > 1 || quality.lowConfidenceMeals > 1) return 'low'
  if (quality.reviewMealCount > 0 || quality.mediumConfidenceMeals > 0) return 'medium'
  return 'high'
}

function confidenceLabel(confidence) {
  if (confidence === 'high') return 'Tydligt underlag'
  if (confidence === 'medium') return 'Delvis tydligt underlag'
  return 'Begränsat underlag'
}

function createRecommendation(seed) {
  return {
    action: seed.action || '',
    category: seed.category || 'general',
    confidence: seed.confidence || 'medium',
    dismissible: seed.dismissible !== false,
    id: seed.id || `${seed.scope}-${seed.category}-${seed.relatedGoal || seed.title}`,
    message: seed.message || '',
    priority: seed.priority || 'medium',
    reason: seed.reason || '',
    relatedGoal: seed.relatedGoal || '',
    scope: seed.scope,
    sourceData: seed.sourceData || {},
    suggestion: seed.suggestion || null,
    template: seed.template || null,
    title: seed.title,
  }
}

function scorePriority(recommendation) {
  const categoryRank = {
    quality: 1,
    empty: 2,
    goal: 3,
    protein: 4,
    pattern: 5,
    template: 6,
    trend: 7,
  }[recommendation.category] || 9
  const priorityRank = { high: 0, medium: 1, low: 2 }[recommendation.priority] || 1

  return categoryRank * 10 + priorityRank
}

export function dedupeNutritionRecommendations(recommendations = []) {
  const seen = new Set()

  return recommendations.filter((recommendation) => {
    const key = `${recommendation.scope}|${recommendation.category}|${recommendation.relatedGoal || recommendation.title}`

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function prioritizeNutritionActions(recommendations = [], options = {}) {
  const limit = options.limit ?? defaultLimit[recommendations[0]?.scope] ?? 3
  let highUsed = false

  return dedupeNutritionRecommendations(recommendations)
    .map((recommendation, index) => ({ ...recommendation, originalIndex: index }))
    .sort((first, second) => scorePriority(first) - scorePriority(second) || first.originalIndex - second.originalIndex || first.id.localeCompare(second.id, 'sv-SE'))
    .map((entry) => {
      const recommendation = { ...entry }

      delete recommendation.originalIndex

      if (recommendation.priority === 'high') {
        if (highUsed) return { ...recommendation, priority: 'medium' }
        highUsed = true
      }

      return recommendation
    })
    .slice(0, limit)
}

function findTemplateSuggestions(templates = [], remainingProtein = 0) {
  return normalizeMealTemplates(templates)
    .map((template) => {
      const preview = getMealTemplatePreview(template)
      const protein = safeNumber(preview.totals.protein)
      const distance = Math.abs(protein - remainingProtein)

      return { distance, preview, protein, template }
    })
    .filter((entry) => entry.protein >= 10 && (!remainingProtein || entry.distance <= Math.max(15, remainingProtein * 0.7)))
    .sort((first, second) => first.distance - second.distance || second.template.useCount - first.template.useCount || first.template.name.localeCompare(second.template.name, 'sv-SE'))
    .slice(0, 3)
}

export function buildMealSuggestions({ mealType = '', remainingProtein = 0, templates = [] } = {}) {
  const templateSuggestions = findTemplateSuggestions(templates, remainingProtein).map((entry) => ({
    description: `Din mall "${entry.template.name}" ligger nära det protein som återstår idag.`,
    estimatedCaloriesRange: formatApproxCalories(entry.preview.totals.calories),
    estimatedProteinRange: formatApproxGrams(entry.preview.totals.protein),
    name: entry.template.name,
    suitableMealTypes: [entry.template.mealType],
    tags: ['mall', 'protein'],
    template: entry.template,
  }))

  if (templateSuggestions.length) return templateSuggestions.slice(0, 3)

  const normalizedType = String(mealType || '').toLocaleLowerCase('sv-SE')
  const library = suggestionLibrary
    .filter((suggestion) => !normalizedType || suggestion.suitableMealTypes.includes(normalizedType) || suggestion.tags.includes('protein'))
    .slice(0, 3)

  return library
}

export function buildRecommendationExplanation(recommendation) {
  const points = []

  if (recommendation.sourceData?.goalText) points.push(recommendation.sourceData.goalText)
  if (recommendation.sourceData?.currentText) points.push(recommendation.sourceData.currentText)
  if (recommendation.confidence && recommendation.confidence !== 'high') points.push(`Underlag: ${confidenceLabel(recommendation.confidence).toLocaleLowerCase('sv-SE')}.`)
  if (recommendation.sourceData?.qualityText && points.length < 3) points.push(recommendation.sourceData.qualityText)

  return points.slice(0, 3).join(' ') || recommendation.reason || 'Rekommendationen bygger på registrerad nutritiondata och dina sparade mål.'
}

export function buildDailyNutritionRecommendations({
  date,
  meals = [],
  nutritionGoals = {},
  templates = [],
  now = new Date(),
} = {}) {
  const goals = normalizeNutritionGoals(nutritionGoals)
  const summary = calculateDailyNutritionSummary(meals, date, { nutritionGoals: goals })
  const qualityConfidence = confidenceFromQuality(summary.quality)
  const recommendations = []
  const proteinProgress = makeNutritionGoalProgress(summary.totals.protein, summary.proteinGoal, 'g', 'Protein')
  const caloriesGoal = Number.isFinite(summary.caloriesGoal) ? summary.caloriesGoal : null
  const caloriesProgress = makeNutritionGoalProgress(summary.totals.calories, caloriesGoal, 'kcal', 'Kalorier')

  if (summary.mealCount === 0) {
    recommendations.push(createRecommendation({
      action: 'Registrera en måltid när du vill få mer riktade råd.',
      category: 'empty',
      confidence: 'low',
      message: 'Registrera en måltid för att få personliga rekommendationer.',
      priority: 'high',
      relatedGoal: 'data',
      scope: 'day',
      title: 'Ingen nutritiondata idag',
    }))
  }

  if (!summary.proteinGoal && !caloriesGoal) {
    recommendations.push(createRecommendation({
      action: 'Sätt ett protein- eller kalorimål om du vill ha mer riktade rekommendationer.',
      category: 'goal',
      confidence: 'low',
      message: 'Utan sparade mål blir råden mer generella.',
      priority: summary.mealCount ? 'medium' : 'low',
      relatedGoal: 'goals',
      scope: 'day',
      title: 'Inga nutritionmål satta',
    }))
  }

  if (summary.quality.reviewMealCount > 0) {
    recommendations.push(createRecommendation({
      action: 'Komplettera gärna vaga måltider med mängd eller portion.',
      category: 'quality',
      confidence: 'medium',
      message: `${summary.quality.reviewMealCount} måltider har begränsat underlag.`,
      priority: 'high',
      relatedGoal: 'quality',
      scope: 'day',
      sourceData: { qualityText: summary.quality.analyzedCoverage },
      title: 'Förbättra underlaget',
    }))
  }

  if (summary.proteinGoal && summary.mealCount > 0) {
    if (proteinProgress.status === 'reached') {
      recommendations.push(createRecommendation({
        action: 'Ingen extra proteinåtgärd behövs för målets skull.',
        category: 'goal',
        confidence: qualityConfidence,
        message: 'Dagens registrerade måltider når ditt proteinmål.',
        priority: 'low',
        relatedGoal: 'protein',
        scope: 'day',
        sourceData: {
          currentText: `Dagens måltider uppskattas innehålla ${round(summary.totals.protein)} g protein.`,
          goalText: `Proteinmålet är ${summary.proteinGoal.label}.`,
        },
        title: 'Proteinmålet är uppnått',
      }))
    } else if (proteinProgress.remaining > 0) {
      const remaining = Math.max(0, round(proteinProgress.remaining))
      const mealType = new Date(now).getHours() >= 17 ? 'kvällsmål' : 'mellanmål'
      const suggestions = buildMealSuggestions({ mealType, remainingProtein: remaining, templates })
      const topSuggestion = suggestions[0]

      recommendations.push(createRecommendation({
        action: remaining <= 20
          ? 'Ett litet proteinrikt alternativ kan räcka om du planerar att äta mer idag.'
          : 'Välj ett proteinrikt mellanmål eller använd en passande måltidsmall.',
        category: 'protein',
        confidence: qualityConfidence,
        message: `Du har cirka ${remaining} g protein kvar till dagens mål.`,
        priority: remaining >= 25 ? 'high' : 'medium',
        relatedGoal: 'protein',
        scope: 'day',
        sourceData: {
          currentText: `Dagens måltider uppskattas innehålla ${round(summary.totals.protein)} g protein.`,
          goalText: `Proteinmålet är ${summary.proteinGoal.label}.`,
        },
        suggestion: topSuggestion || null,
        template: topSuggestion?.template || null,
        title: remaining >= 25 ? 'Protein kvar idag' : 'Lite protein kvar',
      }))
    }
  }

  if (caloriesGoal && summary.mealCount > 0) {
    if (summary.totals.calories > caloriesGoal) {
      recommendations.push(createRecommendation({
        action: 'Fortsätt med vanlig mat vid nästa måltid och använd detta som en neutral dagsnotering.',
        category: 'goal',
        confidence: qualityConfidence,
        message: 'Kalorimålet är passerat i dagens registrering.',
        priority: 'low',
        relatedGoal: 'calories',
        scope: 'day',
        sourceData: {
          currentText: `Dagens måltider uppskattas till ${round(summary.totals.calories)} kcal.`,
          goalText: `Kalorimålet är ${round(caloriesGoal)} kcal.`,
        },
        title: 'Kalorimålet är passerat',
      }))
    } else if (caloriesProgress.percent >= 85) {
      recommendations.push(createRecommendation({
        action: 'Om du äter mer idag kan ett lättare, mättande alternativ passa.',
        category: 'goal',
        confidence: qualityConfidence,
        message: 'Dagens kalorimål är nära uppnått.',
        priority: 'low',
        relatedGoal: 'calories',
        scope: 'day',
        title: 'Kalorimålet är nära',
      }))
    }
  }

  if (summary.mealCount > 0 && !hasMealType(summary, 'lunch') && new Date(now).getHours() >= 13) {
    recommendations.push(createRecommendation({
      action: 'Om lunch saknas för att du inte hunnit logga den kan Quick Add eller en mall spara tid.',
      category: 'template',
      confidence: 'medium',
      message: 'Ingen lunch syns i dagens registrering.',
      priority: 'low',
      relatedGoal: 'logging',
      scope: 'day',
      title: 'Lunch saknas i loggen',
    }))
  }

  return prioritizeNutritionActions(recommendations, { limit: defaultLimit.day })
}

export function buildWeeklyNutritionRecommendations({ date, meals = [], nutritionGoals = {}, templates = [] } = {}) {
  const report = buildWeeklyNutritionReport({ date, meals, nutritionGoals })
  const summary = report.summary
  const recommendations = []

  if (summary.quality.reviewMealCount > 0) {
    recommendations.push(createRecommendation({
      action: 'Komplettera gärna måltider med mängder för tydligare veckoöversikt.',
      category: 'quality',
      confidence: 'medium',
      message: `${summary.quality.reviewMealCount} måltider har begränsat underlag.`,
      priority: 'high',
      relatedGoal: 'quality',
      scope: 'week',
      title: 'Stärk veckans underlag',
    }))
  }

  if (summary.registeredDays < 4) {
    recommendations.push(createRecommendation({
      action: 'Registrera några fler luncher eller middagar för en mer användbar veckobild.',
      category: 'empty',
      confidence: 'low',
      message: `Du har registrerat mat ${summary.registeredDays} av 7 dagar.`,
      priority: 'high',
      relatedGoal: 'logging',
      scope: 'week',
      title: 'Begränsad veckoregistrering',
    }))
  }

  if (summary.registeredDays >= 2 && summary.proteinGoalDays < Math.max(1, Math.floor(summary.registeredDays * 0.6))) {
    recommendations.push(createRecommendation({
      action: 'Testa ett återkommande proteinrikt alternativ till frukost eller lunch.',
      category: 'protein',
      confidence: confidenceFromQuality(summary.quality),
      message: 'Proteinmålet nås inte stabilt på registrerade dagar.',
      priority: 'medium',
      relatedGoal: 'protein',
      scope: 'week',
      title: 'Jämnare protein över veckan',
    }))
  }

  if (summary.patterns.longGaps > 0) {
    recommendations.push(createRecommendation({
      action: 'Planera ett enkelt mellanmål på dagar där det ofta blir långt mellan måltider.',
      category: 'pattern',
      confidence: 'medium',
      message: `${summary.patterns.longGaps} tillfällen hade långa måltidsuppehåll.`,
      priority: 'medium',
      relatedGoal: 'meal_rhythm',
      scope: 'week',
      title: 'Långa uppehåll mellan måltider',
    }))
  }

  if (summary.mealCount >= 6 && normalizeMealTemplates(templates).length === 0) {
    recommendations.push(createRecommendation({
      action: 'Skapa en mall för en återkommande lunch eller frukost.',
      category: 'template',
      confidence: 'medium',
      message: 'Måltidsmallar kan göra registreringen snabbare.',
      priority: 'low',
      relatedGoal: 'templates',
      scope: 'week',
      title: 'Skapa en snabb mall',
    }))
  }

  return prioritizeNutritionActions(recommendations, { limit: defaultLimit.week })
}

export function buildMonthlyNutritionRecommendations({ date, meals = [], nutritionGoals = {}, templates = [], weights = [] } = {}) {
  const report = buildMonthlyNutritionReport({ date, meals, nutritionGoals, weights })
  const summary = report.summary
  const recommendations = []

  if (summary.quality.reviewMealCount > 0) {
    recommendations.push(createRecommendation({
      action: 'Komplettera återkommande vaga måltider med mängder när du har möjlighet.',
      category: 'quality',
      confidence: 'medium',
      message: `${summary.quality.reviewMealCount} måltider kan behöva tydligare underlag.`,
      priority: 'high',
      relatedGoal: 'quality',
      scope: 'month',
      title: 'Tydligare månadsunderlag',
    }))
  }

  if (!['good', 'near_complete'].includes(summary.coverage.level)) {
    recommendations.push(createRecommendation({
      action: 'Sikta på att registrera åtminstone en måltid fler dagar nästa månad.',
      category: 'empty',
      confidence: 'low',
      message: `Du registrerade ${summary.registeredDays} av ${summary.elapsedDays} möjliga dagar.`,
      priority: 'high',
      relatedGoal: 'logging',
      scope: 'month',
      title: 'Fler registrerade dagar',
    }))
  }

  if (summary.weeklyBreakdown.length > 1) {
    const proteinAverages = summary.weeklyBreakdown.filter((week) => week.registeredDays > 0).map((week) => week.proteinAverage)
    const spread = proteinAverages.length ? Math.max(...proteinAverages) - Math.min(...proteinAverages) : 0

    if (spread >= 25) {
      recommendations.push(createRecommendation({
        action: 'Välj ett återkommande proteinrikt basalternativ under veckor där intaget brukar bli lägre.',
        category: 'protein',
        confidence: confidenceFromQuality(summary.quality),
        message: 'Proteinintaget varierar tydligt mellan registrerade veckor.',
        priority: 'medium',
        relatedGoal: 'protein',
        scope: 'month',
        title: 'Jämna ut protein mellan veckor',
      }))
    }
  }

  if (summary.mealCount >= 8 && normalizeMealTemplates(templates).length > 0) {
    recommendations.push(createRecommendation({
      action: 'Fortsätt använda mallar för återkommande måltider.',
      category: 'template',
      confidence: 'medium',
      message: 'Mallar passar bra när flera måltider återkommer.',
      priority: 'low',
      relatedGoal: 'templates',
      scope: 'month',
      title: 'Återanvänd måltidsmallar',
    }))
  }

  if (summary.weightRelation?.limited) {
    recommendations.push(createRecommendation({
      action: 'Tolka månadens viktkoppling försiktigt och följ fler registreringar över tid.',
      category: 'trend',
      confidence: 'low',
      message: 'Viktdata finns men underlaget är begränsat.',
      priority: 'low',
      relatedGoal: 'weight',
      scope: 'month',
      title: 'Tolka viktdata varsamt',
    }))
  }

  return prioritizeNutritionActions(recommendations, { limit: defaultLimit.month })
}

export function buildNutritionActionPlan(options = {}) {
  return {
    nextMonth: buildMonthlyNutritionRecommendations(options),
    thisWeek: buildWeeklyNutritionRecommendations(options),
    today: buildDailyNutritionRecommendations(options),
  }
}

export const nutritionRecommendationInternals = {
  confidenceFromQuality,
  confidenceLabel,
  suggestionLibrary,
}
