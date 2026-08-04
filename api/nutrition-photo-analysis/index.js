const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-4.1-mini'
const MAX_IMAGE_SIZE_BYTES = Number(process.env.NUTRITION_PHOTO_MAX_FILE_BYTES || 8 * 1024 * 1024)
const REQUEST_TIMEOUT_MS = Number(process.env.NUTRITION_PHOTO_TIMEOUT_MS || 15000)
const RATE_LIMIT_WINDOW_MS = Number(process.env.NUTRITION_PHOTO_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000)
const RATE_LIMIT_MAX = Number(process.env.NUTRITION_PHOTO_RATE_LIMIT_MAX || 12)
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const rateLimitBuckets = new Map()

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

function safeError(response, status, code, message, retryable = false) {
  return response.status(status).json({
    error: {
      code,
      message,
      retryable,
    },
    ok: false,
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

function getClientKey(request) {
  return safeText(
    getHeader(request, 'x-viktkollen-client-id') ||
    getHeader(request, 'x-forwarded-for').split(',')[0] ||
    request.socket?.remoteAddress ||
    'anonymous',
    'anonymous',
    120,
  )
}

function checkRateLimit(request) {
  const key = getClientKey(request)
  const now = Date.now()
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
  if (bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { limited: false, remaining: RATE_LIMIT_MAX - 1 }
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  rateLimitBuckets.set(key, bucket)
  return { limited: false, remaining: RATE_LIMIT_MAX - bucket.count }
}

function createPrompt(mealType) {
  return [
    'Du analyserar en matbild för Viktkollen.',
    'Returnera endast JSON enligt schemat: detectedItems, estimatedServing, estimatedNutrition, confidence, limitations, warnings, safeSummary.',
    'Identifiera bara synliga livsmedel och uppskatta portioner försiktigt.',
    'Kommentera dolda osäkerheter som olja, sås, dryck och tillagning.',
    'Ge ingen medicinsk rådgivning, ingen diagnos, ingen bedömning av kropp, vikt eller om maten är bra/dålig.',
    'Ange låg confidence när ingredienser eller portion är osäkra.',
    `Måltidstyp om användaren valt den: ${safeText(mealType, 'okänd', 40)}.`,
  ].join(' ')
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string') return data.output_text.trim()
  return data.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text)
    ?.filter(Boolean)
    ?.join('\n')
    ?.trim() || ''
}

function parseJsonText(text) {
  return JSON.parse(String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim())
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
    estimatedAmount: safeNumber(item.estimatedAmount ?? item.amount, null, 10000),
    fat: safeNumber(item.fat, null, 1000),
    name: safeText(item.name || `Ingrediens ${index + 1}`, `Ingrediens ${index + 1}`, 80),
    protein: safeNumber(item.protein, null, 1000),
    unit: safeText(item.unit, 'g', 24),
  }
}

function validateProviderPayload(payload = {}) {
  const detectedItems = Array.isArray(payload.detectedItems)
    ? payload.detectedItems.slice(0, 12).map(normalizeItem)
    : []
  const estimatedNutrition = {
    calories: safeNumber(payload.estimatedNutrition?.calories, null, 10000),
    carbs: safeNumber(payload.estimatedNutrition?.carbs ?? payload.estimatedNutrition?.carbohydrates, null, 2000),
    fat: safeNumber(payload.estimatedNutrition?.fat, null, 1000),
    protein: safeNumber(payload.estimatedNutrition?.protein, null, 1000),
  }
  const errors = []
  if (!detectedItems.length) errors.push('detectedItems')
  if (Object.values(estimatedNutrition).some((value) => value === null)) errors.push('estimatedNutrition')
  const confidence = normalizeConfidence(payload.confidence || 'low')

  return {
    analysis: {
      confidence,
      detectedItems,
      estimatedNutrition,
      estimatedServing: safeText(payload.estimatedServing, 'Okänd portion', 80),
      limitations: Array.isArray(payload.limitations) ? payload.limitations.map((item) => safeText(item, '', 160)).filter(Boolean).slice(0, 6) : [],
      modelVersion: 3,
      providerType: 'remote',
      safeSummary: safeText(payload.safeSummary, 'Remote bildanalys gav ett granskningsbart uppskattningsförslag.', 220),
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const imageUrl = `data:${image.contentType};base64,${image.data.toString('base64')}`
    const openaiResponse = await fetch(OPENAI_API_URL, {
      body: JSON.stringify({
        input: [{
          content: [
            { text: createPrompt(mealType), type: 'input_text' },
            { image_url: imageUrl, type: 'input_image' },
          ],
          role: 'user',
        }],
        max_output_tokens: 900,
        model: process.env.NUTRITION_PHOTO_MODEL || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL,
      }),
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    })
    if (!openaiResponse.ok) {
      const error = new Error(`provider_${openaiResponse.status}`)
      error.code = openaiResponse.status === 429 ? 'rateLimit' : 'providerUnavailable'
      throw error
    }
    const data = await openaiResponse.json()
    return validateProviderPayload(parseJsonText(extractResponseText(data)))
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return safeError(response, 405, 'methodNotAllowed', 'Endast POST stöds.')
  }
  const contentType = getHeader(request, 'content-type')
  const origin = getHeader(request, 'origin')
  if (origin && process.env.VERCEL_URL && !origin.includes(process.env.VERCEL_URL)) {
    return safeError(response, 403, 'corsBlocked', 'Ursprunget är inte tillåtet.')
  }
  if (!contentType.includes('multipart/form-data')) {
    return safeError(response, 415, 'invalidContentType', 'Skicka bilden som multipart/form-data.')
  }
  const rateLimit = checkRateLimit(request)
  if (rateLimit.limited) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return safeError(response, 429, 'rateLimit', 'För många analyser just nu. Försök igen senare.', true)
  }

  try {
    const parsedRequest = await parseRequest(request)
    if (parsedRequest.error) {
      return safeError(response, parsedRequest.error.status, parsedRequest.error.code, parsedRequest.error.message)
    }
    const image = parsedRequest.parsed.files.image
    const imageError = validateImage(image)
    if (imageError) return safeError(response, imageError.status, imageError.code, imageError.message)
    const providerResult = await callOpenAi(image, parsedRequest.parsed.fields.mealType)
    if (!providerResult.ok) {
      return safeError(response, 502, 'invalidProviderResponse', 'AI-svaret kunde inte valideras.', true)
    }
    console.info('[api/nutrition-photo-analysis] Analysis completed', {
      itemCount: providerResult.analysis.detectedItems.length,
      source: 'remote',
    })
    return response.status(200).json({
      analysis: providerResult.analysis,
      ok: true,
      source: 'remote',
    })
  } catch (error) {
    const code = error?.code === 'serverConfiguration'
      ? 'serverConfiguration'
      : error?.name === 'AbortError'
        ? 'timeout'
        : error?.code === 'rateLimit'
          ? 'rateLimit'
          : 'providerUnavailable'
    const status = code === 'serverConfiguration' ? 503 : code === 'timeout' ? 504 : code === 'rateLimit' ? 429 : 502
    console.warn('[api/nutrition-photo-analysis] Safe failure', {
      code,
      source: 'remote',
    })
    return safeError(response, status, code, code === 'serverConfiguration'
      ? 'Bildanalys är inte konfigurerad på servern.'
      : code === 'timeout'
        ? 'Bildanalysen tog för lång tid.'
        : 'Bildanalysen är tillfälligt otillgänglig.', code !== 'serverConfiguration')
  }
}

export const nutritionPhotoRouteInternals = {
  parseMultipart,
  validateProviderPayload,
  validateImage,
}
