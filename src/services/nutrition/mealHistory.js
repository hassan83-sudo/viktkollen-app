import { formatApproxCalories, formatApproxGrams } from './nutritionCalculator.js'

function labelMeal(entry) {
  return entry.mealType || 'måltid'
}

function describeEntry(entry) {
  if (!entry) return ''

  const timeText = entry.time ? `${entry.time} ` : ''

  return `${timeText}${labelMeal(entry)}: ${entry.text} (${formatApproxGrams(entry.totals.protein)} protein, ${formatApproxCalories(entry.totals.calories)})`
}

export function findMealByType(timeline, mealType) {
  return timeline.entries.find((entry) => entry.mealType === mealType || entry.text.toLocaleLowerCase('sv-SE').includes(mealType)) || null
}

export function getLatestMeal(timeline) {
  return [...timeline.entries]
    .reverse()
    .find((entry) => entry.text || entry.totals.calories > 0) || null
}

export function buildMealComparisons(timeline, memory) {
  const comparisons = []
  const breakfast = findMealByType(timeline, 'frukost')
  const lunch = findMealByType(timeline, 'lunch')
  const dinner = findMealByType(timeline, 'middag')

  if (breakfast && lunch) {
    const relation = lunch.totals.protein >= breakfast.totals.protein ? 'mer' : 'mindre'

    comparisons.push(`Lunchen innehöll ${relation} protein än frukosten.`)
  }

  if (memory.largestMeal) {
    const label = labelMeal(memory.largestMeal)

    comparisons.push(`${label[0].toLocaleUpperCase('sv-SE')}${label.slice(1)} var dagens största måltid.`)
  }

  if (dinner && lunch && dinner.totals.calories > lunch.totals.calories) {
    comparisons.push('Middagen var mer energirik än lunchen.')
  }

  return comparisons
}

export function describeTodayMeals(timeline) {
  if (!timeline.entries.length) {
    return 'Jag hittar inga måltider loggade för idag ännu.'
  }

  return `Idag ser jag: ${timeline.entries.map(describeEntry).join(', ')}.`
}

export function describeMealByType(timeline, mealType) {
  const entry = findMealByType(timeline, mealType)

  return entry
    ? `${mealType[0].toLocaleUpperCase('sv-SE')}${mealType.slice(1)} var ${describeEntry(entry)}.`
    : `Jag hittar ingen tydlig ${mealType} i dagens måltider.`
}

export function describeLatestMeal(timeline) {
  const latest = getLatestMeal(timeline)

  return latest
    ? `Din senaste måltid var ${describeEntry(latest)}.`
    : 'Jag hittar ingen senaste måltid idag ännu.'
}

export function describeMealCount(timeline) {
  return timeline.mealCount
    ? `Du har ${timeline.mealCount.toLocaleString('sv-SE')} måltider loggade idag.`
    : 'Jag hittar inga måltider loggade idag ännu.'
}

export function describeMostProteinMeal(memory) {
  return memory.mostProteinMeal
    ? `${labelMeal(memory.mostProteinMeal)[0].toLocaleUpperCase('sv-SE')}${labelMeal(memory.mostProteinMeal).slice(1)} innehöll mest protein idag: ${memory.mostProteinMeal.text}, ungefär ${formatApproxGrams(memory.mostProteinMeal.totals.protein)}.`
    : 'Jag hittar ingen måltid med analyserbart protein idag ännu.'
}

export function describeMealMemory(timeline, memory) {
  const comparisons = buildMealComparisons(timeline, memory)
  const recommendation = memory.recommendations[0] || 'Nästa steg: fortsätt med en vanlig, mättande måltid när du blir hungrig.'

  return [memory.summaryText, ...comparisons.slice(0, 2), recommendation].join(' ')
}
