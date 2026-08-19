import { analyzeBodyImages } from '../../src/services/bodyAnalysisAi.js'
import {
  buildBodyAnalysisContext,
  normalizeBodyAnalysisResultModel,
  normalizeScanInput,
} from '../../src/services/bodyAnalysisEstimates.js'
import { createBodyAnalysisPrompt } from '../../src/services/bodyAnalysisPrompt.js'
import { checkAiRouteRateLimit } from '../_shared/aiRateLimiter.js'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png']
const resultKeys = [
  'status',
  'source',
  'generatedAt',
  'summary',
  'bodyComposition',
  'posture',
  'strengths',
  'improvementAreas',
  'recommendations',
  'nextSteps',
  'comparison',
  'progressSummary',
  'visualConsistency',
  'routineFeedback',
  'monthlyFocus',
  'confidenceLevel',
  'limitations',
  'sourceReason',
  'confidence',
  'safetyNote',
  'schemaVersion',
  'scanInput',
  'measuredWeight',
  'estimatedWeight',
  'estimatedMeasurements',
  'bodyFatEstimate',
  'dataQuality',
]

export const config = {
  api: {
    bodyParser: false,
  },
}

function getRequestHeader(request, name) {
  const headers = request.headers ?? {}

  return headers[name] || headers[name.toLowerCase()] || ''
}

function getMultipartBoundary(contentType) {
  return contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('boundary='))
    ?.replace('boundary=', '')
}

function safeText(value, fallback = '', max = 120) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

async function readRequestBody(request) {
  if (request.body) {
    return Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(String(request.body), 'latin1')
  }

  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

function parsePreviousAnalysis(value) {
  if (!value) {
    return null
  }

  try {
    const parsedValue = JSON.parse(value)

    return parsedValue && typeof parsedValue === 'object' ? parsedValue : null
  } catch {
    return null
  }
}

function parseJsonField(value) {
  if (!value) {
    return null
  }

  try {
    const parsedValue = JSON.parse(value)

    return parsedValue && typeof parsedValue === 'object' ? parsedValue : null
  } catch {
    return null
  }
}

function parseMultipartImages(rawBodyBuffer, boundary) {
  const rawBody = rawBodyBuffer.toString('latin1')
  const fields = {}
  const images = {}

  rawBody.split(`--${boundary}`).forEach((part) => {
    if (!part.includes('Content-Disposition')) {
      return
    }

    const [rawHeaders, ...contentParts] = part.split('\r\n\r\n')
    const content = contentParts
      .join('\r\n\r\n')
      .replace(/\r\n--$/, '')
      .replace(/\r\n$/, '')
    const fieldName = rawHeaders.match(/name="([^"]+)"/)?.[1]
    const fileName = rawHeaders.match(/filename="([^"]*)"/)?.[1]
    const contentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]

    if (!fieldName) {
      return
    }

    if (!fileName) {
      fields[fieldName] = content.trim()
      return
    }

    const data = Buffer.from(content, 'latin1')

    images[fieldName] = {
      contentType: contentType?.toLowerCase() || '',
      data,
      dataUrl: `data:${contentType};base64,${data.toString('base64')}`,
      name: safeText(fileName, 'body-scan-image', 80),
      size: Buffer.byteLength(content, 'latin1'),
    }
  })

  return {
    fields,
    images,
  }
}

async function parseImages(request) {
  const contentType = getRequestHeader(request, 'content-type')
  const boundary = getMultipartBoundary(contentType)

  if (!contentType.includes('multipart/form-data') || !boundary) {
    return {
      backImage: null,
      context: null,
      frontImage: null,
      previousAnalysis: null,
      scanInput: normalizeScanInput(),
      sideImage: null,
    }
  }

  const rawBodyBuffer = await readRequestBody(request)
  const parsed = parseMultipartImages(rawBodyBuffer, boundary)

  return {
    backImage: parsed.images.backImage ?? null,
    context: parseJsonField(parsed.fields.context),
    frontImage: parsed.images.frontImage ?? null,
    previousAnalysis: parsePreviousAnalysis(parsed.fields.previousAnalysis),
    scanInput: normalizeScanInput(parseJsonField(parsed.fields.scanInput)),
    sideImage: parsed.images.sideImage ?? null,
  }
}

function validateImage(image, label) {
  if (!image) {
    return `${label} saknas. Ladda upp bilder framifrån, från sidan och bakifrån.`
  }

  if (!allowedImageTypes.includes(image.contentType)) {
    return `${label} måste vara en JPEG-, JPG- eller PNG-fil.`
  }

  if (image.size > MAX_IMAGE_SIZE_BYTES) {
    return `${label} är för stor. Maxstorlek är 10 MB.`
  }

  const header = image.data?.subarray?.(0, 12)
  const isJpeg = ['image/jpeg', 'image/jpg'].includes(image.contentType) && header?.[0] === 0xff && header?.[1] === 0xd8
  const isPng = image.contentType === 'image/png' && header?.subarray?.(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

  if (!isJpeg && !isPng) {
    return `${label} har ett filformat som inte kunde verifieras.`
  }

  return ''
}

function validateRequest(request, images) {
  if (request.method !== 'POST') {
    return {
      error: 'Only POST requests are allowed for body analysis.',
      status: 405,
    }
  }

  const frontImageError = validateImage(images.frontImage, 'Bild framifrån')

  if (frontImageError) {
    return {
      error: frontImageError,
      status: 400,
    }
  }

  const sideImageError = validateImage(images.sideImage, 'Bild från sidan')

  if (sideImageError) {
    return {
      error: sideImageError,
      status: 400,
    }
  }

  const backImageError = validateImage(images.backImage, 'Bild bakifrån')

  if (backImageError) {
    return {
      error: backImageError,
      status: 400,
    }
  }

  return null
}

function createMockAnalysis(previousAnalysis = null, sourceReason = 'api_error', context = buildBodyAnalysisContext(), scanInput = normalizeScanInput()) {

  return {
    bodyComposition:
      'Visuell kroppssammansättning ser stabil ut. Bedömningen är försiktig och följer inte exakta medicinska värden.',
    comparison: previousAnalysis
      ? {
          better:
            'Bilderna ger en ny jämförelsepunkt, men mockläget gör inga säkra visuella förändringspåståenden.',
          nextFocus:
            'Fortsätt med samma ljus, vinkel och avstånd till nästa analys.',
          unchanged: 'Hållning och fotokonsekvens följs vidare över tid.',
        }
      : {
          better: 'Det här är din första analys.',
          nextFocus:
            'Skapa en ny analys om ungefär en vecka för att kunna jämföra.',
          unchanged: 'Ingen tidigare analys finns att jämföra med ännu.',
        },
    confidence: 'Medel',
    confidenceLevel: 'Medel',
    dataQuality: 'low',
    estimatedMeasurements: {
      chestCm: null,
      hipCm: null,
      shoulderWidthCm: null,
      waistCm: null,
    },
    estimatedWeight: null,
    bodyFatEstimate: null,
    generatedAt: new Date().toISOString(),
    improvementAreas: [
      'Fortsätt ta bilder med samma ljus och avstånd.',
      'Försök fotografera vid ungefär samma tid på dagen.',
    ],
    limitations: [
      'Mockresultatet bygger inte på riktig bildtolkning.',
      'Resultatet ska inte användas som medicinsk bedömning.',
    ],
    monthlyFocus:
      'Fokusera på konsekventa bilder och hållbara rutiner under månaden.',
    nextSteps: [
      'Ta nästa analys om ungefär 7 dagar.',
      'Registrera gärna vikten samma dag som du tar bilderna.',
    ],
    posture: 'Hållningen ser stabil ut i mock-bedömningen.',
    progressSummary:
      'Utvecklingen följs bäst genom flera analyser tagna under liknande förhållanden.',
    recommendations: [
      'Behåll samma fotograferingsvinkel.',
      'Fokusera på jämna veckovisa förändringar.',
      'Fortsätt med hållbara kost- och träningsvanor.',
    ],
    routineFeedback:
      'Din rutin blir mer användbar om bilderna tas regelbundet och på samma sätt.',
    safetyNote:
      'Bildanalysen är en AI-uppskattning och ersätter inte våg, måttband eller medicinsk bedömning.',
    measuredWeight: context.latestMeasuredWeight || null,
    scanInput,
    schemaVersion: 2,
    source: 'mock',
    sourceReason,
    status: 'completed',
    strengths: [
      'Du har laddat upp bilder från tre vinklar.',
      'Det ger en bättre grund för jämförelser över tid.',
    ],
    summary:
      'Analysen är klar. Resultatet är en försiktig visuell uppskattning som främst ska användas för att följa utveckling över tid.',
    visualConsistency:
      'Försök hålla ljus, avstånd, vinkel och kläder så lika som möjligt.',
  }
}

function formatBodyAnalysisResult(analysis) {
  const normalizedModel = normalizeBodyAnalysisResultModel(analysis, {
    scanInput: analysis.scanInput,
  })
  const safeAnalysis = {
    ...analysis,
    ...normalizedModel,
  }

  return resultKeys.reduce((result, key) => {
    if (safeAnalysis[key] !== undefined && safeAnalysis[key] !== null) {
      result[key] = safeAnalysis[key]
    }

    return result
  }, {})
}

function getFallbackReason(error) {
  if (error instanceof Error) {
    if (error.message.includes('OPENAI_API_KEY')) {
      return 'missing_api_key'
    }

    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return 'timeout'
    }

    if (error instanceof SyntaxError || error.message.includes('JSON')) {
      return 'invalid_json'
    }
  }

  return 'api_error'
}

async function runBodyAnalysis(images) {
  const context = images.context || buildBodyAnalysisContext()
  const scanInput = normalizeScanInput(images.scanInput)
  const prompt = createBodyAnalysisPrompt(images.previousAnalysis, {
    ...context,
    scanInput,
  })
  const startedAt = Date.now()

  try {
    const analysis = await analyzeBodyImages(
      images.frontImage,
      images.sideImage,
      images.backImage,
      prompt,
      images.previousAnalysis,
    )
    const result = {
      ...analysis,
      measuredWeight: context.latestMeasuredWeight || null,
      scanInput,
      source: 'ai',
      sourceReason: analysis.sourceReason || 'ai_success',
    }

    console.info('[api/body-analysis] Analysis completed', {
      durationMs: Date.now() - startedAt,
      source: result.source,
      sourceReason: result.sourceReason,
    })

    return result
  } catch (error) {
    const sourceReason = getFallbackReason(error)

    console.warn('[api/body-analysis] AI analysis failed, using mock', {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      source: 'mock',
      sourceReason,
    })

    return createMockAnalysis(images.previousAnalysis, sourceReason, context, scanInput)
  }
}

export default async function handler(request, response) {
  const requestId = `body-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let images
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
      status: 405,
    })
  }

  const contentType = getRequestHeader(request, 'content-type')
  if (!contentType.includes('multipart/form-data')) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Skicka bilderna som multipart/form-data.',
      status: 415,
    })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }
  const rateLimit = checkAiRouteRateLimit({
    limit: process.env.BODY_ANALYSIS_RATE_LIMIT_MAX,
    route: 'bodyAnalysis',
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
    images = await parseImages(request)
  } catch {
    return response.status(400).json({
      error: {
        code: aiRouteErrorCodes.INVALID_REQUEST,
        requestId,
        retryable: false,
        safeMessage: 'Kunde inte läsa bilderna.',
      },
      ok: false,
    })
  }

  const validationError = validateRequest(request, images)

  if (validationError) {
    if (validationError.status === 405) {
      response.setHeader('Allow', 'POST')
    }

    return response.status(validationError.status).json({
      error: {
        code: aiRouteErrorCodes.INVALID_REQUEST,
        requestId,
        retryable: false,
        safeMessage: validationError.error,
      },
      ok: false,
    })
  }

  try {
    const analysis = await runBodyAnalysis(images)
    const result = formatBodyAnalysisResult(analysis)

    console.info('[api/body-analysis] Response sent', {
      source: result.source,
      sourceReason: result.sourceReason,
    })

    return response.status(200).json(result)
  } catch (error) {
    console.error('[api/body-analysis] Unexpected route error', {
      error: error instanceof Error ? error.message : String(error),
      source: 'error',
    })

    return response.status(500).json({
      error: {
        code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
        requestId,
        retryable: true,
        safeMessage: 'AI-kroppsanalys är tillfälligt otillgänglig.',
      },
      ok: false,
    })
  }
}

export const bodyAnalysisRouteInternals = {
  createMockAnalysis,
  formatBodyAnalysisResult,
  parseMultipartImages,
  parseJsonField,
  validateImage,
}
