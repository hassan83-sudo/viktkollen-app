import {
  callOpenAiJson,
  getAiGatewayConfig,
} from '../_shared/openaiGateway.js'
import { aiRouteErrorCodes, mapGatewayErrorCode, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { createImageFingerprint, runDedupedAiRequest } from '../_shared/aiRequestDeduper.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, verifyAnalysisConsentToken } from '../_shared/analysisConsent.js'
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
const MAX_IMAGE_SIZE_BYTES = Number(process.env.NUTRITION_PHOTO_MAX_FILE_BYTES || 8 * 1024 * 1024)
const REQUEST_TIMEOUT_MS = Number(process.env.NUTRITION_PHOTO_TIMEOUT_MS || NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS)
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export const config = {
  api: {
    bodyParser: false,
  },
}

function getHeader(request, name) {
  const headers = request.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
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

function createPrompt(mealType) {
  return [
    'Du analyserar en matbild för Viktkollen.',
    'Arbeta component-first: inventera synliga separata måltidskomponenter före total näring.',
    'Pass 1 visuell inventering: lista varje visuellt distinkt del för sig (protein/kött/fisk, ris, potatis, pommes, grönsaker, bröd, synlig sås/dipp/dressing, garnish/citron, räkningsbara bitar). Slå inte ihop visuellt separata livsmedel bara för att de är relaterade. Inferera inte dolda ingredienser som synliga fakta.',
    'Returnera endast strikt JSON: components, mealTotals, portionEstimate, ingredients, uncertainIngredients, imageQuality, analysisQuality, confidence, limitations, warnings, safeSummary.',
    'components är en array med objekt: id, name, category, confidence, identityConfidence, visualEvidence, portionEstimate, nutritionEstimate, uncertainty, alternatives, cookingMethods.',
    'Inventera protein, kolhydrat/stärkelse, grönsaker, sås/dressing/dipp, synligt fett/olja, bröd/panering, dryck, garnish/tillbehör och unknown. category ska vara protein, carbohydrate, vegetables, sauce, fat eller unknown.',
    'identityConfidence är säkerhet i vad maten är. portionEstimate.confidence är säkerhet i mängden. De får skilja sig: high identityConfidence och medium/low portionConfidence är normalt när typen syns men skalan är osäker. confidence ska spegla identityConfidence.',
    'visualEvidence ska vara kort och maskinläsbar, inte intern chain-of-thought.',
    'portionEstimate per komponent: description, gramsMin, gramsMax, confidence, pieceCount, pieceCountConfidence, relativePlateShare, evidence. pieceCount är heltal eller null. relativePlateShare är ungefärlig andel av synlig tallriksyta 0-100 eller null. evidence är en kort visuell anledning till gramintervallet (yta, volym, höjd, antal, jämförelse mot grannar).',
    'Uppskatta gram med relativ tallriksyta, footprint, synlig höjd/volym, om maten ligger platt eller i hög, livsmedelsdensitet, styckantal när det är räkningsbart och jämförelse mot grannkomponenter. Hitta inte på exakt tallriksdiameter om skala saknas. Vid svag skala: bredda gramsMin/gramsMax i stället för att låtsas precision. använd null för gram om portionen inte kan bedömas.',
    'När maten är räkningsbar (nuggets, köttbullar, ägg, brödskivor, sushibitar, kycklingbitar, dumplings) ange pieceCount bara för synliga bitar och pieceCountConfidence. Gissa inte dolda bitar. Använd antal plus typisk bitstorlek för gramintervallet. Bilden skickas med hög visuell detail; använd den för portion, såsglans och panering.',
    'nutritionEstimate per komponent: calories, proteinG, carbsG, fatG, fiberG som {min,max,midpoint,confidence}, eller null om underlaget inte räcker. nutritionEstimate är endast reserv; gram och identitet är primära.',
    'Gör en intern second visual pass innan JSON slutförs: kontrollera missad sås/dipp/dressing, glans eller olja/fett, panering/fritering, topping/garnish, delvis dold komponent, dubbelräkning och om gram är rimliga relativt varandra.',
    'mealTotals ska härledas från komponentintervallen; gissa inte måltidstotal först och låt inte mealTotals avvika kraftigt från komponenterna.',
    'Synlig separat sås/dressing/dipp ska alltid vara egen komponent. Vid osäker typ: använd neutral etikett som Krämig sås och lägg möjliga typer i alternatives.',
    'Hög confidence på att sås finns kan kombineras med medium/low confidence eller uncertainty för exakt typ/mängd. Låt nutritionintervallet spegla möjliga såstyper.',
    'För fried, breaded, battered eller oil-coated komponenter ska nutritionintervallet ta hänsyn till tillagningsfett/panering när bilden stöder det.',
    'Undvik dubbelräkning: ingen separat oljekomponent om fettet redan ingår i friterad/panerad komponent, om inte separat synligt fett/olja finns eller anges som osäker möjlig bidragare.',
    'Ange cookingMethods bara när bilden ger stöd, t.ex. fried, breaded, grilled, boiled, baked eller raw. Håll pommes skild från kokt/ugnsbakad potatis och friterad kyckling skild från grillad/kokt kyckling.',
    'Om synlig mat inte kan identifieras säkert, behåll den som Okänd komponent med low confidence och högst tre relevanta alternatives.',
    'Hallucinera inte dolda ingredienser som fakta. Om något kan bidra men inte syns säkert ska det markeras som uncertainty eller possible hidden contributor, inte som säker komponent.',
    'imageQuality ska vara good, usable eller poor baserat på ljus, blur, occlusion, vinkel, plate coverage och om bilden verkar vara fotograferad från skärm.',
    'Behåll legacy-fält ingredients/detectedItems om möjligt för kompatibilitet, men components är primärt schema.',
    'Var specifik där visuell evidens är stark. Var försiktig där bilden inte ger stöd. Returnera null när något inte kan avgöras.',
    'Ge ingen medicinsk rådgivning, ingen diagnos, ingen bedömning av kropp, vikt eller om maten är bra/dålig.',
    `Måltidstyp om användaren valt den: ${safeText(mealType, 'okänd', 40)}.`,
  ].join(' ')
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

function normalizeItem(item = {}, index = 0) {
  return {
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
        protein: nutrition.protein,
        unit: 'g',
      }, index)
    })
  const modelNutrition = normalizeEstimatedNutrition(payload.mealTotals || payload.estimatedNutrition || payload, { confidence: payload.confidence })
  const totalsComparison = compareNutritionRanges(modelNutrition, componentTotals)
  const estimatedNutrition = components.length && componentTotals.calories
    ? componentTotals
    : modelNutrition
  const nutritionMidpoints = nutritionMidpointsFromEstimate(estimatedNutrition)
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
      nutrition: {
        calories: nutritionMidpoints.calories,
        carbs: nutritionMidpoints.carbs,
        fat: nutritionMidpoints.fat,
        protein: nutritionMidpoints.protein,
      },
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

async function callOpenAi(image, mealType) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('missing_configuration')
    error.code = 'serverConfiguration'
    throw error
  }

  const imageUrl = `data:${image.contentType};base64,${image.data.toString('base64')}`
  const config = getAiGatewayConfig('photo')
  const result = await callOpenAiJson({
    input: [{
          content: [
            { text: createPrompt(mealType), type: 'input_text' },
            { detail: 'high', image_url: imageUrl, type: 'input_image' },
          ],
          role: 'user',
    }],
    maxOutputTokens: 3400,
    model: config.model || DEFAULT_MODEL,
    timeoutMs: REQUEST_TIMEOUT_MS,
    type: 'photo',
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

  return validateProviderPayload(result.value)
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
  if (origin && process.env.VERCEL_URL && !origin.includes(process.env.VERCEL_URL)) {
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
  if (rateLimit.limited) {
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
    const { promise: providerPromise } = runDedupedAiRequest({
      fingerprint: createImageFingerprint(image),
      route: 'nutritionPhoto',
      userId: auth.user.id,
    }, () => callOpenAi(image, parsedRequest.parsed.fields.mealType))
    console.info('[api/nutrition-photo-analysis] Provider request started', {
      clientAttemptId,
      modelName: getAiGatewayConfig('photo').model || DEFAULT_MODEL,
      requestId,
      upstreamRequestStarted: true,
    })
    const providerResult = await providerPromise
    if (!providerResult.ok) {
      return safeError(response, 502, 'invalidProviderResponse', 'AI-svaret kunde inte valideras.', true, requestId)
    }
    console.info('[api/nutrition-photo-analysis] Analysis completed', {
      clientAttemptId,
      itemCount: providerResult.analysis.detectedItems.length,
      requestCompleted: true,
      requestId,
      source: 'remote',
    })
    return response.status(200).json({
      analysis: providerResult.analysis,
      ok: true,
      requestId,
      source: 'remote',
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
  createPrompt,
  parseMultipart,
  validateProviderPayload,
  validateImage,
}
