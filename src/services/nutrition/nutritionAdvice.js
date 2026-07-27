import { formatNutritionValue } from './nutritionCalculator.js'

function joinFoodNames(items) {
  return items.map((item) => item.food.name.toLocaleLowerCase('sv-SE')).join(', ')
}

function buildEstimateText(analysis) {
  if (!analysis.items.length) return ''

  return ` Jag uppskattar måltiden till cirka ${formatNutritionValue(analysis.totals.protein)} protein och ${formatNutritionValue(analysis.totals.calories, 'kcal')}.`
}

function buildProteinGoalText(analysis) {
  if (!analysis.proteinContribution) return ''

  const { goal, percent } = analysis.proteinContribution

  return ` Det motsvarar ungefär ${percent} % av ditt proteinmål ${goal.label}.`
}

function buildFlagText(analysis) {
  if (analysis.flags.largeMeal && analysis.flags.containsFastFood) {
    return ' Det ser ut som en större snabbmatsmåltid, så nästa konkreta steg är att dricka vatten och låta nästa måltid vara vanlig, proteinrik och grönare.'
  }

  if (analysis.flags.containsFastFood) {
    return ' Måltiden är ganska energität, så balansera gärna resten av dagen med protein och grönsaker.'
  }

  if (analysis.flags.containsSweets) {
    return ' Godis, chips eller läsk är inte ett misslyckande. Bestäm en rimlig mängd, fortsätt sedan med vanlig mat så blodsocker och hunger blir stabilare.'
  }

  if (analysis.flags.proteinRich) {
    return ' Det här ser proteinrikt ut och kan hjälpa både mättnad och återhämtning.'
  }

  return ' Lägg gärna till en tydlig proteinkälla om du vill göra måltiden mer mättande.'
}

export function buildNutritionAdvice(analysis, options = {}) {
  if (!analysis.items.length) {
    return ''
  }

  const ids = new Set(analysis.items.map((item) => item.food.id))
  const repeatedPizza = Boolean(options.repeatedPizza)
  const proteinGoalText = buildProteinGoalText(analysis)
  const estimateText = buildEstimateText(analysis)

  if (ids.has('pizza')) {
    const intro = repeatedPizza
      ? 'Som vi var inne på tidigare kan pizza få plats.'
      : 'En pizza förstör inte dina framsteg. Pizza kan absolut få plats ibland.'

    return `${intro}${estimateText} För att balansera resten av dagen kan nästa måltid innehålla mer protein och grönsaker.${proteinGoalText}`
  }

  if (analysis.flags.largeMeal && analysis.flags.containsFastFood) {
    return `Jag ser ${joinFoodNames(analysis.items)}.${estimateText}${buildFlagText(analysis)}${proteinGoalText}`
  }

  if (analysis.flags.containsSweets) {
    return `${buildFlagText(analysis)}${estimateText}${proteinGoalText}`
  }

  return `Jag ser ${joinFoodNames(analysis.items)}.${estimateText}${buildFlagText(analysis)}${proteinGoalText}`
}
