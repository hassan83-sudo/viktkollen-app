import { analyzeBodyImages } from '../../src/services/bodyAnalysisAi.js'
import { createBodyAnalysisPrompt } from '../../src/services/bodyAnalysisPrompt.js'

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

    images[fieldName] = {
      contentType: contentType?.toLowerCase() || '',
      dataUrl: `data:${contentType};base64,${Buffer.from(
        content,
        'latin1',
      ).toString('base64')}`,
      name: fileName,
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
      frontImage: null,
      previousAnalysis: null,
      sideImage: null,
    }
  }

  const rawBodyBuffer = await readRequestBody(request)
  const parsed = parseMultipartImages(rawBodyBuffer, boundary)

  return {
    frontImage: parsed.images.frontImage ?? null,
    previousAnalysis: parsePreviousAnalysis(parsed.fields.previousAnalysis),
    sideImage: parsed.images.sideImage ?? null,
  }
}

function validateImage(image, label) {
  if (!image) {
    return `${label} saknas. Ladda upp både bild framifrån och från sidan.`
  }

  if (!allowedImageTypes.includes(image.contentType)) {
    return `${label} måste vara en JPEG-, JPG- eller PNG-fil.`
  }

  if (image.size > MAX_IMAGE_SIZE_BYTES) {
    return `${label} är för stor. Maxstorlek är 10 MB.`
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

  return null
}

function createMockAnalysis(previousAnalysis = null, sourceReason = 'api_error') {
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
      'Detta är en visuell uppskattning och inte medicinsk rådgivning, diagnos eller behandling.',
    source: 'mock',
    sourceReason,
    status: 'completed',
    strengths: [
      'Du har laddat upp bilder från två vinklar.',
      'Det ger en bättre grund för jämförelser över tid.',
    ],
    summary:
      'Analysen är klar. Resultatet är en försiktig visuell uppskattning som främst ska användas för att följa utveckling över tid.',
    visualConsistency:
      'Försök hålla ljus, avstånd, vinkel och kläder så lika som möjligt.',
  }
}

function formatBodyAnalysisResult(analysis) {
  return resultKeys.reduce((result, key) => {
    if (analysis[key] !== undefined && analysis[key] !== null) {
      result[key] = analysis[key]
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
  const prompt = createBodyAnalysisPrompt(images.previousAnalysis)
  const startedAt = Date.now()

  try {
    const analysis = await analyzeBodyImages(
      images.frontImage,
      images.sideImage,
      prompt,
      images.previousAnalysis,
    )
    const result = {
      ...analysis,
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

    return createMockAnalysis(images.previousAnalysis, sourceReason)
  }
}

export default async function handler(request, response) {
  let images

  try {
    images = await parseImages(request)
  } catch {
    return response.status(400).json({
      error: 'Kunde inte läsa bilderna.',
    })
  }

  const validationError = validateRequest(request, images)

  if (validationError) {
    if (validationError.status === 405) {
      response.setHeader('Allow', 'POST')
    }

    return response.status(validationError.status).json({
      error: validationError.error,
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
      error: 'Internal server error.',
    })
  }
}
