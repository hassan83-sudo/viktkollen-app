import { getMealProvenance, summarizeMealProvenance } from './nutritionProvenance.js'

const macroFields = ['calories', 'protein', 'carbs', 'fat', 'fiber']
const coreMacroFields = ['calories', 'protein', 'carbs', 'fat']
const vagueTexts = new Set(['mat', 'måltid', 'maltid', 'middag', 'lunch', 'frukost', 'mellanmål', 'mellanmal', 'kvällsmål', 'kvallsmal'])
const validMealTypes = new Set(['frukost', 'mellanmål', 'mellanmal', 'lunch', 'middag', 'kvällsmål', 'kvallsmal', 'nattmål', 'nattmal', 'dryck'])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)))
}

function normalizeText(value) {
  return String(value || '')
    .slice(0, 1000)
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

function normalizePlain(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
}

function getMealText(meal) {
  return normalizeText([meal?.name, meal?.description, meal?.text, meal?.title, meal?.note].filter(Boolean).join(' '))
}

function hasQuantity(text) {
  return /\b\d+(?:[,.]\d+)?\b|\b(en|ett|två|tva|tre|fyra|fem|sex|sju|åtta|atta|nio|tio)\b/u.test(normalizePlain(text))
}

function hasUnit(text) {
  return /\b(g|gram|kg|kilo|dl|cl|ml|liter|msk|tsk|skiva|skivor|portion|portioner|st|styck|stycken)\b/u.test(normalizePlain(text))
}

function hasPortionDescription(text) {
  return /\b(liten|stor|normal|portion|portioner|tallrik|skål|skal|näve|nave|bit|skiva|skivor)\b/u.test(normalizePlain(text))
}

function isVagueMealText(plain) {
  const tokens = plain.split(/\s+/).filter(Boolean)

  return tokens.length > 0 && tokens.every((token) => vagueTexts.has(token))
}

function getManualFields(effectiveNutrition) {
  return Array.isArray(effectiveNutrition?.manualFields)
    ? effectiveNutrition.manualFields.filter((field) => macroFields.includes(field))
    : []
}

function hasExtremeValue(totals = {}) {
  return safeNumber(totals.calories) > 3500 ||
    safeNumber(totals.protein) > 250 ||
    safeNumber(totals.carbs) > 500 ||
    safeNumber(totals.fat) > 250 ||
    safeNumber(totals.fiber) > 100
}

export function classifyNutritionConfidence(score, fallback = 'unknown') {
  const value = Number(score)

  if (!Number.isFinite(value)) return fallback
  if (value >= 75) return 'high'
  if (value >= 45) return 'medium'
  if (value >= 15) return 'low'
  return 'unknown'
}

export function getNutritionConfidenceLabel(level, source = '') {
  if (source === 'manual') return 'Manuellt korrigerad'
  if (source === 'partial_manual') return 'Delvis manuellt korrigerad'
  if (level === 'high') return 'Tydligt underlag'
  if (level === 'medium') return 'Delvis tydligt underlag'
  if (level === 'low') return 'Begränsat underlag'
  return 'Kan inte bedömas'
}

export function evaluateNutritionFieldConfidence(field, context = {}) {
  const manual = Boolean(context.manual)
  const estimated = Boolean(context.estimated)
  const value = Number(context.value)
  const hasValue = Number.isFinite(value) && value >= 0
  const reasons = []
  const missingInformation = []
  let score = 0

  if (manual) {
    score = 88
    reasons.push('Värdet är manuellt angivet av användaren.')
  } else if (estimated && hasValue) {
    score = context.hasQuantity ? 72 : 48
    reasons.push(context.hasQuantity ? 'Värdet bygger på identifierad mat och mängd.' : 'Värdet bygger på identifierad mat utan tydlig mängd.')
  } else if (hasValue && value > 0) {
    score = 30
    reasons.push('Värdet finns i måltiden men underlaget är otydligt.')
  } else {
    missingInformation.push(`${field} saknar analyserbart underlag`)
  }

  if (!manual && !context.hasQuantity) missingInformation.push('mängd saknas')
  if (!manual && !context.hasUnit) missingInformation.push('enhet saknas')
  if (hasValue && value > 100000) {
    score = 10
    reasons.push('Värdet är ovanligt högt och bör granskas.')
  }

  return {
    estimated,
    field,
    level: classifyNutritionConfidence(score),
    manual,
    missingInformation: [...new Set(missingInformation)].slice(0, 3),
    reasons,
    score: clampScore(score),
  }
}

export function buildNutritionConfidenceExplanation(confidence) {
  if (!confidence || confidence.level === 'unknown') {
    return 'Det finns inte tillräckligt med måltidsinformation för att bedöma näringsvärdena.'
  }

  const text = []

  if (confidence.manualFields?.length) {
    text.push(`${confidence.manualFields.join(', ')} är manuellt angivet av användaren.`)
  }

  if (confidence.reasons?.length) {
    text.push(confidence.reasons[0])
  }

  if (confidence.missingInformation?.length) {
    text.push(`Saknas: ${confidence.missingInformation.slice(0, 3).join(', ')}.`)
  }

  return text.join(' ') || 'Underlaget är en deterministisk uppskattning baserad på måltidsbeskrivningen.'
}

export function buildNutritionImprovementTips(confidence) {
  const missing = new Set(confidence?.missingInformation || [])
  const tips = []

  if (missing.has('ingredienser saknas')) tips.push('Lägg till vad måltiden innehöll, till exempel kyckling, ris eller broccoli.')
  if (missing.has('mängd saknas')) tips.push('Lägg till mängd, till exempel 200 g kyckling eller 2 skivor bröd.')
  if (missing.has('enhet saknas')) tips.push('Skriv gärna en enhet som gram, dl, skivor eller portion.')
  if (missing.has('portionsstorlek saknas')) tips.push('Beskriv portionsstorlek, till exempel liten, normal eller stor portion.')
  if (missing.has('måltidstexten är för vag')) tips.push('Skriv en mer konkret beskrivning än bara måltidstypen.')

  return tips.slice(0, 2)
}

export function evaluateMealNutritionConfidence(meal, effectiveNutrition = {}) {
  const text = getMealText(meal)
  const plain = normalizePlain(text)
  const analysis = effectiveNutrition.analysis || {}
  const totals = effectiveNutrition.totals || analysis.totals || {}
  const manualFields = getManualFields(effectiveNutrition)
  const analyzedFields = macroFields.filter((field) => safeNumber(analysis?.totals?.[field]) > 0)
  const estimatedFields = macroFields.filter((field) => !manualFields.includes(field) && safeNumber(totals[field]) > 0)
  const itemCount = Array.isArray(analysis.items) ? analysis.items.length : 0
  const unknownFoods = Array.isArray(analysis.unknownFoods) ? analysis.unknownFoods : []
  const quantity = hasQuantity(text)
  const unit = hasUnit(text)
  const portion = hasPortionDescription(text)
  const mealType = normalizePlain(meal?.mealType || meal?.type || analysis.mealType || '')
  const reasons = []
  const missingInformation = []
  let score = 0

  if (!text) missingInformation.push('ingredienser saknas')
  if (!text || isVagueMealText(plain)) missingInformation.push('måltidstexten är för vag')
  if (itemCount > 0) {
    score += itemCount > 1 ? 48 : 44
    reasons.push(itemCount > 1 ? 'Flera ingredienser kunde identifieras.' : 'En tydlig matvara kunde identifieras.')
  } else {
    missingInformation.push('ingredienser saknas')
  }
  if (quantity) {
    score += 20
    reasons.push('Mängd finns i beskrivningen.')
  } else {
    missingInformation.push('mängd saknas')
  }
  if (unit) {
    score += 16
    reasons.push('Enhet finns i beskrivningen.')
  } else {
    missingInformation.push('enhet saknas')
  }
  if (portion) score += 8
  else missingInformation.push('portionsstorlek saknas')
  if (validMealTypes.has(mealType)) score += 5
  if (manualFields.length > 0) {
    score += manualFields.length === macroFields.length ? 35 : 18
    reasons.push(manualFields.length === macroFields.length ? 'Alla näringsfält är manuellt angivna.' : 'Vissa näringsfält är manuellt angivna.')
  }
  if (unknownFoods.length > 0) {
    score -= 18
    reasons.push(`${unknownFoods.join(', ')} kunde inte identifieras.`)
  }
  if (hasExtremeValue(totals)) {
    score = Math.min(score, 25)
    reasons.push('Ett eller flera värden är ovanligt höga och bör granskas.')
  }

  const fieldConfidence = macroFields.reduce((result, field) => {
    result[field] = evaluateNutritionFieldConfidence(field, {
      estimated: analyzedFields.includes(field) || estimatedFields.includes(field),
      hasQuantity: quantity,
      hasUnit: unit,
      manual: manualFields.includes(field),
      value: totals[field],
    })

    return result
  }, {})
  const level = classifyNutritionConfidence(score)
  const source = manualFields.length === 0
    ? 'automatic'
    : coreMacroFields.every((field) => manualFields.includes(field))
      ? 'manual'
      : 'partial_manual'
  const uniqueMissing = [...new Set(missingInformation)]
  const confidence = {
    analyzedFields,
    estimatedFields,
    explanation: '',
    fieldConfidence,
    improvementTips: [],
    label: getNutritionConfidenceLabel(level, source),
    level,
    manualFields,
    missingInformation: uniqueMissing,
    reasons: [...new Set(reasons)],
    reviewRecommended: level === 'unknown' || level === 'low' || unknownFoods.length > 0 || hasExtremeValue(totals),
    score: clampScore(score),
    source,
  }

  confidence.explanation = buildNutritionConfidenceExplanation(confidence)
  confidence.improvementTips = buildNutritionImprovementTips(confidence)

  return confidence
}

function normalizeEntry(entry) {
  if (!isObject(entry)) return null

  const effectiveNutrition = entry.effectiveNutrition || entry
  const confidence = effectiveNutrition.confidence || entry.confidence || evaluateMealNutritionConfidence(entry.meal || entry, effectiveNutrition)
  const provenance = getMealProvenance(entry.meal || entry)

  return {
    confidence,
    date: entry.date || entry.meal?.date || '',
    id: String(entry.id || entry.meal?.id || ''),
    meal: entry.meal || entry,
    provenance,
    text: entry.text || getMealText(entry.meal || entry),
    time: entry.time || entry.meal?.time || '',
  }
}

export function buildMealsNeedingReview(entries = [], options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 5

  return (Array.isArray(entries) ? entries : [])
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((entry) => entry.confidence.reviewRecommended)
    .map((entry) => {
      const priority = entry.confidence.level === 'unknown'
        ? 1
        : entry.confidence.missingInformation.includes('måltidstexten är för vag')
          ? 2
          : entry.confidence.reasons.some((reason) => reason.includes('ovanligt höga'))
            ? 3
            : entry.confidence.level === 'low'
              ? 4
              : 5

      return {
        ...entry,
        priority,
        reason: entry.confidence.explanation,
        tips: entry.confidence.improvementTips,
      }
    })
    .sort((first, second) => first.priority - second.priority || first.date.localeCompare(second.date) || first.time.localeCompare(second.time))
    .slice(0, limit)
}

export function buildNutritionDataQualitySummary(entries = []) {
  const normalized = (Array.isArray(entries) ? entries : []).map(normalizeEntry).filter(Boolean)
  const mealCount = normalized.length
  const provenance = summarizeMealProvenance(normalized.map((entry) => entry.meal))
  const levelCount = (level) => normalized.filter((entry) => entry.confidence.level === level).length
  const manualMealCount = normalized.filter((entry) => entry.confidence.manualFields.length > 0).length
  const macroCoverage = macroFields.reduce((result, field) => {
    const count = normalized.filter((entry) => {
      const fieldConfidence = entry.confidence.fieldConfidence?.[field]

      return fieldConfidence?.manual || fieldConfidence?.estimated || entry.confidence.manualFields.includes(field)
    }).length

    result[field] = {
      analyzableMealCount: count,
      label: mealCount > 1
        ? `${count} av ${mealCount} måltider`
        : mealCount === 1
          ? `${count} av 1 måltid`
          : 'Inga måltider',
      mealCount,
    }

    return result
  }, {})
  const analyzedMealCount = normalized.filter((entry) => ['high', 'medium'].includes(entry.confidence.level)).length
  const partiallyAnalyzedMealCount = normalized.filter((entry) => entry.confidence.level === 'low').length
  const unanalyzedMealCount = normalized.filter((entry) => entry.confidence.level === 'unknown').length
  const reviewMeals = buildMealsNeedingReview(normalized)

  return {
    analyzedCoverage: mealCount > 0
      ? `${analyzedMealCount + partiallyAnalyzedMealCount} av ${mealCount} måltider kunde analyseras helt eller delvis`
      : 'Inga måltider att analysera',
    analyzedMealCount,
    aiEstimatedMealCount: provenance.aiEstimatedMealCount,
    derivedMealCount: provenance.derivedMealCount,
    highConfidenceMeals: levelCount('high'),
    importedMealCount: provenance.importedMealCount,
    lowConfidenceMeals: levelCount('low'),
    macroCoverage,
    manualMealCount,
    mediumConfidenceMeals: levelCount('medium'),
    partiallyAnalyzedMealCount,
    provenance,
    reviewMealCount: normalized.filter((entry) => entry.confidence.reviewRecommended).length,
    reviewMeals,
    unanalyzedMealCount,
    unknownConfidenceMeals: levelCount('unknown'),
    userConfirmedMealCount: provenance.userConfirmedMealCount,
    userEnteredMealCount: provenance.userEnteredMealCount,
    userVerifiedMealCount: provenance.userVerifiedMealCount,
    validMealCount: mealCount,
  }
}

export function describeNutritionDataQuality(summary = {}) {
  if (!summary.validMealCount) return 'Jag hittar inga måltider att bedöma.'

  const calorieText = summary.macroCoverage?.calories?.label || 'kalorier saknar underlag'
  const proteinText = summary.macroCoverage?.protein?.label || 'protein saknar underlag'
  const provenanceText = summary.aiEstimatedMealCount > 0
    ? ` ${summary.aiEstimatedMealCount} måltider bygger på AI-estimat.`
    : ''
  const reviewText = summary.reviewMealCount > 0
    ? ` ${summary.reviewMealCount} måltider kan behöva granskas.`
    : ' Inga måltider sticker ut för granskning.'

  return `${summary.analyzedCoverage}. Protein: ${proteinText}. Kalorier: ${calorieText}.${provenanceText}${reviewText}`
}

export const nutritionConfidenceFields = macroFields
