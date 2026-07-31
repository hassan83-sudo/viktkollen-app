import {
  buildMealMemory,
  buildMealMemoryInsights,
  buildMealTimeline,
  calculateDailyNutritionSummary,
  formatApproxCalories,
  formatApproxGrams,
  makeNutritionGoalProgress,
  normalizeNutritionGoals,
} from '../../services/nutrition/nutritionEngine.js'

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function formatInteger(value, unit) {
  return `${Math.round(safeNumber(value)).toLocaleString('sv-SE')} ${unit}`
}

function formatDateLabel(dateText) {
  const parsed = new Date(`${dateText}T12:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return 'Dagens datum'
  }

  const label = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(parsed)

  return label.charAt(0).toLocaleUpperCase('sv-SE') + label.slice(1)
}

function getMealLabel(entry) {
  const label = entry.mealType || 'måltid'

  return label.charAt(0).toLocaleUpperCase('sv-SE') + label.slice(1)
}

function getMealStatus(entry) {
  if (entry.effectiveNutrition?.source === 'manual') {
    return {
      detail: '',
      label: 'Manuellt korrigerad',
    }
  }

  if (entry.effectiveNutrition?.source === 'partial_manual') {
    return {
      detail: '',
      label: 'Delvis manuellt korrigerad',
    }
  }

  if (entry.analysis.unknownFoods.length > 0) {
    return {
      detail: `${entry.analysis.unknownFoods.join(', ')} kunde inte identifieras`,
      label: 'Delvis analyserad · Automatisk uppskattning',
    }
  }

  if (entry.analysis.items.length > 0) {
    return {
      detail: '',
      label: 'Automatisk uppskattning',
    }
  }

  return {
    detail: '',
    label: 'Kunde inte analyseras',
  }
}

function makeTimelineRows(timeline) {
  return timeline.entries.map((entry) => {
    const status = getMealStatus(entry)

    return {
      caloriesText: formatApproxCalories(entry.totals.calories),
      description: entry.text || 'Måltid utan text',
      id: entry.id,
      mealType: getMealLabel(entry),
      proteinText: formatApproxGrams(entry.totals.protein),
      showApproxCalories: !entry.effectiveNutrition?.manualFields?.includes('calories'),
      showApproxProtein: !entry.effectiveNutrition?.manualFields?.includes('protein'),
      status,
      time: entry.time,
    }
  })
}

function makeComparisons(memory, timeline) {
  const comparisons = []

  if (memory.mostProteinMeal) {
    comparisons.push({
      label: 'Mest protein',
      text: `${getMealLabel(memory.mostProteinMeal)}, ${formatApproxGrams(memory.mostProteinMeal.totals.protein)}.`,
    })
  }

  if (memory.largestMeal) {
    comparisons.push({
      label: 'Största måltid',
      text: `${getMealLabel(memory.largestMeal)}, ${formatApproxCalories(memory.largestMeal.totals.calories)}.`,
    })
  }

  const latest = timeline.entries.at(-1)

  if (latest) {
    comparisons.push({
      label: 'Senaste måltid',
      text: `${getMealLabel(latest)}${latest.time ? ` ${latest.time}` : ''}.`,
    })
  }

  if (timeline.mealCount > 0) {
    comparisons.push({
      label: 'Antal måltider',
      text: `${timeline.mealCount.toLocaleString('sv-SE')} idag.`,
    })
  }

  return comparisons
}

export function createNutritionDashboardModel({
  date,
  meals = [],
  nutritionGoals = {},
} = {}) {
  const normalizedGoals = normalizeNutritionGoals(nutritionGoals)
  const summary = calculateDailyNutritionSummary(meals, date, {
    nutritionGoals: normalizedGoals,
  })
  const timeline = buildMealTimeline(meals, summary.date, {
    proteinGoal: normalizedGoals.protein,
  })
  const memory = buildMealMemory(timeline, {
    proteinGoal: normalizedGoals.protein,
  })
  const insights = buildMealMemoryInsights(timeline, memory)
  const caloriesGoal = Number.isFinite(summary.caloriesGoal) ? summary.caloriesGoal : null
  const analyzedMealCount = timeline.entries.filter((entry) => entry.analysis.items.length > 0).length

  return {
    comparisons: makeComparisons(memory, timeline),
    dateLabel: formatDateLabel(summary.date),
    hasMeals: timeline.mealCount > 0,
    insights,
    progress: {
      calories: makeNutritionGoalProgress(summary.totals.calories, caloriesGoal, 'kcal', 'Kalorier'),
      carbs: makeNutritionGoalProgress(summary.totals.carbs, normalizedGoals.carbs, 'g', 'Kolhydrater'),
      fat: makeNutritionGoalProgress(summary.totals.fat, normalizedGoals.fat, 'g', 'Fett'),
      fiber: makeNutritionGoalProgress(summary.totals.fiber, normalizedGoals.fiber, 'g', 'Fibrer'),
      protein: makeNutritionGoalProgress(summary.totals.protein, summary.proteinGoal, 'g', 'Protein'),
    },
    quality: summary.quality,
    summary: {
      analyzedMealCount,
      calories: formatInteger(summary.totals.calories, 'kcal'),
      carbs: formatInteger(summary.totals.carbs, 'g'),
      fat: formatInteger(summary.totals.fat, 'g'),
      mealCount: timeline.mealCount,
      partiallyAnalyzedMealCount: timeline.entries.filter((entry) => entry.analysis.unknownFoods.length > 0).length,
      protein: formatInteger(summary.totals.protein, 'g'),
      unanalyzedMealCount: Math.max(0, timeline.mealCount - analyzedMealCount),
    },
    timeline: makeTimelineRows(timeline),
  }
}
