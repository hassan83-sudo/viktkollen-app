import {
  buildMealMemory,
  buildMealMemoryInsights,
  buildMealTimeline,
  calculateDailyNutritionSummary,
  formatApproxCalories,
  formatApproxGrams,
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

function getGoalTarget(goal) {
  if (!goal) return null

  if (Number.isFinite(goal.target)) return goal.target
  if (Number.isFinite(goal)) return goal

  return null
}

function makeProgress({ goal, label, unit, value }) {
  const target = getGoalTarget(goal)
  const safeValue = safeNumber(value)

  if (!Number.isFinite(target) || target <= 0) {
    return {
      hasGoal: false,
      label,
      status: 'missing',
      text: 'Inget mål satt',
      unit,
      value: safeValue,
      valueText: formatInteger(safeValue, unit),
      visualPercent: 0,
    }
  }

  const percent = Math.round((safeValue / target) * 100)
  const remaining = Math.round(target - safeValue)
  const reached = safeValue >= target

  return {
    goal: target,
    goalText: formatInteger(target, unit),
    hasGoal: true,
    label,
    percent,
    status: reached ? 'reached' : 'active',
    text: reached
      ? 'Målet uppnått'
      : `${Math.max(0, remaining).toLocaleString('sv-SE')} ${unit} kvar`,
    unit,
    value: safeValue,
    valueText: formatInteger(safeValue, unit),
    visualPercent: Math.max(0, Math.min(percent, 100)),
  }
}

function getMealLabel(entry) {
  const label = entry.mealType || 'måltid'

  return label.charAt(0).toLocaleUpperCase('sv-SE') + label.slice(1)
}

function getMealStatus(entry) {
  if (entry.analysis.unknownFoods.length > 0) {
    return {
      detail: `${entry.analysis.unknownFoods.join(', ')} kunde inte identifieras`,
      label: 'Delvis analyserad',
    }
  }

  if (entry.analysis.items.length > 0) {
    return {
      detail: '',
      label: 'Analyserad',
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
  const summary = calculateDailyNutritionSummary(meals, date, {
    nutritionGoals,
  })
  const timeline = buildMealTimeline(meals, summary.date, {
    proteinGoal: nutritionGoals.protein,
  })
  const memory = buildMealMemory(timeline, {
    proteinGoal: nutritionGoals.protein,
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
      calories: makeProgress({
        goal: caloriesGoal,
        label: 'Kalorier',
        unit: 'kcal',
        value: summary.totals.calories,
      }),
      protein: makeProgress({
        goal: summary.proteinGoal,
        label: 'Protein',
        unit: 'g',
        value: summary.totals.protein,
      }),
    },
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
