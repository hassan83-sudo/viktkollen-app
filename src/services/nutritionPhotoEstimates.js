import { getNutritionAliases } from './nutrition/nutritionDatabase.js'

export const nutritionEstimateConfidenceLevels = ['high', 'medium', 'low', 'insufficient']
export const nutritionEstimateNutrients = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG']
export const nutritionPhotoComponentConfidenceLevels = ['high', 'medium', 'low', 'insufficient']
export const nutritionPhotoImageQualityLevels = ['good', 'usable', 'poor']
export const nutritionPhotoComponentCategories = [
  'carbohydrate',
  'fat',
  'protein',
  'sauce',
  'vegetables',
  'unknown',
]

const nutrientAliases = {
  calories: ['calories', 'kcal', 'energyKcal'],
  carbsG: ['carbsG', 'carbs', 'carbohydrates', 'carbohydratesG'],
  fatG: ['fatG', 'fat'],
  fiberG: ['fiberG', 'fiber'],
  proteinG: ['proteinG', 'protein'],
}

const nutrientLimits = {
  calories: { max: 8000, minWidth: 80, ratio: 0.18 },
  carbsG: { max: 1200, minWidth: 8, ratio: 0.22 },
  fatG: { max: 800, minWidth: 5, ratio: 0.22 },
  fiberG: { max: 150, minWidth: 3, ratio: 0.25 },
  proteinG: { max: 800, minWidth: 5, ratio: 0.22 },
}

const componentCategoryAliases = {
  carbohydrate: ['carbohydrate', 'carb', 'kolhydrater', 'ris', 'potatis', 'potatisar', 'nudlar', 'bröd', 'pasta'],
  protein: ['protein', 'kött', 'fågel', 'kyckling', 'fisk', 'ägg'],
  sauce: ['sauce', 'sås', 'dressing', 'majonnas', 'majonnäs', 'yoghurtbaserat', 'yoghurtdressing'],
  fat: ['fett', 'olja', 'bärande', 'margarin'],
  vegetables: ['vegetables', 'vegetable', 'grönsak', 'gronsak', 'gurka', 'tomat', 'sallad', 'grönsaker', 'gronsaker'],
  unknown: ['okänd', 'okant', 'unknown'],
}

const componentNameMergeAliases = [
  { canonical: 'friterad kyckling', synonyms: ['friterad kyckling', 'fried chicken'] },
  { canonical: 'kyckling', synonyms: ['kyckling', 'kycklingfilé', 'kycklingbröst'] },
  { canonical: 'pommes frites', synonyms: ['pommes', 'pommes frites', 'friterade potatis', 'french fries', 'franska frites'] },
  { canonical: 'potatis', synonyms: ['potatis', 'potatisar'] },
  { canonical: 'grönsaker', synonyms: ['gurka', 'gurka och tomat', 'tomat', 'grönsak', 'grönsaker', 'blandade grönsaker'] },
  { canonical: 'sås', synonyms: ['sås', 'dressing', 'salladsdressing', 'grönsaksås', 'majonäs', 'majonnäs'] },
]

const confidenceOrder = {
  insufficient: 0,
  low: 1,
  medium: 2,
  high: 3,
}

const visualDatabaseAliases = [
  { alias: 'french fries', foodAlias: 'pommes' },
  { alias: 'fries', foodAlias: 'pommes' },
  { alias: 'pommes frites', foodAlias: 'pommes' },
]

const cookingMethodRiskTerms = [
  'battered',
  'breaded',
  'creamy',
  'deep fried',
  'dressing',
  'fried',
  'friterad',
  'gräddig',
  'kramig',
  'krämig',
  'oil',
  'oil-coated',
  'olja',
  'panerad',
  'sauce',
  'sås',
]

const plainFoodIdsUnsafeForHeavyCooking = new Set(['kyckling', 'potatis'])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeMatchText(value = '') {
  return safeText(value, '', 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasCookingRisk(component = {}) {
  const text = [
    component.name,
    component.category,
    component.uncertainty?.reason,
    ...safeArray(component.cookingMethods),
    ...safeArray(component.alternatives),
  ].map(normalizeMatchText).join(' ')

  return cookingMethodRiskTerms.some((term) => text.includes(normalizeMatchText(term)))
}

const cookingMethodAliases = [
  { canonical: 'baked', aliases: ['baked', 'ugnsbakad', 'ugn'] },
  { canonical: 'boiled', aliases: ['boiled', 'kokt', 'kokta'] },
  { canonical: 'breaded', aliases: ['breaded', 'panerad', 'panering', 'battered'] },
  { canonical: 'fried', aliases: ['fried', 'friterad', 'fritering', 'deep fried', 'olja', 'oil-coated'] },
  { canonical: 'grilled', aliases: ['grilled', 'grillad', 'grill'] },
  { canonical: 'raw', aliases: ['raw', 'ra', 'rå'] },
  { canonical: 'roasted', aliases: ['roasted', 'rostad'] },
  { canonical: 'steamed', aliases: ['steamed', 'angkokt', 'ångkokt'] },
]

const componentCategoryOrder = {
  carbohydrate: 1,
  fat: 4,
  protein: 0,
  sauce: 3,
  unknown: 5,
  vegetables: 2,
}

const countablePortionGuides = [
  { max: 40, min: 20, pattern: /kottbull|meatball/ },
  { max: 28, min: 15, pattern: /nugget/ },
  { max: 40, min: 18, pattern: /sushi|maki|nigiri/ },
  { max: 70, min: 50, pattern: /(^|\s)(agg|egg)(s|\s|$)/ },
  { max: 45, min: 25, pattern: /skiva|toast|bread slice/ },
  { max: 55, min: 25, pattern: /kycklingbit|chicken (piece|tender|wing)/ },
  { max: 35, min: 18, pattern: /dumpling|gyoza|pirog/ },
]

function roundPortionGrams(value) {
  const number = safeNumber(value, null, 5000)
  if (number === null) return null
  return Math.round(number / 5) * 5
}

function normalizeCookingMethods(value = []) {
  return [...new Set(safeArray(value).flatMap((entry) => {
    const text = normalizeMatchText(entry)
    const match = cookingMethodAliases.find((item) => item.aliases.some((alias) => text.includes(alias)))
    return match ? [match.canonical] : []
  }))].slice(0, 4)
}

function cookingSignature(methods = []) {
  return normalizeCookingMethods(methods).slice().sort().join(',')
}

function typicalCountableGrams(name = '') {
  const text = normalizeMatchText(name)
  return countablePortionGuides.find((guide) => guide.pattern.test(text)) || null
}

function applyCountablePortion(portion = {}, name = '') {
  const pieceCount = safeNumber(portion.pieceCount, null, 40)
  const guide = typicalCountableGrams(name)
  if (!pieceCount || pieceCount < 1 || !guide) return portion

  const countMin = roundPortionGrams(pieceCount * guide.min)
  const countMax = roundPortionGrams(pieceCount * guide.max)
  if (portion.gramsMin === null || portion.gramsMax === null) {
    return {
      ...portion,
      evidence: portion.evidence || `${pieceCount} synliga bitar.`,
      gramsMax: countMax,
      gramsMin: countMin,
    }
  }

  const modelMid = (portion.gramsMin + portion.gramsMax) / 2
  const countMid = (countMin + countMax) / 2
  if (modelMid < countMid * 0.5 || modelMid > countMid * 2) {
    return {
      ...portion,
      evidence: portion.evidence || `${pieceCount} synliga bitar stämmer dåligt med gramintervallet.`,
      gramsMax: Math.max(portion.gramsMax, countMax),
      gramsMin: Math.min(portion.gramsMin, countMin),
    }
  }

  return {
    ...portion,
    gramsMax: Math.max(portion.gramsMax, countMax),
    gramsMin: Math.min(portion.gramsMin, countMin),
  }
}

function widenWeakPortion(portion = {}) {
  if (portion.gramsMin === null || portion.gramsMax === null) return portion
  if (!['low', 'insufficient'].includes(portion.confidence)) return portion

  return {
    ...portion,
    gramsMax: roundPortionGrams(portion.gramsMax * 1.2),
    gramsMin: roundPortionGrams(Math.max(5, portion.gramsMin * 0.85)),
  }
}

function widenNarrowLowConfidencePortion(portion = {}) {
  if (portion.gramsMin === null || portion.gramsMax === null) return portion
  if (!['low', 'insufficient'].includes(portion.confidence)) return portion
  const midpoint = (portion.gramsMin + portion.gramsMax) / 2
  if (midpoint <= 0) return portion
  const span = portion.gramsMax - portion.gramsMin
  if (span / midpoint >= 0.18) return portion

  return {
    ...portion,
    evidence: portion.evidence || 'Gramintervallet breddades eftersom portionsäkerheten är låg.',
    gramsMax: roundPortionGrams(midpoint * 1.25),
    gramsMin: roundPortionGrams(Math.max(5, midpoint * 0.8)),
  }
}

function stabilizePortionEstimate(portion = {}, name = '') {
  const counted = applyCountablePortion(portion, name)
  const widened = widenNarrowLowConfidencePortion(widenWeakPortion(counted))

  return {
    ...widened,
    gramsMax: roundPortionGrams(widened.gramsMax),
    gramsMin: roundPortionGrams(widened.gramsMin),
  }
}

function neutralizeUncertainSauceName(component = {}) {
  if (component.category !== 'sauce' || component.confidence === 'high' || !safeArray(component.alternatives).length) {
    return component
  }
  const name = normalizeMatchText(component.name)
  if (/kramig sas|sas eller|dressing|dipp/.test(name)) return component

  return {
    ...component,
    name: 'Krämig sås',
  }
}

export function buildPlateConsistencyNotes(components = []) {
  const list = safeArray(components)
  const notes = []
  const names = list.map((component) => normalizeMatchText(component.name)).join(' ')
  const hasSauceOrFat = list.some((component) => component.category === 'sauce' || component.category === 'fat')
  const looksFried = list.some((component) => hasCookingRisk(component) || /pommes|frites|friterad/.test(normalizeMatchText(component.name)))
  const grams = list
    .map((component) => component.portionEstimate)
    .filter((portion) => Number.isFinite(portion?.gramsMin) && Number.isFinite(portion?.gramsMax))
  const totalMax = grams.reduce((sum, portion) => sum + portion.gramsMax, 0)
  const totalMin = grams.reduce((sum, portion) => sum + portion.gramsMin, 0)

  if (looksFried && !hasSauceOrFat) notes.push('Synlig sås/dipp kan saknas.')
  if (totalMax > 1800) notes.push('Den samlade mängden ser ovanligt stor ut för en tallrik.')
  if (list.length >= 3 && totalMax > 0 && totalMax < 90) notes.push('Portionsstorleken är osäker.')
  if (totalMin > 0 && totalMax >= totalMin * 4) notes.push('Portionsstorleken är osäker.')
  if (/potatis/.test(names) && /pommes|frites/.test(names)) notes.push('Kokt potatis och pommes hålls isär.')
  if (/kyckling/.test(names) && /friterad kyckling|fried chicken/.test(names)) notes.push('Kycklingen kan vara panerad eller friterad.')
  if (list.some((component) => component.category === 'sauce' && component.identityConfidence === 'high' && !component.visualEvidence && !component.portionEstimate?.evidence)) {
    notes.push('Såstypen är osäker.')
  }
  list.forEach((component) => {
    const portion = component.portionEstimate || {}
    const guide = typicalCountableGrams(component.name)
    if (!portion.pieceCount || !guide || portion.gramsMin === null || portion.gramsMax === null) return
    const countMid = portion.pieceCount * ((guide.min + guide.max) / 2)
    const gramMid = (portion.gramsMin + portion.gramsMax) / 2
    if (gramMid < countMid * 0.45 || gramMid > countMid * 2.2) {
      notes.push('Antalet bitar stämmer dåligt med den uppskattade vikten.')
    }
  })

  return [...new Set(notes)].slice(0, 4)
}

function withVisualDatabaseAliases(aliases) {
  const byAlias = new Map(aliases.map((entry) => [normalizeMatchText(entry.alias), entry.food]))
  const additions = visualDatabaseAliases
    .map((entry) => {
      const food = byAlias.get(normalizeMatchText(entry.foodAlias))
      return food ? { alias: entry.alias, food } : null
    })
    .filter(Boolean)

  return [...aliases, ...additions]
}

function createNutritionRangeFromFood(food, portionEstimate, confidence = 'medium') {
  const gramsMin = safeNumber(portionEstimate?.gramsMin, null, 5000)
  const gramsMax = safeNumber(portionEstimate?.gramsMax, null, 5000)
  if (gramsMin === null || gramsMax === null) return null

  const orderedMin = Math.min(gramsMin, gramsMax)
  const orderedMax = Math.max(gramsMin, gramsMax)
  const per100 = {
    calories: food.caloriesPer100g,
    carbsG: food.carbsPer100g,
    fatG: food.fatPer100g,
    fiberG: food.fiberPer100g,
    proteinG: food.proteinPer100g,
  }

  return Object.fromEntries(nutritionEstimateNutrients.map((nutrient) => {
    const value = safeNumber(per100[nutrient], null, nutrientLimits[nutrient].max)
    if (value === null) return [nutrient, null]
    const min = value * orderedMin / 100
    const max = value * orderedMax / 100

    return [nutrient, {
      confidence,
      max: Number(max.toFixed(nutrient === 'calories' ? 0 : 1)),
      midpoint: Number(((min + max) / 2).toFixed(nutrient === 'calories' ? 0 : 1)),
      min: Number(min.toFixed(nutrient === 'calories' ? 0 : 1)),
    }]
  }))
}

export function matchPhotoComponentToNutritionDatabase(component = {}) {
  const componentName = normalizeMatchText(component.name)
  if (!componentName) {
    return { food: null, reason: 'missing_component_name', status: 'noMatch' }
  }

  const aliases = withVisualDatabaseAliases(getNutritionAliases())
  const exact = aliases.filter((entry) => normalizeMatchText(entry.alias) === componentName)
  const uniqueFoods = [...new Map(exact.map((entry) => [entry.food.id, entry.food])).values()]
  if (uniqueFoods.length !== 1) {
    return {
      food: null,
      reason: uniqueFoods.length > 1 ? 'ambiguous_database_match' : 'no_safe_database_match',
      status: uniqueFoods.length > 1 ? 'ambiguous' : 'noMatch',
    }
  }

  const food = uniqueFoods[0]
  if (plainFoodIdsUnsafeForHeavyCooking.has(food.id) && hasCookingRisk(component)) {
    return { food: null, reason: 'cooking_method_requires_review', status: 'blockedByCookingMethod' }
  }

  return { food, reason: '', status: 'matched' }
}

export function derivePhotoComponentNutrition(component = {}) {
  const match = matchPhotoComponentToNutritionDatabase(component)
  if (match.food) {
    const derivedNutrition = createNutritionRangeFromFood(match.food, component.portionEstimate, component.confidence === 'high' ? 'high' : 'medium')
    if (derivedNutrition?.calories && derivedNutrition?.proteinG && derivedNutrition?.carbsG && derivedNutrition?.fatG) {
      return {
        nutritionEstimate: derivedNutrition,
        nutritionSource: 'databaseDerived',
        nutritionSourceReason: 'matched_database_per_100g_and_vision_grams',
        matchedFood: {
          category: match.food.category,
          id: match.food.id,
          name: match.food.name,
        },
      }
    }
  }

  return {
    nutritionEstimate: normalizeEstimatedNutrition(component.nutritionEstimate || {}, {
      confidence: component.confidence || 'low',
    }),
    nutritionSource: 'aiEstimate',
    nutritionSourceReason: match.reason || 'database_match_unavailable',
    matchedFood: null,
  }
}

function normalizeComponentCategory(value = 'unknown') {
  const candidate = safeText(value, 'unknown', 60).toLocaleLowerCase('sv-SE')

  return Object.entries(componentCategoryAliases).find(([, aliases]) =>
    aliases.some((alias) => candidate.includes(alias)))?.[0] || 'unknown'
}

function normalizeComponentName(value = '', fallback = 'Okänd komponent') {
  return safeText(value, fallback, 120)
}

function mergeConfidence(first, second) {
  const firstScore = confidenceOrder[safeText(first, 'low')] ?? confidenceOrder.low
  const secondScore = confidenceOrder[safeText(second, 'low')] ?? confidenceOrder.low

  return firstScore >= secondScore ? first : second
}

function isFiniteRange(range) {
  return Number.isFinite(range?.min)
    && Number.isFinite(range?.midpoint)
    && Number.isFinite(range?.max)
    && range.max >= range.min
    && range.midpoint >= range.min
    && range.midpoint <= range.max
}

function toRangeBounds(range) {
  if (!isObject(range)) return { min: null, midpoint: null, max: null, confidence: null }
  const normalized = {
    confidence: normalizeNutritionEstimateConfidence(range.confidence, 'low'),
    min: safeNumber(range.min ?? range.minG ?? range.minKg ?? range.midpoint ?? null, null, 100000),
    midpoint: safeNumber(range.midpoint ?? range.midpointG ?? range.midpointKg ?? null, null, 100000),
    max: safeNumber(range.max ?? range.maxG ?? range.maxKg ?? range.midpoint ?? null, null, 100000),
  }

  if (!isFiniteRange(normalized)) return {
    confidence: normalized.confidence,
    min: null,
    midpoint: null,
    max: null,
  }

  return normalized
}

function mergeRange(first, second) {
  if (!isObject(first) && !isObject(second)) return null
  if (!isObject(first)) return second
  if (!isObject(second)) return first
  const firstRange = toRangeBounds(first)
  const secondRange = toRangeBounds(second)

  if (!firstRange.min && !firstRange.midpoint && !firstRange.max) return second
  if (!secondRange.min && !secondRange.midpoint && !secondRange.max) return first

  const result = {
    confidence: mergeConfidence(first.confidence, second.confidence),
    min: null,
    midpoint: null,
    max: null,
  }
  result.min = Number(((firstRange.min || firstRange.midpoint || 0) + (secondRange.min || secondRange.midpoint || 0)).toFixed(0))
  result.max = Number(((firstRange.max || firstRange.midpoint || 0) + (secondRange.max || secondRange.midpoint || 0)).toFixed(0))
  result.midpoint = Number(((result.min + result.max) / 2).toFixed(firstRange.midpoint === null || secondRange.midpoint === null ? 0 : 1))

  return result
}

function sumNutritionRanges(values = []) {
  return values.reduce((accumulator, current) => {
    if (!isObject(current)) return accumulator
    const merged = { ...accumulator }

    nutritionEstimateNutrients.forEach((nutrient) => {
      merged[nutrient] = mergeRange(merged[nutrient], current[nutrient])
      if (!merged[nutrient]) return
      merged[nutrient].min = Number((merged[nutrient].min || 0))
      merged[nutrient].max = Number((merged[nutrient].max || 0))
      merged[nutrient].midpoint = Number(((merged[nutrient].min + merged[nutrient].max) / 2).toFixed(nutrient === 'calories' ? 0 : 1))
    })

    return merged
  }, {})
}

function mergePortionEstimate(first = {}, second = {}) {
  const firstRange = normalizePortionEstimate(first)
  const secondRange = normalizePortionEstimate(second)
  if (!firstRange && !secondRange) return null
  const merged = normalizePortionEstimate({
    confidence: mergeConfidence(firstRange?.confidence || secondRange?.confidence || 'low', firstRange?.confidence || secondRange?.confidence || 'low'),
    description: `${safeText(firstRange?.description, '') || ''}${firstRange?.description && secondRange?.description ? ' + ' : ''}${safeText(secondRange?.description, '') || ''}` || 'Sammanlagd portion',
    evidence: [firstRange?.evidence, secondRange?.evidence].filter(Boolean).join(' '),
    gramsMin: Number(((firstRange?.gramsMin || 0) + (secondRange?.gramsMin || 0)).toFixed(0)),
    gramsMax: Number(((firstRange?.gramsMax || 0) + (secondRange?.gramsMax || 0)).toFixed(0)),
    pieceCount: (firstRange?.pieceCount || 0) + (secondRange?.pieceCount || 0) || null,
    pieceCountConfidence: mergeConfidence(firstRange?.pieceCountConfidence, secondRange?.pieceCountConfidence),
    relativePlateShare: [firstRange?.relativePlateShare, secondRange?.relativePlateShare]
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value, _, values) => sum + value / values.length, 0) || null,
  }, {
    confidence: mergeConfidence(firstRange?.confidence || secondRange?.confidence || 'low', firstRange?.confidence || secondRange?.confidence || 'low'),
  })

  return merged
}

export function normalizePhotoComponent(raw = {}, index = 0) {
  const source = isObject(raw) ? raw : {}
  const baseConfidence = normalizeNutritionEstimateConfidence(source.confidence || 'low')
  const category = normalizeComponentCategory(source.category || source.type)
  const identityConfidence = normalizeNutritionEstimateConfidence(source.identityConfidence || source.confidence, 'low')
  const confidence = source.confidence || source.identityConfidence
    ? identityConfidence
    : baseConfidence
  const alternatives = safeArray(source.alternatives).map((entry) => safeText(entry, '', 60)).filter(Boolean).slice(0, 3)
  const rawPortion = source.portionEstimate || source.portion || {}
  const hasPortionGrams = Number.isFinite(Number(rawPortion.gramsMin ?? rawPortion.minGrams ?? rawPortion.min))
    || Number.isFinite(Number(rawPortion.gramsMax ?? rawPortion.maxGrams ?? rawPortion.max))
  const portionEstimate = normalizePortionEstimate(rawPortion, {
    confidence: hasPortionGrams ? 'medium' : 'low',
    fallbackDescription: 'Ospecificerad komponentportion',
  })
  const nutritionEstimate = normalizeEstimatedNutrition(source.nutritionEstimate || source.nutrition || source.estimatedNutrition, {
    confidence,
  })
  const cookingMethods = normalizeCookingMethods(source.cookingMethods)
  const component = {
    id: safeText(source.id, `photo-component-${index}`),
    alternatives,
    category,
    confidence,
    identityConfidence,
    cookingMethods,
    visualEvidence: safeText(source.visualEvidence, '', 160),
    cookingMethodHints: safeArray(source.cookingMethodHints).map((entry) => safeText(entry, '', 50)).filter(Boolean).slice(0, 4),
    imageQuality: normalizePhotoAnalysisImageQuality(source.imageQuality || source.imageQualityOverall || source.image_quality, 'usable'),
    name: normalizeComponentName(source.name || source.label, `Komponent ${index + 1}`),
    nutritionEstimate,
    portionEstimate,
    uncertainty: {
      confidence: normalizeNutritionEstimateConfidence(source.uncertainty || source.certainty || 'low'),
      reason: safeText(source.uncertaintyReason || source.reason || source.notes || '', 'Komponenten kan vara osäker.', 140),
    },
    sourceEvidence: safeText(source.sourceEvidence, '', 80),
    nutritionIsUsable: ['calories', 'proteinG', 'carbsG', 'fatG']
      .some((nutrient) => {
        const bounds = toRangeBounds(nutritionEstimate?.[nutrient])
        return isFiniteRange(bounds)
      }),
  }

  return neutralizeUncertainSauceName(component)
}

export function normalizePhotoAnalysisImageQuality(value, fallback = 'usable') {
  const candidate = safeText(value || fallback, fallback, 20).toLocaleLowerCase('sv-SE')
  return nutritionPhotoImageQualityLevels.includes(candidate) ? candidate : fallback
}

function normalizeComponentMergeName(value = '') {
  const candidate = safeText(value, '', 120).toLocaleLowerCase('sv-SE').replace(/[^a-zåäöéè0-9\s]/g, ' ')

  for (const alias of componentNameMergeAliases) {
    const hit = alias.synonyms.some((entry) => candidate.includes(entry))
    if (hit) return alias.canonical
  }

  return candidate
}

export function normalizePhotoComponents(rawComponents = []) {
  const safe = safeArray(rawComponents).map((entry, index) => {
    const normalized = normalizePhotoComponent(entry, index)
    const mergedName = normalizeComponentMergeName(normalized.name)

    return { ...normalized, normalizedName: mergedName }
  }).filter((entry) => entry.name)

  const bySignature = new Map()

  safe.forEach((component) => {
    const key = `${component.category}:${component.normalizedName}:${cookingSignature(component.cookingMethods)}`
    if (!bySignature.has(key)) {
      bySignature.set(key, { ...component, alternatives: [...component.alternatives] })
      return
    }

    const existing = bySignature.get(key)
    bySignature.set(key, {
      ...existing,
      confidence: mergeConfidence(existing.confidence, component.confidence),
      identityConfidence: mergeConfidence(existing.identityConfidence, component.identityConfidence),
      id: existing.id,
      name: existing.name,
      nutritionEstimate: mergeNutritionEstimates(existing.nutritionEstimate, component.nutritionEstimate),
      portionEstimate: mergePortionEstimate(existing.portionEstimate, component.portionEstimate),
      visualEvidence: `${safeText(existing.visualEvidence, '', 100)} ${safeText(component.visualEvidence, '', 100)}`.trim() || 'Komponentsammanslagning.',
      uncertainty: {
        confidence: mergeConfidence(existing.uncertainty.confidence, component.uncertainty.confidence),
        reason: [existing.uncertainty.reason, component.uncertainty.reason]
          .filter(Boolean).map((entry) => safeText(entry, '', 140)).slice(0, 1).join(' '),
      },
      alternatives: [...new Set([...existing.alternatives, ...component.alternatives])].slice(0, 3),
      cookingMethods: [...new Set([...existing.cookingMethods, ...component.cookingMethods])].slice(0, 4),
    })
  })

  return Array.from(bySignature.values())
    .map((component) => {
      const rest = { ...component }
      delete rest.normalizedName
      const portionEstimate = stabilizePortionEstimate(rest.portionEstimate, rest.name)
      const finalized = { ...rest, cookingMethods: normalizeCookingMethods(rest.cookingMethods), portionEstimate }
      const derived = derivePhotoComponentNutrition(finalized)

      return {
        ...finalized,
        matchedFood: derived.matchedFood,
        nutritionEstimate: derived.nutritionEstimate,
        nutritionIsUsable: ['calories', 'proteinG', 'carbsG', 'fatG']
          .some((nutrient) => {
            const bounds = toRangeBounds(derived.nutritionEstimate?.[nutrient])
            return isFiniteRange(bounds)
          }),
        nutritionSource: derived.nutritionSource,
        nutritionSourceReason: derived.nutritionSourceReason,
      }
    })
    .sort((first, second) => {
      const categoryDelta = (componentCategoryOrder[first.category] ?? 9) - (componentCategoryOrder[second.category] ?? 9)
      if (categoryDelta !== 0) return categoryDelta
      return first.name.localeCompare(second.name, 'sv-SE')
    })
    .slice(0, 12)
}

export function calculateTotalsFromComponents(components = []) {
  const componentNutrition = safeArray(components)
    .map((component) => component.nutritionEstimate)
    .filter(Boolean)

  return sumNutritionRanges(componentNutrition)
}

export function compareNutritionRanges(base = {}, candidate = {}) {
  const tolerances = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG']
  const mismatches = []

  tolerances.forEach((nutrient) => {
    const a = toRangeBounds(base?.[nutrient])
    const b = toRangeBounds(candidate?.[nutrient])
    if (!isFiniteRange(a) || !isFiniteRange(b)) return
    const midpointA = a.midpoint
    const midpointB = b.midpoint
    const avg = (midpointA + midpointB) / 2 || midpointA || midpointB
    const delta = avg > 0 ? Math.abs(midpointA - midpointB) / avg : 0
    if (delta > 0.35) mismatches.push(nutrient)
  })

  return {
    isConsistent: mismatches.length === 0,
    mismatches,
  }
}

export function normalizeMealPortionFromComponents(components = []) {
  const portions = safeArray(components)
    .map((component) => component.portionEstimate)
    .filter(Boolean)
  const totals = portions.length
    ? portions.slice(1).reduce((acc, next) => mergePortionEstimate(acc, next), portions[0])
    : null

  return Number.isFinite(Number(totals?.gramsMin)) && Number.isFinite(Number(totals?.gramsMax))
    ? totals
    : null
}

function mergeNutritionEstimates(first = {}, second = {}) {
  const merged = { ...sumNutritionRanges([first, second]) }
  Object.keys(merged).forEach((key) => {
    if (merged[key]) {
      merged[key].confidence = mergeConfidence(first?.[key]?.confidence, second?.[key]?.confidence)
    }
  })

  return merged
}

export function componentNeedsReview(component = {}) {
  return component.confidence === 'low' || component.confidence === 'insufficient' || component.uncertainty?.confidence === 'low' || component.uncertainty?.confidence === 'insufficient'
}

export function safeText(value, fallback = '', max = 220) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function safeNumber(value, fallback = null, max = 100000) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.min(number, max)
}

export function normalizeNutritionEstimateConfidence(value, fallback = 'low') {
  const text = safeText(value?.level || value, '', 40).toLowerCase()
  if (nutritionEstimateConfidenceLevels.includes(text)) return text
  const score = Number(value?.score ?? value)
  if (Number.isFinite(score)) {
    if (score >= 0.75) return 'high'
    if (score >= 0.5) return 'medium'
    if (score >= 0.25) return 'low'
    return 'insufficient'
  }

  return fallback
}

function getAliasedNumber(source, aliases, max) {
  for (const alias of aliases) {
    const number = safeNumber(source?.[alias], null, max)
    if (number !== null) return number
  }

  return null
}

function normalizeRange(input, nutrient, fallbackConfidence) {
  const limits = nutrientLimits[nutrient]
  if (!limits) return null
  const source = isObject(input) ? input : { midpoint: input }
  let min = safeNumber(source.min ?? source.minG ?? source.minKg, null, limits.max)
  let max = safeNumber(source.max ?? source.maxG ?? source.maxKg, null, limits.max)
  let midpoint = safeNumber(source.midpoint ?? source.midpointG ?? source.value, null, limits.max)

  if (midpoint === null) {
    midpoint = getAliasedNumber(source, nutrientAliases[nutrient], limits.max)
  }
  if ((min === null || max === null) && midpoint !== null) {
    const width = Math.max(limits.minWidth, midpoint * limits.ratio)
    min = Math.max(0, midpoint - width / 2)
    max = Math.min(limits.max, midpoint + width / 2)
  }
  if (min === null || max === null) return null
  if (max < min) [min, max] = [max, min]
  if (midpoint === null) midpoint = (min + max) / 2
  if (midpoint < min || midpoint > max) midpoint = (min + max) / 2

  return {
    confidence: normalizeNutritionEstimateConfidence(source.confidence, fallbackConfidence),
    max: Number(max.toFixed(nutrient === 'calories' ? 0 : 1)),
    midpoint: Number(midpoint.toFixed(nutrient === 'calories' ? 0 : 1)),
    min: Number(min.toFixed(nutrient === 'calories' ? 0 : 1)),
  }
}

export function normalizeEstimatedNutrition(value = {}, options = {}) {
  const confidence = normalizeNutritionEstimateConfidence(options.confidence || value?.confidence, 'low')
  const source = isObject(value) ? value : {}

  return Object.fromEntries(nutritionEstimateNutrients.map((nutrient) => {
    const nested = source[nutrient]
    const aliasValue = nested ?? getAliasedNumber(source, nutrientAliases[nutrient], nutrientLimits[nutrient].max)
    return [nutrient, normalizeRange(aliasValue, nutrient, confidence)]
  }))
}

export function nutritionMidpointsFromEstimate(estimatedNutrition = {}) {
  return {
    calories: estimatedNutrition.calories?.midpoint ?? null,
    carbs: estimatedNutrition.carbsG?.midpoint ?? null,
    fat: estimatedNutrition.fatG?.midpoint ?? null,
    fiber: estimatedNutrition.fiberG?.midpoint ?? null,
    protein: estimatedNutrition.proteinG?.midpoint ?? null,
  }
}

export function normalizePortionEstimate(value, options = {}) {
  const source = isObject(value) ? value : { description: value }
  const gramsMin = safeNumber(source.gramsMin ?? source.minGrams ?? source.min, null, 5000)
  const gramsMax = safeNumber(source.gramsMax ?? source.maxGrams ?? source.max, null, 5000)
  const orderedMin = gramsMin !== null && gramsMax !== null ? Math.min(gramsMin, gramsMax) : gramsMin
  const orderedMax = gramsMin !== null && gramsMax !== null ? Math.max(gramsMin, gramsMax) : gramsMax
  const pieceCount = safeNumber(source.pieceCount ?? source.count ?? source.pieces, null, 40)
  const relativePlateShare = safeNumber(source.relativePlateShare ?? source.plateShare ?? source.relativeArea, null, 100)
  const pieceCountConfidence = pieceCount
    ? normalizeNutritionEstimateConfidence(source.pieceCountConfidence, 'medium')
    : null

  return {
    confidence: normalizeNutritionEstimateConfidence(source.confidence, options.confidence || 'low'),
    description: safeText(source.description || source.label || options.fallbackDescription, 'Okänd portion', 100),
    evidence: safeText(source.evidence || source.reason || source.visualEvidence, '', 140),
    gramsMax: orderedMax === null ? null : Number(orderedMax.toFixed(0)),
    gramsMin: orderedMin === null ? null : Number(orderedMin.toFixed(0)),
    pieceCount: pieceCount && pieceCount >= 1 ? Math.round(pieceCount) : null,
    pieceCountConfidence,
    relativePlateShare: relativePlateShare === null ? null : Number(relativePlateShare.toFixed(0)),
  }
}

export function normalizeEstimatedIngredients(items = []) {
  return safeArray(items).map((item, index) => {
    const source = isObject(item) ? item : { name: item }
    return {
      confidence: normalizeNutritionEstimateConfidence(source.confidence, 'low'),
      estimatedAmount: safeText(source.estimatedAmountText || source.estimatedAmountLabel || source.estimatedAmount || source.amount, '', 80),
      name: safeText(source.name || source.label || `Ingrediens ${index + 1}`, `Ingrediens ${index + 1}`, 80),
      notes: safeText(source.notes || source.note || source.reason, '', 140),
    }
  }).filter((item) => item.name).slice(0, 12)
}

export function normalizeUncertainIngredients(value = [], options = {}) {
  const uncertainFromItems = safeArray(options.ingredients)
    .filter((item) => item.uncertain || item.confidence === 'low' || item.confidence === 'insufficient')
    .map((item) => ({
      confidence: normalizeNutritionEstimateConfidence(item.confidence, 'low'),
      name: item.name,
      reason: item.notes || 'Osäker ingrediens eller mängd.',
    }))
  const explicit = safeArray(value).map((entry) => {
    const source = isObject(entry) ? entry : { name: entry }
    return {
      confidence: normalizeNutritionEstimateConfidence(source.confidence, 'low'),
      name: safeText(source.name || source.label, '', 80),
      reason: safeText(source.reason || source.notes || source.note, 'Kan påverka totalen.', 140),
    }
  })

  return [...explicit, ...uncertainFromItems]
    .filter((entry) => entry.name)
    .slice(0, 10)
}

export function normalizeAnalysisQuality(value = {}, options = {}) {
  const source = isObject(value) ? value : {}
  const confidence = normalizeNutritionEstimateConfidence(source.confidence || options.confidence, 'low')
  const limitations = [
    ...safeArray(source.limitations),
    ...safeArray(options.limitations),
  ].map((item) => safeText(item, '', 160)).filter(Boolean)

  return {
    confidence,
    limitations: [...new Set(limitations)].slice(0, 6),
    summary: safeText(source.summary || options.summary, 'AI-analysen är ett ungefärligt underlag som behöver granskas.', 220),
  }
}

export function buildNutritionPhotoTrendSummary(meals = []) {
  const photoMeals = safeArray(meals).filter((meal) => meal.photoAnalysis?.source === 'photoAnalysis')
  const confidenceCounts = photoMeals.reduce((counts, meal) => {
    const confidence = normalizeNutritionEstimateConfidence(meal.photoAnalysis?.confidence, 'low')
    counts[confidence] = (counts[confidence] || 0) + 1
    return counts
  }, { high: 0, insufficient: 0, low: 0, medium: 0 })
  const correctedCount = photoMeals.filter((meal) =>
    meal.photoAnalysis?.userEdited ||
    meal.photoAnalysis?.provenance === 'user_confirmed').length
  const uncertainFactors = photoMeals.flatMap((meal) => safeArray(meal.photoAnalysis?.uncertainIngredients).map((item) => item.name || item))

  return {
    averageConfidence: photoMeals.length
      ? Number((((confidenceCounts.high * 3) + (confidenceCounts.medium * 2) + confidenceCounts.low) / photoMeals.length).toFixed(2))
      : 0,
    commonMealType: photoMeals[0]?.type || photoMeals[0]?.mealType || 'Saknas ännu',
    commonUncertaintyFactor: uncertainFactors[0] || 'Saknas ännu',
    correctionFrequency: photoMeals.length ? Number((correctedCount / photoMeals.length).toFixed(2)) : 0,
    photoMealCount: photoMeals.length,
    proteinRichCount: photoMeals.filter((meal) => Number(meal.protein || meal.nutritionOverride?.protein) >= 25).length,
  }
}
