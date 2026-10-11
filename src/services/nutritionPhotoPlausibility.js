// Automatisk rimlighetskontroll för matscanning. Ren logik utan nätverk, körs på
// servern direkt efter AI-svaret och innan matbanken används.
//
// Principer:
// - Gram jämförs med kända portionsstorlekar. Endast uppenbart orimliga värden
//   justeras; allt som justeras eller gissas märks som osäkert.
// - AI:ns näringsvärden per 100 g kontrolleras mot energiformeln
//   (4 kcal/g protein och kolhydrater, 9 kcal/g fett) och mot att makronas
//   summa inte kan överstiga 100 g per 100 g.
// - Livsmedelsverkets värden ändras aldrig. Användarens egna korrigeringar
//   passerar aldrig den här kontrollen.

export function normalizePlausibilityText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Typiska portioner för en person (typical) och en övre gräns som en enskild
// komponent på ett foto i praktiken inte överskrider (hardMax). Ordningen spelar
// roll: första träffen gäller.
export const portionGuides = Object.freeze([
  { key: 'drink', hardMax: 1000, pattern: /\b(juice|lask|mjolk|kaffe|te|vatten|ol|vin|smoothie|drink|dryck)\b/, typical: [150, 400] },
  { key: 'dish', hardMax: 900, pattern: /soppa|gryta|lasagne|pizza|risotto|paella|curry|gratang|pytt|wok|kebabtallrik|burrito|pastasallad/, typical: [200, 500] },
  { key: 'fat', hardMax: 60, pattern: /\b(smor|olja|olivolja|margarin|ghee)\b/, typical: [5, 20] },
  { key: 'sauce', hardMax: 250, pattern: /sas\b|sas |dressing|dipp|majonnas|aioli|ketchup|senap|bearnaise|tzatziki|pesto|salsa|guacamole|hummus|remoulad/, typical: [15, 80] },
  { key: 'cheese', hardMax: 250, pattern: /\bost\b|parmesan|feta|halloumi|mozzarella|cheddar|brie/, typical: [15, 80] },
  { key: 'bread', hardMax: 300, pattern: /brod|bulle|tortilla|naan|toast|baguette|fralla|knackebrod|wrap/, typical: [30, 120] },
  { key: 'starch', hardMax: 700, pattern: /\b(ris|pasta|spaghetti|nudlar|bulgur|couscous|quinoa|potatis|pommes|mos|klyftpotatis|sotpotatis|gnocchi)\b/, typical: [100, 300] },
])

export const categoryPortionGuides = Object.freeze({
  carbohydrate: { hardMax: 700, typical: [100, 300] },
  fat: { hardMax: 60, typical: [5, 20] },
  protein: { hardMax: 600, typical: [80, 220] },
  sauce: { hardMax: 250, typical: [15, 80] },
  unknown: { hardMax: 800, typical: [30, 250] },
  vegetables: { hardMax: 600, typical: [30, 200] },
})

export function portionGuideFor(component = {}) {
  const text = normalizePlausibilityText(`${component.name || ''} ${component.bankName || ''}`)
  const byName = portionGuides.find((guide) => guide.pattern.test(text))
  if (byName) return byName
  const category = categoryPortionGuides[component.category] ? component.category : 'unknown'
  return { key: category, ...categoryPortionGuides[category] }
}

function roundTo5(value) {
  return Math.max(5, Math.round(value / 5) * 5)
}

/**
 * Kontrollerar gramintervallet mot kända portionsstorlekar.
 * @returns {{gramsMin, gramsMax, flags: string[]}}
 */
export function checkPortionPlausibility(component = {}) {
  const guide = portionGuideFor(component)
  const min = Number(component.gramsMin)
  const max = Number(component.gramsMax)
  const hasGrams = Number.isFinite(min) && Number.isFinite(max) && max > 0

  // Mängden gick inte att bedöma: typisk portion är det bäst underbyggda värdet,
  // men bara när livsmedelstypen är känd. Okänd mat får ingen påhittad mängd.
  if (!hasGrams && guide.key === 'unknown') {
    return { flags: [], gramsMax: null, gramsMin: null }
  }
  if (!hasGrams) {
    return { flags: ['portion_typical'], gramsMax: guide.typical[1], gramsMin: guide.typical[0] }
  }

  if (max > guide.hardMax) {
    const cappedMin = min >= guide.hardMax ? roundTo5(guide.hardMax * 0.6) : Math.min(min, guide.hardMax)
    return { flags: ['portion_capped'], gramsMax: guide.hardMax, gramsMin: cappedMin }
  }

  return { flags: [], gramsMax: max, gramsMin: min }
}

export const energyTolerance = Object.freeze({ absoluteKcal: 25, ratio: 0.25 })

export function atwaterKcal(per100 = {}) {
  return 4 * (Number(per100.protein) || 0) + 4 * (Number(per100.carbs) || 0) + 9 * (Number(per100.fat) || 0)
}

/**
 * Gör AI:ns reservvärden per 100 g inbördes konsekventa.
 * @returns {{per100: object|null, flags: string[]}}
 */
export function checkPer100Consistency(per100, component = {}) {
  if (!per100) return { flags: [], per100: null }
  const flags = []
  let { calories, carbs, fat, protein } = per100

  // Mer än 100 g makronäringsämnen per 100 g är fysiskt omöjligt.
  const macroSum = protein + carbs + fat
  if (macroSum > 100) {
    const scale = 100 / macroSum
    protein = Number((protein * scale).toFixed(1))
    carbs = Number((carbs * scale).toFixed(1))
    fat = Number((fat * scale).toFixed(1))
    flags.push('macros_scaled')
  }

  // Energin ska stämma med makrona. Makrona är mer specifika än ett ensamt
  // kalorital, så energin räknas om när avvikelsen är stor.
  const expected = atwaterKcal({ carbs, fat, protein })
  if (macroSum > 0 && Math.abs(calories - expected) > Math.max(energyTolerance.absoluteKcal, expected * energyTolerance.ratio)) {
    calories = Math.round(expected)
    flags.push('energy_recomputed')
  }
  calories = Math.min(calories, 900)

  // Grönsaker med mycket hög energitäthet utan stekning/fritering är ovanligt.
  const cooking = Array.isArray(component.cookingMethods) ? component.cookingMethods : []
  if (component.category === 'vegetables' && calories > 200 && !cooking.some((method) => ['fried', 'breaded', 'baked'].includes(method))) {
    flags.push('energy_unusual')
  }

  return { flags, per100: { calories, carbs, fat, protein } }
}

export const mealPlausibilityLimits = Object.freeze({ maxKcal: 2500, maxTotalGrams: 1800 })

/**
 * Måltidsnivå: summan av ingredienserna ska bli måltidens total, och totalen
 * ska vara rimlig för en måltid.
 */
export function checkMealPlausibility(items = []) {
  const totals = sumIngredientNutrition(items)
  const notes = []
  if (totals.calories > mealPlausibilityLimits.maxKcal) {
    notes.push('Den samlade energin ser ovanligt hög ut för en måltid – kontrollera mängderna.')
  }
  return { notes, totals }
}

// Samma summering och avrundning som granskningsvyn använder, så att måltidens
// total alltid är exakt summan av ingredienserna.
export function sumIngredientNutrition(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.selected !== false)
    .reduce((totals, item) => ({
      calories: Number((totals.calories + (Number(item.calories) || 0)).toFixed(1)),
      carbs: Number((totals.carbs + (Number(item.carbohydrates) || 0)).toFixed(1)),
      fat: Number((totals.fat + (Number(item.fat) || 0)).toFixed(1)),
      protein: Number((totals.protein + (Number(item.protein) || 0)).toFixed(1)),
    }), { calories: 0, carbs: 0, fat: 0, protein: 0 })
}

export const plausibilityFlagReasons = Object.freeze({
  energy_recomputed: 'Energin räknades om från protein, kolhydrater och fett.',
  energy_unusual: 'Ovanligt hög energi för grönsaker – kontrollera.',
  macros_scaled: 'Näringsvärdena justerades till en möjlig nivå.',
  portion_capped: 'Mängden var orimligt stor och sänktes – kontrollera.',
  portion_typical: 'Mängden syntes inte tydligt – en typisk portion används.',
})
