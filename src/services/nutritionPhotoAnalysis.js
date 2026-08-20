import { mealDraftToMeal, normalizeMeals, parseNutritionNumber } from './nutritionService.js'
import { getEntryLocalDate, getLocalDateString } from './localDate.js'
import {
  buildNutritionPhotoTrendSummary,
  normalizeAnalysisQuality,
  normalizeEstimatedIngredients,
  normalizeEstimatedNutrition,
  normalizeMealPortionFromComponents,
  calculateTotalsFromComponents,
  compareNutritionRanges,
  normalizePhotoAnalysisImageQuality,
  normalizePhotoComponents,
  normalizePortionEstimate,
  normalizeUncertainIngredients,
  nutritionMidpointsFromEstimate,
} from './nutritionPhotoEstimates.js'

export const nutritionPhotoAnalysisVersion = 3
export const maxPhotoDetectedItems = 12
export const maxPhotoAnalysisPayloadBytes = 24000
export const nutritionPhotoConfidenceLevels = ['high', 'medium', 'low', 'insufficient']
export const nutritionPhotoDuplicateStatuses = ['exactDuplicate', 'likelyDuplicate', 'possibleDuplicate', 'noDuplicate']
export const nutritionPhotoDataSources = ['aiEstimate', 'barcode', 'nutritionDatabase', 'manual']

const allowedAnalysisKeys = new Set([
  'analysisDate',
  'analysisId',
  'confidence',
  'createdAt',
  'components',
  'cookingMethods',
  'detectedItems',
  'analysisQuality',
  'estimatedNutrition',
  'estimatedServing',
  'imageQuality',
  'imageMetadata',
  'ingredients',
  'limitations',
  'mealTotals',
  'modelVersion',
  'nutrition',
  'portionEstimate',
  'provider',
  'safeSummary',
  'sourceType',
  'status',
  'uncertainIngredients',
  'userEdited',
  'validationErrors',
  'warnings',
])
const unsafeTextPatterns = [
  /<script/i,
  /javascript:/i,
  /diagnos/i,
  /medicin/i,
  /botar/i,
  /garanter/i,
  /exakt/i,
  /svält/i,
  /hoppa över (mat|måltid|frukost|lunch|middag)/i,
]

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 220) {
  const clean = String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

  return unsafeTextPatterns.some((pattern) => pattern.test(clean))
    ? 'Texten har neutraliserats av säkerhetsskäl.'
    : clean
}

function safeNumber(value, fallback = null, max = 100000) {
  const number = parseNutritionNumber(value, fallback)

  return Number.isFinite(number) ? Math.min(number, max) : fallback
}

function hashText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function payloadTooLarge(value) {
  const text = JSON.stringify(value || {})

  return text.length > maxPhotoAnalysisPayloadBytes
}

function normalizeConfidence(value, fallback = 'low') {
  const text = String(value?.level || value || '').toLocaleLowerCase('sv-SE')
  if (nutritionPhotoConfidenceLevels.includes(text)) return text
  const score = Number(value?.score ?? value)
  if (Number.isFinite(score)) {
    if (score >= 0.75) return 'high'
    if (score >= 0.5) return 'medium'
    if (score >= 0.25) return 'low'
    return 'insufficient'
  }

  return fallback
}

function normalizeDataSource(value, fallback = 'aiEstimate') {
  const text = safeText(value, fallback, 40)

  return nutritionPhotoDataSources.includes(text) ? text : fallback
}

function confidenceScore(level) {
  return {
    high: 0.82,
    insufficient: 0.12,
    low: 0.34,
    medium: 0.58,
  }[level] ?? 0.34
}

function normalizeDetectedItem(item = {}, index = 0) {
  const name = safeText(item.name || item.label || `Ingrediens ${index + 1}`, `Ingrediens ${index + 1}`, 80)
  const confidence = normalizeConfidence(item.confidence, 'low')

  return {
    alternatives: safeArray(item.alternatives).map((entry) => safeText(entry, '', 60)).filter(Boolean).slice(0, 4),
    calories: safeNumber(item.calories),
    carbohydrates: safeNumber(item.carbohydrates ?? item.carbs),
    confidence,
    dataSource: normalizeDataSource(item.dataSource || item.source),
    fat: safeNumber(item.fat),
    id: safeText(item.id) || `photo-item-${hashText(`${name}-${index}`)}`,
    name,
    estimatedAmount: safeNumber(item.estimatedAmount ?? item.amount, null, 10000),
    notes: safeText(item.notes || item.note || item.reason, '', 140),
    protein: safeNumber(item.protein),
    selected: item.selected !== false,
    unit: safeText(item.unit, 'g', 24),
    uncertain: item.uncertain === true || confidence === 'low' || confidence === 'insufficient',
    userEdited: item.userEdited === true,
  }
}

function sumDetectedNutrition(items) {
  return safeArray(items)
    .filter((item) => item.selected !== false)
    .reduce((totals, item) => ({
      calories: Number((totals.calories + (item.calories || 0)).toFixed(1)),
      carbs: Number((totals.carbs + (item.carbohydrates || 0)).toFixed(1)),
      fat: Number((totals.fat + (item.fat || 0)).toFixed(1)),
      protein: Number((totals.protein + (item.protein || 0)).toFixed(1)),
    }), { calories: 0, carbs: 0, fat: 0, protein: 0 })
}

function normalizeNutrition(nutrition = {}, detectedItems = []) {
  const detectedTotals = sumDetectedNutrition(detectedItems)

  return {
    calories: safeNumber(nutrition.calories, detectedTotals.calories, 10000),
    carbs: safeNumber(nutrition.carbs ?? nutrition.carbohydrates, detectedTotals.carbs, 2000),
    fat: safeNumber(nutrition.fat, detectedTotals.fat, 1000),
    protein: safeNumber(nutrition.protein, detectedTotals.protein, 1000),
  }
}

function componentToDetectedItem(component = {}, index = 0) {
  const nutrition = nutritionMidpointsFromEstimate(component.nutritionEstimate || {})

  return normalizeDetectedItem({
    alternatives: component.alternatives,
    calories: nutrition.calories,
    carbohydrates: nutrition.carbs,
    confidence: component.confidence,
    dataSource: 'aiEstimate',
    estimatedAmount: component.portionEstimate?.gramsMin !== null && component.portionEstimate?.gramsMax !== null
      ? Math.round((component.portionEstimate.gramsMin + component.portionEstimate.gramsMax) / 2)
      : null,
    fat: nutrition.fat,
    id: component.id || `photo-component-item-${index}`,
    name: component.name,
    notes: component.visualEvidence || component.uncertainty?.reason,
    protein: nutrition.protein,
    unit: 'g',
    uncertain: component.confidence === 'low' || component.confidence === 'insufficient',
  }, index)
}

function buildIngredientsFromComponents(components = []) {
  return components.map((component) => ({
    confidence: component.confidence,
    estimatedAmount: component.portionEstimate?.gramsMin !== null && component.portionEstimate?.gramsMax !== null
      ? `${component.portionEstimate.gramsMin}-${component.portionEstimate.gramsMax} g`
      : '',
    name: component.name,
    notes: [component.visualEvidence, component.uncertainty?.reason].filter(Boolean).join(' '),
  }))
}

export function normalizeNutritionPhotoAnalysis(value = {}, options = {}) {
  const source = isObject(value) && !payloadTooLarge(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => allowedAnalysisKeys.has(key)))
    : {}
  const analysisDate = getLocalDateString(options.analysisDate || source.analysisDate || options.today || new Date())
  const createdAt = safeText(source.createdAt) || (options.now || `${analysisDate}T12:00:00.000Z`)
  const components = normalizePhotoComponents(source.components || [])
  const componentDetectedItems = components.map(componentToDetectedItem)
  const detectedItems = safeArray(source.detectedItems?.length ? source.detectedItems : componentDetectedItems)
    .slice(0, maxPhotoDetectedItems)
    .map(normalizeDetectedItem)
  const confidenceLevel = normalizeConfidence(source.confidence, detectedItems.length ? 'medium' : 'insufficient')
  const componentTotals = calculateTotalsFromComponents(components)
  const modelTotals = normalizeEstimatedNutrition(source.mealTotals || source.estimatedNutrition || source.nutrition || source, { confidence: confidenceLevel })
  const totalsComparison = compareNutritionRanges(modelTotals, componentTotals)
  const estimatedNutrition = components.length && (!totalsComparison.isConsistent || !modelTotals.calories)
    ? componentTotals
    : modelTotals
  const nutritionMidpoints = nutritionMidpointsFromEstimate(estimatedNutrition)
  const legacyNutrition = normalizeNutrition(nutritionMidpoints, detectedItems)
  const componentPortion = normalizeMealPortionFromComponents(components)
  const ingredients = normalizeEstimatedIngredients(source.ingredients?.length ? source.ingredients : buildIngredientsFromComponents(components).length ? buildIngredientsFromComponents(components) : detectedItems)
  const portionEstimate = normalizePortionEstimate(source.portionEstimate || componentPortion || source.estimatedServing, {
    confidence: confidenceLevel,
    fallbackDescription: source.estimatedServing,
  })
  const uncertainIngredients = normalizeUncertainIngredients(source.uncertainIngredients || source.warnings, {
    ingredients: detectedItems,
  })
  const imageQuality = normalizePhotoAnalysisImageQuality(source.imageQuality || source.analysisQuality?.imageQuality, 'usable')
  const analysisQuality = normalizeAnalysisQuality(source.analysisQuality, {
    confidence: imageQuality === 'poor' && confidenceLevel === 'high' ? 'medium' : confidenceLevel,
    limitations: [
      ...safeArray(source.limitations),
      ...(!totalsComparison.isConsistent && components.length ? ['Meal totals räknades om från validerade komponentintervall.'] : []),
      ...(imageQuality === 'poor' ? ['Bildkvaliteten sänker säkerheten i analysen.'] : []),
    ],
    summary: source.safeSummary || source.summary,
  })
  const validationErrors = validateNutritionPhotoAnalysis({
    ...source,
    analysisDate,
    confidence: { level: confidenceLevel, score: confidenceScore(confidenceLevel) },
    components,
    detectedItems,
    estimatedNutrition,
    nutrition: legacyNutrition,
  }).errors
  const idSeed = [
    analysisDate,
    safeText(source.provider?.type || source.provider || 'mock'),
    detectedItems.map((item) => `${item.name}:${item.estimatedAmount}:${item.unit}`).join('|'),
    legacyNutrition.calories,
    legacyNutrition.protein,
  ].join('|')

  return {
    analysisDate,
    analysisId: safeText(source.analysisId) || `photo-analysis-${hashText(idSeed)}`,
    confidence: {
      level: confidenceLevel,
      score: confidenceScore(confidenceLevel),
      text: confidenceLevel === 'high'
        ? 'Hög teknisk confidence, men fortfarande en uppskattning.'
        : confidenceLevel === 'medium'
          ? 'Medelhög confidence. Kontrollera portion och ingredienser.'
          : confidenceLevel === 'low'
            ? 'Låg confidence. Granska och redigera innan sparning.'
            : 'Otillräcklig confidence. Komplettera manuellt innan sparning.',
    },
    createdAt,
    components,
    detectedItems,
    ingredients,
    analysisQuality,
    estimatedNutrition,
    estimatedServing: portionEstimate.description,
    imageMetadata: {
      dimensions: safeText(source.imageMetadata?.dimensions || source.imageMetadata?.size, '', 60),
      fileType: safeText(source.imageMetadata?.fileType || source.imageMetadata?.type, '', 40),
      sizeBytes: safeNumber(source.imageMetadata?.sizeBytes, null, 20000000),
    },
    limitations: safeArray(source.limitations).map((item) => safeText(item, '', 180)).filter(Boolean).slice(0, 6),
    imageQuality,
    mealTotals: estimatedNutrition,
    componentTotals,
    totalsValidation: totalsComparison,
    modelVersion: nutritionPhotoAnalysisVersion,
    provider: {
      type: safeText(source.provider?.type || source.provider || 'mock', 'mock', 40),
      label: safeText(source.provider?.label, 'Lokal uppskattning', 80),
    },
    nutrition: legacyNutrition,
    portionEstimate,
    safeSummary: safeText(source.safeSummary || source.summary, 'Bildanalys är en uppskattning och behöver granskas.', 220),
    sourceType: safeText(source.sourceType, 'photo', 40),
    status: validationErrors.length ? 'needsReview' : safeText(source.status, 'readyForReview', 40),
    uncertainIngredients,
    userEdited: source.userEdited === true,
    validationErrors,
    warnings: [
      ...safeArray(source.warnings).map((item) => safeText(item, '', 180)).filter(Boolean),
      confidenceLevel === 'low' || confidenceLevel === 'insufficient'
        ? 'Låg confidence kräver manuell granskning.'
        : '',
    ].filter(Boolean).slice(0, 6),
  }
}

export function validateNutritionPhotoAnalysis(value = {}) {
  const errors = []
  const detectedItems = safeArray(value.detectedItems)
  const nutrition = value.nutrition || nutritionMidpointsFromEstimate(value.estimatedNutrition || {})
  const confidence = normalizeConfidence(value.confidence)

  if (!getLocalDateString(value.analysisDate)) errors.push('Analysdatum saknas.')
  if (!detectedItems.length) errors.push('Minst en ingrediens behöver finnas.')
  if (confidence === 'insufficient') errors.push('Confidence är otillräcklig.')
  ;['calories', 'protein', 'carbs', 'fat'].forEach((field) => {
    const number = safeNumber(nutrition[field])
    if (number === null) errors.push(`${field} saknas.`)
    if (number !== null && number < 0) errors.push(`${field} får inte vara negativt.`)
  })

  return { errors, ok: errors.length === 0 }
}

export function createPhotoAnalysisReviewDraft(analysis = {}, options = {}) {
  const normalized = normalizeNutritionPhotoAnalysis(analysis, options)

  return {
    analysis: normalized,
    components: normalized.components,
    date: normalized.analysisDate,
    detectedItems: normalized.detectedItems,
    mealName: normalized.detectedItems[0]?.name ? `Foto: ${normalized.detectedItems[0].name}` : 'Måltid från foto',
    mealType: options.mealType || 'Lunch',
    note: 'Näring uppskattad från foto och granskad före sparning.',
    nutrition: normalized.nutrition,
    nutritionProvenance: 'ai_estimated',
    portionSize: normalized.portionEstimate.description,
    time: options.time || '12:00',
    userEdited: false,
  }
}

export function validatePhotoAnalysisReviewDraft(draft = {}) {
  const errors = {}
  if (!safeText(draft.mealName)) errors.mealName = 'Ange måltidsnamn.'
  if (!getLocalDateString(draft.date)) errors.date = 'Välj datum.'
  if (!/^\d{2}:\d{2}$/.test(String(draft.time || ''))) errors.time = 'Välj tid.'
  if (!safeArray(draft.detectedItems).length) errors.detectedItems = 'Lägg till minst en ingrediens.'
  ;['calories', 'protein', 'carbs', 'fat'].forEach((field) => {
    const number = safeNumber(draft.nutrition?.[field])
    if (number === null) errors[field] = 'Ange ett giltigt värde eller komplettera manuellt.'
  })

  return { errors, ok: Object.keys(errors).length === 0 }
}

export function detectPhotoMealDuplicate(draft = {}, meals = [], options = {}) {
  const analysisId = draft.analysis?.analysisId || draft.analysisId
  const normalizedMeals = normalizeMeals(meals)
  const draftTimestamp = `${draft.date}T${draft.time || '12:00'}`
  const exact = normalizedMeals.find((meal) =>
    analysisId && meal.photoAnalysis?.analysisId === analysisId)
  if (exact) {
    return {
      existingMealId: exact.id,
      message: 'Samma fotoanalys är redan sparad som måltid.',
      status: 'exactDuplicate',
    }
  }

  const close = normalizedMeals.find((meal) => {
    const sameDate = meal.date === draft.date
    const sameType = meal.type === draft.mealType
    const sameName = safeText(meal.name).toLocaleLowerCase('sv-SE') === safeText(draft.mealName).toLocaleLowerCase('sv-SE')
    const sameCalories = Math.abs((meal.calories || meal.nutritionOverride?.calories || 0) - (draft.nutrition?.calories || 0)) <= 30
    const minutes = Math.abs(new Date(`${meal.date}T${meal.time || '12:00'}`).getTime() - new Date(draftTimestamp).getTime()) / 60000

    return sameDate && minutes <= (options.windowMinutes || 20) && (sameName || (sameType && sameCalories))
  })

  if (close) {
    return {
      existingMealId: close.id,
      message: 'Det finns redan en liknande måltid nära samma tid.',
      status: close.name === draft.mealName ? 'likelyDuplicate' : 'possibleDuplicate',
    }
  }

  return { existingMealId: '', message: '', status: 'noDuplicate' }
}

export function commitPhotoAnalysisMeal(draft = {}, meals = [], options = {}) {
  const validation = validatePhotoAnalysisReviewDraft(draft)
  if (!validation.ok) {
    return { errors: validation.errors, meal: null, meals: normalizeMeals(meals), ok: false }
  }
  const duplicate = detectPhotoMealDuplicate(draft, meals, options)
  if (duplicate.status === 'exactDuplicate' || (duplicate.status === 'likelyDuplicate' && !options.allowDuplicate)) {
    return { duplicate, errors: { duplicate: duplicate.message }, meal: null, meals: normalizeMeals(meals), ok: false }
  }

  const now = options.now || new Date().toISOString()
  const selectedItems = safeArray(draft.detectedItems).filter((item) => item.selected !== false)
  const dataSources = [...new Set(selectedItems.map((item) => normalizeDataSource(item.dataSource)).filter(Boolean))]
  const description = selectedItems.map((item) => `${item.estimatedAmount || ''} ${item.unit || ''} ${item.name}`.trim()).join(', ')
  const meal = mealDraftToMeal({
    calories: draft.nutrition.calories,
    carbs: draft.nutrition.carbs,
    createdAt: now,
    date: draft.date,
    description,
    fat: draft.nutrition.fat,
    id: '',
    name: draft.mealName,
    note: safeText(draft.note, '', 240),
    nutritionOverride: {
      calories: draft.nutrition.calories,
      carbs: draft.nutrition.carbs,
      fat: draft.nutrition.fat,
      protein: draft.nutrition.protein,
    },
    photoAnalysis: {
      analysisQuality: draft.analysis.analysisQuality,
      analysisId: draft.analysis.analysisId,
      analyzedAt: draft.analysis.createdAt,
      confidence: draft.analysis.confidence.level,
      components: draft.analysis.components,
      componentTotals: draft.analysis.componentTotals,
      dataSources,
      estimatedNutrition: draft.analysis.estimatedNutrition,
      ingredients: draft.analysis.ingredients,
      imageQuality: draft.analysis.imageQuality,
      itemCount: selectedItems.length,
      mealTotals: draft.analysis.mealTotals,
      portionEstimate: draft.analysis.portionEstimate,
      provenance: draft.userEdited || draft.nutritionProvenance === 'user_confirmed' ? 'user_confirmed' : 'ai_estimated',
      providerType: draft.analysis.provider.type,
      reviewCompleted: true,
      schemaVersion: nutritionPhotoAnalysisVersion,
      source: 'photoAnalysis',
      uncertainIngredients: draft.analysis.uncertainIngredients,
      totalsValidation: draft.analysis.totalsValidation,
      userEdited: draft.userEdited === true || draft.analysis.userEdited === true,
    },
    portionSize: draft.portionSize,
    protein: draft.nutrition.protein,
    source: 'Fotoanalys',
    time: draft.time,
    type: draft.mealType,
    updatedAt: now,
  })

  if (!meal) {
    return { errors: { save: 'Måltiden kunde inte skapas.' }, meal: null, meals: normalizeMeals(meals), ok: false }
  }

  return {
    duplicate,
    errors: {},
    meal,
    meals: normalizeMeals([meal, ...normalizeMeals(meals).filter((entry) => entry.id !== meal.id)]),
    ok: true,
  }
}

export function buildPhotoAnalysisUsageSummary(meals = [], range = {}) {
  const photoMeals = normalizeMeals(meals)
    .filter((meal) => meal.photoAnalysis?.source === 'photoAnalysis')
    .filter((meal) => {
      const date = getEntryLocalDate(meal)
      if (range.start && date < range.start) return false
      if (range.end && date > range.end) return false
      return true
    })
  const confidenceCounts = photoMeals.reduce((counts, meal) => ({
    ...counts,
    [meal.photoAnalysis.confidence || 'low']: (counts[meal.photoAnalysis.confidence || 'low'] || 0) + 1,
  }), { high: 0, insufficient: 0, low: 0, medium: 0 })
  const editedCount = photoMeals.filter((meal) => meal.photoAnalysis.userEdited).length
  const providerCounts = photoMeals.reduce((counts, meal) => {
    const providerType = meal.photoAnalysis.providerType || 'unknown'
    counts[providerType] = (counts[providerType] || 0) + 1
    return counts
  }, { local: 0, mock: 0, remote: 0 })
  const dataSourceCounts = photoMeals.reduce((counts, meal) => {
    safeArray(meal.photoAnalysis.dataSources).forEach((source) => {
      counts[source] = (counts[source] || 0) + 1
    })
    return counts
  }, { aiEstimate: 0, barcode: 0, manual: 0, nutritionDatabase: 0 })

  return {
    cautiousPatterns: buildNutritionPhotoTrendSummary(photoMeals),
    confidenceCounts,
    dataSourceCounts,
    editedCount,
    lowConfidenceCount: confidenceCounts.low + confidenceCounts.insufficient,
    photoMealCount: photoMeals.length,
    providerCounts,
    text: photoMeals.length
      ? `${photoMeals.length} fotoanalyserade måltider, varav ${editedCount} redigerade.`
      : 'Inga fotoanalyserade måltider i perioden.',
  }
}

export const nutritionPhotoAnalysisInternals = {
  hashText,
  safeText,
  sumDetectedNutrition,
}
