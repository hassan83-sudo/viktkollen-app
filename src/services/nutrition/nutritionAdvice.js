import {
  formatApproxCalories,
  formatApproxGrams,
} from './nutritionCalculator.js'

function joinFoodNames(items) {
  return items.map((item) => item.food.name.toLocaleLowerCase('sv-SE')).join(', ')
}

function buildEstimateText(analysis) {
  if (!analysis.items.length) return ''

  return ` Jag uppskattar måltiden till cirka ${formatApproxGrams(analysis.totals.protein)} protein och ${formatApproxCalories(analysis.totals.calories)}.`
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
    const vegetableText = analysis.flags.containsVegetables
      ? ''
      : ' Grönsaker kan göra den mer mättande och ge mer variation.'

    return ` Måltiden är proteinrik; det här ser proteinrikt ut och kan hjälpa både mättnad och återhämtning.${vegetableText}`
  }

  if (analysis.flags.lowProtein) {
    return ' Måltiden verkar ha låg proteinhalt i förhållande till energin, så den kan kompletteras med en tydlig proteinkälla.'
  }

  if (analysis.flags.containsVegetables || analysis.flags.containsFruit) {
    return ' Måltiden innehåller frukt eller grönsaker, vilket kan bidra med mer volym och variation.'
  }

  return ' Lägg gärna till en tydlig proteinkälla om du vill göra måltiden mer mättande.'
}

function buildUnknownText(analysis) {
  if (!analysis.unknownFoods?.length) return ''

  return ` Beräkningen omfattar bara det jag kunde identifiera; ${analysis.unknownFoods.join(', ')} är inte medräknat.`
}

export function buildNutritionAdvice(analysis, options = {}) {
  if (!analysis.items.length) {
    return ''
  }

  const ids = new Set(analysis.items.map((item) => item.food.id))
  const repeatedPizza = Boolean(options.repeatedPizza)
  const proteinGoalText = buildProteinGoalText(analysis)
  const estimateText = buildEstimateText(analysis)
  const unknownText = buildUnknownText(analysis)

  if (ids.has('pizza')) {
    const intro = repeatedPizza
      ? 'Som vi var inne på tidigare kan pizza få plats.'
      : 'En pizza förstör inte dina framsteg. Pizza kan absolut få plats ibland.'

    return `${intro}${estimateText} För att balansera resten av dagen kan nästa måltid innehålla mer protein och grönsaker.${proteinGoalText}${unknownText}`
  }

  if (analysis.flags.largeMeal && analysis.flags.containsFastFood) {
    return `Jag ser ${joinFoodNames(analysis.items)}.${estimateText}${buildFlagText(analysis)}${proteinGoalText}${unknownText}`
  }

  if (analysis.flags.containsSweets) {
    return `${buildFlagText(analysis)}${estimateText}${proteinGoalText}${unknownText}`
  }

  return `Jag ser ${joinFoodNames(analysis.items)}.${estimateText}${buildFlagText(analysis)}${proteinGoalText}${unknownText}`
}
