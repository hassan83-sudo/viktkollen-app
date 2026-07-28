import { formatApproxCalories, formatApproxGrams } from './nutritionCalculator.js'
import { parseProteinGoal } from './nutritionGoals.js'

function getLargestMeal(entries) {
  return [...entries].sort((first, second) => second.totals.calories - first.totals.calories)[0] || null
}

function getMostProteinMeal(entries) {
  return [...entries].sort((first, second) => second.totals.protein - first.totals.protein)[0] || null
}

function getLongGaps(entries) {
  return entries
    .map((entry, index) => {
      const next = entries[index + 1]

      if (!next || !Number.isFinite(entry.minutes) || !Number.isFinite(next.minutes)) {
        return null
      }

      const hours = Math.round(((next.minutes - entry.minutes) / 60) * 10) / 10

      return hours >= 5
        ? {
            from: entry,
            hours,
            to: next,
          }
        : null
    })
    .filter(Boolean)
}

function buildSignals(entries, totals, proteinGoal) {
  const sweetsCount = entries.filter((entry) => entry.analysis.flags.containsSweets).length
  const fastFoodCount = entries.filter((entry) => entry.analysis.flags.containsFastFood).length
  const vegetableCount = entries.filter((entry) => entry.analysis.flags.containsVegetables).length
  const largeMeals = entries.filter((entry) => entry.analysis.flags.largeMeal)
  const smallMeals = entries.filter((entry) => entry.totals.calories > 0 && entry.totals.calories < 250)
  const longGaps = getLongGaps(entries)
  const lowProteinThreshold = proteinGoal ? proteinGoal.target * 0.55 : 45

  return {
    fewLargeMeals: entries.length <= 2 && largeMeals.length >= 1,
    longGaps,
    lowProteinToday: totals.protein > 0 && totals.protein < lowProteinThreshold,
    manySmallMeals: entries.length >= 5 && smallMeals.length >= 4,
    manySweets: sweetsCount >= 2,
    muchFastFood: fastFoodCount >= 2,
    noVegetables: entries.length > 0 && vegetableCount === 0,
  }
}

function buildRecommendations(signals, timeline, proteinGoal) {
  const recommendations = []

  if (proteinGoal && timeline.totals.protein < proteinGoal.target) {
    const remaining = Math.max(0, Math.round(proteinGoal.target - timeline.totals.protein))

    recommendations.push(`Ett proteinrikt kvällsmål skulle hjälpa dig närma dig målet; ungefär ${remaining.toLocaleString('sv-SE')} g protein återstår.`)
  }

  if (signals.lowProteinToday) {
    recommendations.push('Nästa måltid kan gärna ha en tydlig proteinkälla, till exempel kvarg, ägg, kyckling, fisk eller keso.')
  }

  if (signals.noVegetables) {
    recommendations.push('Lägg gärna till grönsaker i nästa måltid för mer volym och variation.')
  }

  if (signals.manySweets || signals.muchFastFood) {
    recommendations.push('Fortsätt med en vanlig måltid härnäst och välj gärna vatten, protein och något grönt.')
  }

  if (signals.longGaps.length) {
    recommendations.push('Planera gärna ett enkelt mellanmål om det ofta blir långt mellan måltiderna.')
  }

  return [...new Set(recommendations)]
}

export function buildMealMemory(timeline, options = {}) {
  const entries = timeline?.entries || []
  const proteinGoal = parseProteinGoal(options.proteinGoal)
  const largestMeal = getLargestMeal(entries)
  const mostProteinMeal = getMostProteinMeal(entries)
  const signals = buildSignals(entries, timeline?.totals || {}, proteinGoal)
  const recommendations = buildRecommendations(signals, timeline, proteinGoal)

  return {
    largestMeal,
    mostProteinMeal,
    proteinGoal,
    recommendations,
    signals,
    summaryText: entries.length
      ? `Du har ${entries.length.toLocaleString('sv-SE')} måltider i dagens tidslinje, ungefär ${formatApproxGrams(timeline.totals.protein)} protein och ${formatApproxCalories(timeline.totals.calories)}.`
      : 'Jag hittar inga måltider i dagens tidslinje ännu.',
  }
}

export function buildMealMemoryInsights(timeline, memory) {
  const insights = []
  const proteinGoal = memory?.proteinGoal || null

  if (proteinGoal && timeline?.totals?.protein >= proteinGoal.target) {
    insights.push('Du har redan nått ditt proteinmål.')
  }

  if (memory?.signals?.lowProteinToday) {
    insights.push('Dagens proteinintag är fortfarande lågt jämfört med ditt mål.')
  }

  if (memory?.signals?.noVegetables) {
    insights.push('Inga identifierade grönsaker finns bland dagens måltider.')
  }

  if (memory?.signals?.muchFastFood) {
    insights.push('Dagen innehåller flera snabbmatsmåltider.')
  }

  if (memory?.signals?.manySweets) {
    insights.push('Dagen innehåller flera söta eller salta snacks.')
  }

  if (memory?.signals?.longGaps?.length) {
    const gap = memory.signals.longGaps[0]

    insights.push(`Det var ett långt uppehåll mellan ${gap.from.mealType || 'en måltid'} och ${gap.to.mealType || 'nästa måltid'}.`)
  }

  if (memory?.signals?.fewLargeMeals) {
    insights.push('Dagen bygger mest på få större måltider.')
  }

  memory?.recommendations?.forEach((recommendation) => {
    insights.push(recommendation)
  })

  return [...new Set(insights)].slice(0, 3)
}
