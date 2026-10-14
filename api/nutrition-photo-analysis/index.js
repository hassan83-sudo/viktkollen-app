import {
  callOpenAiJson,
  getAiGatewayConfig,
} from '../_shared/openaiGateway.js'
import { aiRouteErrorCodes, mapGatewayErrorCode, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { createImageFingerprint, runDedupedAiRequest } from '../_shared/aiRequestDeduper.js'
import { verifySupabaseUser, verifySupabaseUserInternals } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'
import { matchComponentsToFoodBank } from '../_shared/nutritionFoodBankLookup.js'
import {
  checkMealPlausibility,
  checkPer100Consistency,
  checkPortionPlausibility,
  plausibilityFlagReasons,
} from '../../src/services/nutritionPhotoPlausibility.js'
import { DISPATCH_CAS_RESULT } from '../../src/services/billing/durableOperationStore.js'
import { resolveFoodScanOwnerExemption, withOwnerUnlimitedQuota } from '../_shared/billing/foodScanOwnerExemption.js'
import {
  createFoodScanOperationId,
  executeFoodScanMeteredOperation,
  mapFoodScanBillingHttp,
  resolveFoodScanBillingRuntime,
} from '../_shared/billing/foodScanLiveBilling.js'
import {
  calculateTotalsFromComponents,
  compareNutritionRanges,
  buildPlateConsistencyNotes,
  normalizeAnalysisQuality,
  normalizeEstimatedIngredients,
  normalizeEstimatedNutrition,
  normalizeMealPortionFromComponents,
  normalizePhotoAnalysisImageQuality,
  normalizePhotoComponents,
  normalizePortionEstimate,
  normalizeUncertainIngredients,
  nutritionMidpointsFromEstimate,
} from '../../src/services/nutritionPhotoEstimates.js'

const DEFAULT_MODEL = 'gpt-4.1-mini'
export const NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS = 45000
export const NUTRITION_PHOTO_MAX_COMPONENTS = 12
// Kompakt svar: identitet, tillagning, gram och reservvärde per 100 g (ca 60-80
// tokens per komponent). Näring räknas på servern från Livsmedelsverkets matbank.
export const NUTRITION_PHOTO_MAX_OUTPUT_TOKENS = 1400
const MAX_IMAGE_SIZE_BYTES = Number(process.env.NUTRITION_PHOTO_MAX_FILE_BYTES || 8 * 1024 * 1024)
const REQUEST_TIMEOUT_MS = Number(process.env.NUTRITION_PHOTO_TIMEOUT_MS || NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS)
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const TRUSTED_PRODUCTION_HOSTS = new Set(['viktkollen-app.vercel.app'])

export const config = {
  api: {
    bodyParser: false,
  },
}

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function normalizeAllowedHost(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host.toLowerCase()
  } catch {
    return ''
  }
}

function getTrustedProductionHost(requestHost) {
  const normalized = normalizeAllowedHost(requestHost)
  return TRUSTED_PRODUCTION_HOSTS.has(normalized) ? normalized : ''
}

function isAllowedOrigin(origin, ...allowedHosts) {
  if (!origin) return true

  try {
    const parsedOrigin = new URL(origin)
    if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') return false

    const originHost = parsedOrigin.host.toLowerCase()
    const normalizedAllowedHosts = allowedHosts.map(normalizeAllowedHost).filter(Boolean)
    return normalizedAllowedHosts.includes(originHost)
  } catch {
    return false
  }
}

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function safeNumber(value, fallback = null, max = 100000) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.min(number, max)
}

function safeError(response, status, code, message, retryable = false, requestId = '') {
  const mapping = {
    consentRequired: aiRouteErrorCodes.CONSENT_REQUIRED,
    corsBlocked: aiRouteErrorCodes.INVALID_REQUEST,
    invalidContentType: aiRouteErrorCodes.INVALID_REQUEST,
    invalidProviderResponse: aiRouteErrorCodes.PROVIDER_INVALID_RESPONSE,
    methodNotAllowed: aiRouteErrorCodes.INVALID_REQUEST,
    missingImage: aiRouteErrorCodes.INVALID_REQUEST,
    oversizedImage: aiRouteErrorCodes.REQUEST_TOO_LARGE,
    rateLimit: aiRouteErrorCodes.RATE_LIMITED,
    serverConfiguration: aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED,
    timeout: aiRouteErrorCodes.PROVIDER_TIMEOUT,
    unsupportedFormat: aiRouteErrorCodes.INVALID_REQUEST,
  }
  return sendSafeAiError(response, {
    code: mapping[code] || aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
    requestId,
    retryable,
    safeMessage: message,
    status,
  })
}

function getBoundary(contentType) {
  return contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('boundary='))
    ?.replace('boundary=', '')
}

async function readBody(request) {
  if (request.body) {
    return Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body), 'latin1')
  }
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function parseMultipart(rawBodyBuffer, boundary) {
  const rawBody = rawBodyBuffer.toString('latin1')
  const fields = {}
  const files = {}

  rawBody.split(`--${boundary}`).forEach((part) => {
    if (!part.includes('Content-Disposition')) return
    const [rawHeaders, ...contentParts] = part.split('\r\n\r\n')
    const content = contentParts.join('\r\n\r\n').replace(/\r\n--$/, '').replace(/\r\n$/, '')
    const fieldName = rawHeaders.match(/name="([^"]+)"/)?.[1]
    const fileName = rawHeaders.match(/filename="([^"]*)"/)?.[1]
    const contentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.toLowerCase() || ''
    if (!fieldName) return
    if (!fileName) {
      fields[fieldName] = content.trim()
      return
    }
    files[fieldName] = {
      contentType,
      data: Buffer.from(content, 'latin1'),
      fileName: safeText(fileName, 'image', 80),
      size: Buffer.byteLength(content, 'latin1'),
    }
  })

  return { fields, files }
}

async function parseRequest(request) {
  const contentType = getHeader(request, 'content-type')
  if (!contentType.includes('multipart/form-data')) {
    return { error: { code: 'invalidContentType', message: 'Skicka bilden som multipart/form-data.', status: 415 } }
  }
  const boundary = getBoundary(contentType)
  if (!boundary) {
    return { error: { code: 'invalidContentType', message: 'Multipart boundary saknas.', status: 415 } }
  }
  const rawBody = await readBody(request)
  if (!rawBody.length) {
    return { error: { code: 'missingImage', message: 'Bild saknas.', status: 400 } }
  }
  if (rawBody.length > MAX_IMAGE_SIZE_BYTES + 200000) {
    return { error: { code: 'oversizedImage', message: 'Förfrågan är för stor.', status: 413 } }
  }
  return { parsed: parseMultipart(rawBody, boundary) }
}

function validateImage(image) {
  if (!image || !image.data?.length) return { code: 'missingImage', message: 'Bild saknas.', status: 400 }
  if (!allowedImageTypes.includes(image.contentType)) return { code: 'unsupportedFormat', message: 'Endast JPEG, PNG och WebP stöds.', status: 415 }
  if (image.size <= 0) return { code: 'missingImage', message: 'Bildfilen är tom.', status: 400 }
  if (image.size > MAX_IMAGE_SIZE_BYTES) return { code: 'oversizedImage', message: 'Bilden är för stor.', status: 413 }
  const header = image.data.subarray(0, 12)
  const isJpeg = image.contentType === 'image/jpeg' && header[0] === 0xff && header[1] === 0xd8
  const isPng = image.contentType === 'image/png' && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isWebp = image.contentType === 'image/webp' && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!isJpeg && !isPng && !isWebp) return { code: 'unsupportedFormat', message: 'Bildens filsignatur matchar inte formatet.', status: 415 }
  return null
}

// Kort prompt (MATSCAN-OPT-1): modellen identifierar livsmedel, tillagning och
// gram per komponent. Kalorier och makron räknas på servern från Livsmedelsverkets
// matbank; modellens per100-värden används bara som märkt reserv.
function createPrompt(mealType) {
  return [
    'Viktkollen food photo analysis. Reply with compact JSON only, no markdown:',
    `{"items":[{"name":"","bank":"","cat":"","cook":"","g":[0,0],"conf":"","gconf":"","alt":[],"per100":[0,0,0,0],"box":null}],"quality":"","conf":"","note":""}`,
    `1. One item per visually distinct food, max ${NUTRITION_PHOTO_MAX_COMPONENTS}. Keep every visible sauce, dressing, dip, oil/butter, bread, breading and topping as its own item; split dishes into their visible parts (burger: bun, patty, cheese, vegetables, sauce). A dish that cannot be separated (pizza slice, lasagne, soup, stew) is one item. Do not merge separate foods; do not count the same food twice.`,
    'For each visible item, box: [left,top,right,bottom] in image coordinates 0-1000 (full image dimensions), tightly enclosing the visible food. If its position is unclear, box:null. Never invent a location.',
    '2. name: short Swedish name for the user. bank: Swedish name in Livsmedelsverket style, main food first, then cut/type, then cooking, e.g. "Kyckling bröstfilé stekt", "Ris vitt kokt", "Broccoli kokt", "Pommes frites ugnsstekta", "Lax ugnsstekt", "Nötfärs stekt", "Potatis kokt", "Bearnaisesås".',
    '3. cat: protein|carbohydrate|vegetables|sauce|fat|drink|unknown. cook: fried|breaded|grilled|boiled|baked|steamed|raw or "" - only with visible cues (browning, crust, grill marks, breading, oil sheen).',
    '4. Identity: judge colour, texture, shape, surface and cooking cues; check texture before naming meat or fish. Chicken: matte white-beige meat with long parallel fibres, often grill marks or a seasoned crust. Fish: flakes in layers, white or pink segments, often skin or sheen. Also check pork vs chicken, beef vs lamb, rice vs bulgur/couscous, potato vs sweet potato, cream sauce vs yoghurt sauce. conf high only when unmistakable; otherwise medium or low with up to 2 likely alternatives in alt. Never present a guess as certain. An unidentifiable food is "Okänd komponent" with conf low.',
    '5. g: grams for each item separately as [min,max]. Use visible area x height/thickness, shape (flat layer, mound, pieces) and density. Do not assume a plate size; judge scale from several cues together (cutlery, glass, hand, packaging, rim, pieces of known size) and widen the range when cues are weak. Overlapping or partly hidden food: count only what is visible or clearly implied (e.g. rice under sauce), never twice, and lower gconf; count only visible pieces. Sanity-check against typical servings (meat/fish 100-200, rice/pasta/potato 150-300, vegetables 50-150, sauce 20-80, butter/oil 5-15); [null,null] when impossible. gconf: high|medium|low.',
    '6. per100: your estimate of kcal, protein g, carbs g, fat g per 100 g of the item as served, including cooking fat and breading. Used only as a labelled fallback when the food database has no safe match.',
    '7. Never invent hidden ingredients. quality: good|usable|poor (light, blur, occlusion, photo of a screen). conf: overall high|medium|low. note: max 100 characters in Swedish, factual, no health or diet advice.',
    `Meal type: ${safeText(mealType, 'unknown', 40)}.`,
  ].join('\n')
}

const compactCategories = new Set(['protein', 'carbohydrate', 'vegetables', 'sauce', 'fat', 'unknown'])
const compactCooking = new Set(['fried', 'breaded', 'grilled', 'boiled', 'baked', 'steamed', 'raw'])

function compactConfidence(value, fallback = 'low') {
  const text = safeText(value, '', 20).toLowerCase()
  return ['high', 'medium', 'low'].includes(text) ? text : fallback
}

function compactGrams(value) {
  if (!Array.isArray(value)) return { gramsMax: null, gramsMin: null }
  const min = safeNumber(value[0], null, 5000)
  const max = safeNumber(value[1] ?? value[0], null, 5000)
  if (min === null || max === null || max <= 0) return { gramsMax: null, gramsMin: null }
  return { gramsMax: Math.max(min, max), gramsMin: Math.min(min, max) }
}

function compactPer100(value) {
  if (!Array.isArray(value) || value.length < 4) return null
  const [calories, protein, carbs, fat] = [
    safeNumber(value[0], null, 1000),
    safeNumber(value[1], null, 100),
    safeNumber(value[2], null, 100),
    safeNumber(value[3], null, 100),
  ]
  if ([calories, protein, carbs, fat].some((entry) => entry === null)) return null
  return { calories, carbs, fat, protein }
}

function rangeFromPer100(per100Value, gramsMin, gramsMax) {
  return {
    max: Number((per100Value * gramsMax / 100).toFixed(1)),
    min: Number((per100Value * gramsMin / 100).toFixed(1)),
  }
}

// Översätter modellens kompakta svar till appens befintliga komponentformat,
// med automatisk rimlighetskontroll av gram och näringsvärden per 100 g.
export function componentsFromCompactItems(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, NUTRITION_PHOTO_MAX_COMPONENTS).map((item, index) => {
    const source = item && typeof item === 'object' ? item : {}
    const confidence = compactConfidence(source.conf)
    const category = safeText(source.cat, 'unknown', 20).toLowerCase()
    const cook = safeText(source.cook, '', 20).toLowerCase()
    const base = {
      bankName: safeText(source.bank, '', 80),
      category: compactCategories.has(category) ? category : 'unknown',
      cookingMethods: compactCooking.has(cook) ? [cook] : [],
      name: safeText(source.name, 'Okänd komponent', 50),
    }
    const portion = checkPortionPlausibility({ ...base, ...compactGrams(source.g) })
    const energy = checkPer100Consistency(compactPer100(source.per100), base)
    const aiPer100 = energy.per100
    const flags = [...portion.flags, ...energy.flags]
    const grams = { gramsMax: portion.gramsMax, gramsMin: portion.gramsMin }
    const portionAdjusted = portion.flags.length > 0
    const reasons = [
      confidence === 'high' ? '' : 'Osäker identifiering – kontrollera.',
      ...flags.map((flag) => plausibilityFlagReasons[flag] || ''),
    ].filter(Boolean)
    return {
      ...base,
      imageBox: Array.isArray(source.box) && source.box.length === 4 && source.box.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000) && source.box[2] > source.box[0] && source.box[3] > source.box[1] ? source.box : null,
      aiPer100,
      alternatives: Array.isArray(source.alt) ? source.alt.map((entry) => safeText(entry, '', 30)).filter(Boolean).slice(0, 2) : [],
      confidence,
      id: `photo-component-${index}`,
      identityConfidence: confidence,
      nutritionEstimate: aiPer100 && grams.gramsMin !== null ? {
        calories: rangeFromPer100(aiPer100.calories, grams.gramsMin, grams.gramsMax),
        carbsG: rangeFromPer100(aiPer100.carbs, grams.gramsMin, grams.gramsMax),
        fatG: rangeFromPer100(aiPer100.fat, grams.gramsMin, grams.gramsMax),
        proteinG: rangeFromPer100(aiPer100.protein, grams.gramsMin, grams.gramsMax),
      } : {},
      plausibilityFlags: flags,
      portionEstimate: {
        // Justerade intervall är redan breda och ska inte breddas igen; osäkerheten
        // märks i stället på ingrediensen (plausibilityFlags/uncertain).
        confidence: portionAdjusted ? 'medium' : grams.gramsMin === null ? 'low' : compactConfidence(source.gconf, 'medium'),
        description: grams.gramsMin === null
          ? 'Mängden kunde inte bedömas'
          : `${portion.flags.includes('portion_typical') ? 'Typisk portion ' : ''}${Math.round(grams.gramsMin)}–${Math.round(grams.gramsMax)} g`,
        evidence: portion.flags.map((flag) => plausibilityFlagReasons[flag]).join(' '),
        gramsMax: grams.gramsMax,
        gramsMin: grams.gramsMin,
      },
      uncertaintyReason: reasons.join(' ').slice(0, 140),
      visualEvidence: '',
    }
  })
}

// Kompakt svar -> befintligt format, med näring från matbanken där en säker träff finns.
export async function expandCompactPayload(payload = {}, foodBankOptions = {}) {
  if (!payload || !Array.isArray(payload.items)) return { foodBank: null, payload }
  const components = componentsFromCompactItems(payload.items)
  const { lookup, matches } = await matchComponentsToFoodBank(components, foodBankOptions)
  const withBank = components.map((component) => {
    const match = matches.get(component.id)
    return match?.status === 'matched' ? { ...component, foodBankMatch: match.food } : component
  })
  const statuses = [...matches.values()].reduce((summary, match) => {
    summary[match.status] = (summary[match.status] || 0) + 1
    return summary
  }, {})
  const note = safeText(payload.note, '', 120)
  return {
    foodBank: { lookupOk: lookup.ok, reason: lookup.reason, statuses },
    payload: {
      components: withBank,
      confidence: compactConfidence(payload.conf, 'low'),
      imageQuality: safeText(payload.quality, 'usable', 20),
      limitations: [],
      safeSummary: note,
      warnings: [],
    },
  }
}

function normalizeConfidence(value) {
  const text = safeText(value?.level || value).toLowerCase()
  if (['high', 'medium', 'low', 'insufficient'].includes(text)) return text
  const score = Number(value?.score ?? value)
  if (Number.isFinite(score)) {
    if (score >= 0.75) return 'high'
    if (score >= 0.5) return 'medium'
    if (score >= 0.25) return 'low'
  }
  return 'insufficient'
}

function normalizePer100(value) {
  if (!value || typeof value !== 'object') return null
  const per100 = {
    calories: safeNumber(value.calories, null, 1000),
    carbs: safeNumber(value.carbs, null, 100),
    fat: safeNumber(value.fat, null, 100),
    protein: safeNumber(value.protein, null, 100),
  }
  return Object.values(per100).every((entry) => entry !== null) ? per100 : null
}

function normalizeItem(item = {}, index = 0) {
  return {
    ...(normalizePer100(item.per100) ? { per100: normalizePer100(item.per100) } : {}),
    ...(item.sourceFood?.id ? { sourceFood: { id: safeText(item.sourceFood.id, '', 80), name: safeText(item.sourceFood.name, '', 120), source: safeText(item.sourceFood.source, '', 40) } } : {}),
    ...(item.uncertain === true ? { uncertain: true } : {}),
    ...(Array.isArray(item.amountRange) && item.amountRange.length === 2 && item.amountRange.every((entry) => safeNumber(entry, null, 10000) !== null)
      ? { amountRange: item.amountRange.map((entry) => Math.round(safeNumber(entry, 0, 10000))) }
      : {}),
    ...(Array.isArray(item.checks) && item.checks.length ? { checks: item.checks.map((entry) => safeText(entry, '', 40)).filter(Boolean).slice(0, 4) } : {}),
    alternatives: Array.isArray(item.alternatives) ? item.alternatives.map((entry) => safeText(entry, '', 60)).filter(Boolean).slice(0, 4) : [],
    calories: safeNumber(item.calories, null, 5000),
    carbohydrates: safeNumber(item.carbohydrates ?? item.carbs, null, 1000),
    confidence: normalizeConfidence(item.confidence || 'low'),
    dataSource: safeText(item.dataSource, 'aiEstimate', 40),
    estimatedAmount: safeNumber(item.estimatedAmount ?? item.amount, null, 10000),
    fat: safeNumber(item.fat, null, 1000),
    name: safeText(item.name || `Ingrediens ${index + 1}`, `Ingrediens ${index + 1}`, 80),
    protein: safeNumber(item.protein, null, 1000),
    unit: safeText(item.unit, 'g', 24),
  }
}

function validateProviderPayload(payload = {}) {
  const components = normalizePhotoComponents(payload.components || [])
  const componentTotals = calculateTotalsFromComponents(components)
  const componentPortion = normalizeMealPortionFromComponents(components)
  const detectedItems = Array.isArray(payload.detectedItems)
    ? payload.detectedItems.slice(0, 12).map(normalizeItem)
    : components.map((component, index) => {
      const nutrition = nutritionMidpointsFromEstimate(component.nutritionEstimate || {})
      return normalizeItem({
        alternatives: component.alternatives,
        calories: nutrition.calories,
        carbohydrates: nutrition.carbs,
        confidence: component.confidence,
        dataSource: component.nutritionSource === 'databaseDerived' ? 'databaseDerived' : 'aiEstimate',
        estimatedAmount: component.portionEstimate?.gramsMin !== null && component.portionEstimate?.gramsMax !== null
          ? Math.round((component.portionEstimate.gramsMin + component.portionEstimate.gramsMax) / 2)
          : null,
        fat: nutrition.fat,
        name: component.name,
        per100: component.matchedFood?.per100 || component.aiPer100 || null,
        protein: nutrition.protein,
        sourceFood: component.matchedFood?.source === 'livsmedelsverket' || component.matchedFood?.category === 'nutrition_food_bank'
          ? { id: component.matchedFood.id, name: component.matchedFood.name, source: component.matchedFood.source }
          : null,
        amountRange: component.portionEstimate?.gramsMin !== null && component.portionEstimate?.gramsMax !== null
          ? [component.portionEstimate.gramsMin, component.portionEstimate.gramsMax]
          : null,
        checks: component.plausibilityFlags || [],
        uncertain: component.confidence !== 'high' || Boolean(component.plausibilityFlags?.length),
        unit: 'g',
      }, index)
    })
  const modelNutrition = normalizeEstimatedNutrition(payload.mealTotals || payload.estimatedNutrition || payload, { confidence: payload.confidence })
  const totalsComparison = compareNutritionRanges(modelNutrition, componentTotals)
  const estimatedNutrition = components.length && componentTotals.calories
    ? componentTotals
    : modelNutrition
  const nutritionMidpoints = nutritionMidpointsFromEstimate(estimatedNutrition)
  // Måltidens total ska vara exakt summan av ingredienserna som visas.
  const mealCheck = checkMealPlausibility(detectedItems)
  const nutrition = components.length && !Array.isArray(payload.detectedItems)
    ? mealCheck.totals
    : { calories: nutritionMidpoints.calories, carbs: nutritionMidpoints.carbs, fat: nutritionMidpoints.fat, protein: nutritionMidpoints.protein }
  const ingredients = normalizeEstimatedIngredients(payload.ingredients?.length ? payload.ingredients : detectedItems)
  const portionEstimate = normalizePortionEstimate(payload.portionEstimate || componentPortion || payload.estimatedServing, {
    confidence: payload.confidence,
    fallbackDescription: payload.estimatedServing,
  })
  const uncertainIngredients = normalizeUncertainIngredients(payload.uncertainIngredients || payload.warnings, {
    ingredients,
  })
  const analysisQuality = normalizeAnalysisQuality(payload.analysisQuality, {
    confidence: payload.confidence,
    limitations: [
      ...(Array.isArray(payload.limitations) ? payload.limitations : []),
      ...(!totalsComparison.isConsistent && components.length ? ['Meal totals räknades om från validerade komponentintervall.'] : []),
      ...buildPlateConsistencyNotes(components),
      ...mealCheck.notes,
    ],
    summary: payload.safeSummary,
  })
  const imageQuality = normalizePhotoAnalysisImageQuality(payload.imageQuality || payload.analysisQuality?.imageQuality, 'usable')
  const errors = []
  if (!detectedItems.length) errors.push('detectedItems')
  if (!estimatedNutrition.calories || !estimatedNutrition.proteinG || !estimatedNutrition.carbsG || !estimatedNutrition.fatG) {
    errors.push('estimatedNutrition')
  }
  const confidence = normalizeConfidence(payload.confidence || 'low')

  return {
    analysis: {
      analysisQuality,
      componentTotals,
      components,
      confidence,
      detectedItems,
      estimatedNutrition,
      estimatedServing: portionEstimate.description,
      imageQuality,
      ingredients,
      limitations: Array.isArray(payload.limitations) ? payload.limitations.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
      modelVersion: 3,
      mealTotals: estimatedNutrition,
      nutrition,
      portionEstimate,
      providerType: 'remote',
      safeSummary: safeText(payload.safeSummary, 'Remote bildanalys gav ett granskningsbart uppskattningsförslag.', 220),
      totalsValidation: totalsComparison,
      uncertainIngredients,
      warnings: Array.isArray(payload.warnings) ? payload.warnings.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
    },
    ok: errors.length === 0,
    errors,
  }
}

async function callOpenAi(image, mealType, { accessToken = '', requestId, usageRepository, userId } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('missing_configuration')
    error.code = 'serverConfiguration'
    throw error
  }

  const imageUrl = `data:${image.contentType};base64,${image.data.toString('base64')}`
  const config = getAiGatewayConfig('photo')
  const result = await callOpenAiJson({
    feature: 'food.scan',
    input: [{
          content: [
            { text: createPrompt(mealType), type: 'input_text' },
            { detail: 'high', image_url: imageUrl, type: 'input_image' },
          ],
          role: 'user',
    }],
    maxOutputTokens: NUTRITION_PHOTO_MAX_OUTPUT_TOKENS,
    model: config.model || DEFAULT_MODEL,
    requestId,
    timeoutMs: REQUEST_TIMEOUT_MS,
    type: 'photo',
    usageRepository,
    userId,
  })

  if (!result.ok) {
    const error = new Error(result.error?.code || 'providerUnavailable')
    error.code = result.error?.code === 'rateLimited' ? 'rateLimit' : result.error?.code
    error.upstreamStatus = result.error?.upstreamStatus
    error.upstreamStatusText = result.error?.upstreamStatusText
    error.upstreamErrorCode = result.error?.upstreamErrorCode
    error.timeout = result.error?.timeout === true
    error.aborted = result.error?.aborted === true
    error.networkError = result.error?.networkError === true
    error.parseError = result.error?.parseError === true
    error.parseErrorCode = result.error?.parseErrorCode
    error.parseErrorName = result.error?.parseErrorName
    error.containsCodeFence = result.error?.containsCodeFence
    error.endsWithBrace = result.error?.endsWithBrace
    error.outputChunkCount = result.error?.outputChunkCount
    error.outputTextLength = result.error?.outputTextLength
    error.outputTextPresent = result.error?.outputTextPresent
    error.providerIncompleteReason = result.error?.providerIncompleteReason
    error.providerResponseStatus = result.error?.providerResponseStatus
    error.startsWithBrace = result.error?.startsWithBrace
    error.startsWithCodeFence = result.error?.startsWithCodeFence
    error.truncatedLikely = result.error?.truncatedLikely
    error.fetchErrorName = result.error?.fetchErrorName
    error.fetchErrorCode = result.error?.fetchErrorCode
    error.fetchErrorMessage = result.error?.fetchErrorMessage
    error.fetchErrorCauseName = result.error?.fetchErrorCauseName
    error.fetchErrorCauseCode = result.error?.fetchErrorCauseCode
    error.fetchErrorCauseMessage = result.error?.fetchErrorCauseMessage
    throw error
  }

  const expanded = await expandCompactPayload(result.value, { accessToken })
  const validated = validateProviderPayload(expanded.payload)
  if (expanded.foodBank) {
    validated.analysis.foodBank = expanded.foodBank
    console.info('[api/nutrition-photo-analysis] Food bank', { requestId, ...expanded.foodBank })
  }
  return validated
}

export default async function handler(request, response) {
  const requestId = `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)
  const clientAttemptId = safeText(getHeader(request, 'x-viktkollen-request-id'), '', 80)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return safeError(response, 405, 'methodNotAllowed', 'Endast POST stöds.', false, requestId)
  }
  const contentType = getHeader(request, 'content-type')
  const origin = getHeader(request, 'origin')
  const trustedProductionHost = getTrustedProductionHost(getHeader(request, 'host'))
  if (!isAllowedOrigin(origin, process.env.VERCEL_URL, trustedProductionHost)) {
    return safeError(response, 403, 'corsBlocked', 'Ursprunget är inte tillåtet.', false, requestId)
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  if (!contentType.includes('multipart/form-data')) {
    return safeError(response, 415, 'invalidContentType', 'Skicka bilden som multipart/form-data.', false, requestId)
  }
  const config = getAiGatewayConfig('photo')
  const rateLimit = checkAiRouteRateLimit({
    limit: config.rateLimitMax,
    route: 'nutritionPhoto',
    userId: auth.user.id,
  })
  // Spärren 12 per 10 min gäller alla utom serververifierat ägarkonto, vars
  // skydd är dygnstaket (100 per rullande 24 h, räknat i databasen). Ägaren
  // prövas bara när spärren slår till, så vanliga användare påverkas inte.
  let ownerExemption = null
  if (rateLimit.limited) {
    ownerExemption = await resolveFoodScanOwnerExemption({ userId: auth.user.id })
  }
  if (rateLimit.limited && !ownerExemption?.exempt) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.RATE_LIMITED,
      requestId,
      retryable: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      status: 429,
    })
  }

  try {
    const parsedRequest = await parseRequest(request)
    if (parsedRequest.error) {
      return safeError(response, parsedRequest.error.status, parsedRequest.error.code, parsedRequest.error.message, false, requestId)
    }
    const image = parsedRequest.parsed.files.image
    const imageError = validateImage(image)
    if (imageError) return safeError(response, imageError.status, imageError.code, imageError.message, false, requestId)
    // Verified before any OpenAI call, in every environment (no NODE_ENV
    // bypass). The token is read from a dedicated header - never a form
    // field, JSON field, URL or query parameter.
    const consentToken = getHeader(request, 'x-viktkollen-consent-token')
    const consent = verifyAnalysisConsentToken({
      env: process.env,
      imageEntries: [{ bytes: image?.data, label: 'image' }],
      purpose: analysisConsentPurposes.nutritionPhotoAnalysis,
      token: consentToken,
      userId: auth.user.id,
    })
    if (!consent.ok) {
      // consent.reason is a generic code, never the token, image hash or
      // image bytes.
      console.warn('[api/nutrition-photo-analysis] Analysis consent rejected', { reason: consent.reason, requestId })
      return safeError(response, 403, 'consentRequired', undefined, false, requestId)
    }
    if (!process.env.OPENAI_API_KEY) {
      return sendSafeAiError(response, {
        code: aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED,
        requestId,
        retryable: false,
        status: 503,
      })
    }

    const runtime = await resolveFoodScanBillingRuntime()
    if (!runtime?.ok) {
      console.warn('[api/nutrition-photo-analysis] Billing unavailable', {
        code: runtime?.code || 'DURABLE_STORE_UNAVAILABLE',
        requestId,
      })
      return sendSafeAiError(response, {
        code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
        requestId,
        retryable: true,
        status: 503,
      })
    }

    // Ägarens administratörskonto: obegränsad månadskvot när servern har verifierat
    // billing_admin och flaggan är aktiverad i miljön. Dygnstak och övriga
    // säkerhetsgränser gäller fortfarande. Inget från klienten påverkar detta.
    ownerExemption = ownerExemption || await resolveFoodScanOwnerExemption({ userId: auth.user.id })
    if (ownerExemption.reason !== 'disabled' && ownerExemption.reason !== 'not_admin') {
      console.info('[api/nutrition-photo-analysis] Owner quota exemption', {
        applied: ownerExemption.exempt,
        dailyCap: ownerExemption.dailyCap ?? null,
        reason: ownerExemption.reason,
        requestId,
        usedLast24h: ownerExemption.usedLast24h ?? null,
      })
    }
    const billingRuntime = ownerExemption.exempt
      ? { ...runtime, quota: withOwnerUnlimitedQuota(runtime.quota) }
      : runtime

    const operationId = createFoodScanOperationId({
      clientAttemptId,
      userId: auth.user.id,
    })
    let photoResult = null
    const { billing } = await executeFoodScanMeteredOperation({
      clientClaim: {},
      instanceKey: requestId,
      log: (entry) => {
        console.info('[api/nutrition-photo-analysis] Billing', {
          decision: entry?.decision,
          dispatch_state: entry?.dispatch_state,
          event: entry?.event,
          feature_id: 'food.scan',
          operation_id: operationId,
          requestId,
        })
      },
      operationId,
      runtime: billingRuntime,
      userId: auth.user.id,
      executeProvider: async ({ markDispatched }) => {
        const claim = await markDispatched()
        if (claim?.result === DISPATCH_CAS_RESULT.ALREADY_DISPATCHED || (claim && claim.claimed === false && claim.result !== DISPATCH_CAS_RESULT.FIRST_DISPATCH)) {
          return { ok: false, providerRequestStarted: false, code: 'alreadyDispatched' }
        }
        const { promise: providerPromise } = runDedupedAiRequest({
          fingerprint: createImageFingerprint(image),
          route: 'nutritionPhoto',
          userId: auth.user.id,
        }, () => callOpenAi(image, parsedRequest.parsed.fields.mealType, {
          accessToken: verifySupabaseUserInternals.getBearerToken(request).token || '',
          requestId: operationId,
          usageRepository: runtime.usageRepository,
          userId: auth.user.id,
        }))
        console.info('[api/nutrition-photo-analysis] Provider request started', {
          clientAttemptId,
          modelName: getAiGatewayConfig('photo').model || DEFAULT_MODEL,
          operationId,
          requestId,
          upstreamRequestStarted: true,
        })
        try {
          const providerResult = await providerPromise
          photoResult = providerResult
          if (!providerResult.ok) {
            return { ok: false, code: 'invalidProviderResponse', providerRequestStarted: true }
          }
          return { ok: true }
        } catch (error) {
          photoResult = { ok: false, error }
          console.warn('[api/nutrition-photo-analysis] Safe failure', {
            aborted: error?.aborted === true,
            clientAttemptId,
            code: mapGatewayErrorCode(
              error?.code === 'timeout' || error?.name === 'AbortError'
                ? 'timeout'
                : error?.code === 'requestAborted'
                  ? 'requestAborted'
                  : error?.code === 'rateLimit'
                    ? 'rateLimited'
                    : 'providerUnavailable',
            ),
            modelName: getAiGatewayConfig('photo').model || DEFAULT_MODEL,
            networkError: error?.networkError === true,
            fetchErrorCauseCode: safeText(error?.fetchErrorCauseCode, '', 80),
            fetchErrorCauseMessage: safeText(error?.fetchErrorCauseMessage, '', 180),
            fetchErrorCauseName: safeText(error?.fetchErrorCauseName, '', 80),
            fetchErrorCode: safeText(error?.fetchErrorCode, '', 80),
            fetchErrorMessage: safeText(error?.fetchErrorMessage, '', 180),
            fetchErrorName: safeText(error?.fetchErrorName, '', 80),
            parseError: error?.parseError === true,
            parseErrorCode: safeText(error?.parseErrorCode, '', 80),
            parseErrorName: safeText(error?.parseErrorName, '', 80),
            containsCodeFence: error?.containsCodeFence === true,
            endsWithBrace: error?.endsWithBrace === true,
            outputChunkCount: Number.isFinite(Number(error?.outputChunkCount)) ? Number(error.outputChunkCount) : '',
            outputTextLength: Number.isFinite(Number(error?.outputTextLength)) ? Number(error.outputTextLength) : '',
            outputTextPresent: error?.outputTextPresent === true,
            providerIncompleteReason: safeText(error?.providerIncompleteReason, '', 80),
            providerResponseStatus: safeText(error?.providerResponseStatus, '', 80),
            startsWithBrace: error?.startsWithBrace === true,
            startsWithCodeFence: error?.startsWithCodeFence === true,
            truncatedLikely: error?.truncatedLikely === true,
            operationId,
            requestCompleted: false,
            requestId,
            source: 'remote',
            timeout: error?.timeout === true || error?.name === 'AbortError',
            upstreamErrorCode: safeText(error?.upstreamErrorCode, '', 80),
            upstreamRequestStarted: true,
            upstreamStatus: Number.isFinite(Number(error?.upstreamStatus)) ? Number(error.upstreamStatus) : '',
            upstreamStatusText: safeText(error?.upstreamStatusText, '', 80),
          })
          throw error
        }
      },
    })

    const mapped = mapFoodScanBillingHttp(billing, {
      analysisOk: photoResult?.ok === true && Boolean(photoResult?.analysis),
      providerAttempted: photoResult !== null,
      timeout: photoResult?.error?.timeout === true || photoResult?.error?.name === 'AbortError',
    })
    if (mapped.kind === 'success') {
      console.info('[api/nutrition-photo-analysis] Analysis completed', {
        clientAttemptId,
        itemCount: photoResult.analysis.detectedItems.length,
        operationId,
        requestCompleted: true,
        requestId,
        source: 'remote',
      })
      return response.status(200).json({
        analysis: photoResult.analysis,
        ok: true,
        requestId,
        source: 'remote',
      })
    }
    return sendSafeAiError(response, {
      code: mapped.code,
      requestId,
      retryable: mapped.retryable,
      status: mapped.status,
    })
  } catch (error) {
    const rawCode = error?.code === 'serverConfiguration'
      ? 'aiNotConfigured'
      : error?.code === 'timeout' || error?.name === 'AbortError'
        ? 'timeout'
        : error?.code === 'requestAborted'
          ? 'requestAborted'
          : error?.code === 'rateLimit'
            ? 'rateLimited'
            : 'providerUnavailable'
    const code = mapGatewayErrorCode(rawCode)
    const status = code === aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED ? 503
      : code === aiRouteErrorCodes.PROVIDER_TIMEOUT ? 504
        : code === aiRouteErrorCodes.REQUEST_ABORTED ? 499
        : code === aiRouteErrorCodes.RATE_LIMITED ? 429
          : 502
    console.warn('[api/nutrition-photo-analysis] Safe failure', {
      aborted: error?.aborted === true,
      clientAttemptId,
      code,
      modelName: getAiGatewayConfig('photo').model || DEFAULT_MODEL,
      networkError: error?.networkError === true,
      fetchErrorCauseCode: safeText(error?.fetchErrorCauseCode, '', 80),
      fetchErrorCauseMessage: safeText(error?.fetchErrorCauseMessage, '', 180),
      fetchErrorCauseName: safeText(error?.fetchErrorCauseName, '', 80),
      fetchErrorCode: safeText(error?.fetchErrorCode, '', 80),
      fetchErrorMessage: safeText(error?.fetchErrorMessage, '', 180),
      fetchErrorName: safeText(error?.fetchErrorName, '', 80),
      parseError: error?.parseError === true,
      parseErrorCode: safeText(error?.parseErrorCode, '', 80),
      parseErrorName: safeText(error?.parseErrorName, '', 80),
      containsCodeFence: error?.containsCodeFence === true,
      endsWithBrace: error?.endsWithBrace === true,
      outputChunkCount: Number.isFinite(Number(error?.outputChunkCount)) ? Number(error.outputChunkCount) : '',
      outputTextLength: Number.isFinite(Number(error?.outputTextLength)) ? Number(error.outputTextLength) : '',
      outputTextPresent: error?.outputTextPresent === true,
      providerIncompleteReason: safeText(error?.providerIncompleteReason, '', 80),
      providerResponseStatus: safeText(error?.providerResponseStatus, '', 80),
      startsWithBrace: error?.startsWithBrace === true,
      startsWithCodeFence: error?.startsWithCodeFence === true,
      truncatedLikely: error?.truncatedLikely === true,
      requestCompleted: false,
      requestId,
      source: 'remote',
      timeout: error?.timeout === true || code === aiRouteErrorCodes.PROVIDER_TIMEOUT,
      upstreamErrorCode: safeText(error?.upstreamErrorCode, '', 80),
      upstreamRequestStarted: code !== aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED,
      upstreamStatus: Number.isFinite(Number(error?.upstreamStatus)) ? Number(error.upstreamStatus) : '',
      upstreamStatusText: safeText(error?.upstreamStatusText, '', 80),
    })
    return sendSafeAiError(response, {
      code,
      requestId,
      retryable: code !== aiRouteErrorCodes.PROVIDER_NOT_CONFIGURED,
      status,
    })
  }
}

export const nutritionPhotoRouteInternals = {
  componentsFromCompactItems,
  createPrompt,
  expandCompactPayload,
  isAllowedOrigin,
  parseMultipart,
  validateProviderPayload,
  validateImage,
}
