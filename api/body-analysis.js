const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png']

export const config = {
  api: {
    bodyParser: false,
  },
}

const mockBodyAnalysisResult = {
  bodyFat: '~24 %',
  muscleMass: 'Normal',
  posture: 'Bra',
  recommendations: [
    'Ta nästa bild om 7 dagar.',
    'Använd samma ljus och avstånd.',
    'Fortsätt med nuvarande tränings- och kostrutiner.',
    'Fokusera på jämna veckovisa förändringar.',
  ],
  reliability: 'Medel',
  waistTrend: 'Följs över tid',
}

function sendResponse(response, status, payload) {
  return response.status(status).json(payload)
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

function parseMultipartImages(rawBodyBuffer, boundary) {
  const rawBody = rawBodyBuffer.toString('latin1')
  const images = {}

  rawBody.split(`--${boundary}`).forEach((part) => {
    if (!part.includes('Content-Disposition')) {
      return
    }

    const [rawHeaders, ...contentParts] = part.split('\r\n\r\n')
    const content = contentParts.join('\r\n\r\n').replace(/\r\n--$/, '')
    const fieldName = rawHeaders.match(/name="([^"]+)"/)?.[1]
    const fileName = rawHeaders.match(/filename="([^"]*)"/)?.[1]
    const contentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]

    if (!fieldName || !fileName) {
      return
    }

    images[fieldName] = {
      contentType: contentType?.toLowerCase() || '',
      name: fileName,
      size: Buffer.byteLength(content, 'latin1'),
    }
  })

  return images
}

async function parseImages(request) {
  const contentType = getRequestHeader(request, 'content-type')
  const boundary = getMultipartBoundary(contentType)

  if (!contentType.includes('multipart/form-data') || !boundary) {
    return {
      frontImage: null,
      sideImage: null,
    }
  }

  const rawBodyBuffer = await readRequestBody(request)
  const images = parseMultipartImages(rawBodyBuffer, boundary)

  return {
    frontImage: images.frontImage ?? null,
    sideImage: images.sideImage ?? null,
  }
}

function validateImage(image, label) {
  if (!image) {
    return `${label} saknas.`
  }

  if (!allowedImageTypes.includes(image.contentType)) {
    return `${label} måste vara JPEG, JPG eller PNG.`
  }

  if (image.size > MAX_IMAGE_SIZE_BYTES) {
    return `${label} får vara max 10 MB.`
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

function buildOpenAIPrompt() {
  return [
    'Du är en försiktig AI-assistent för visuell kroppsanalys.',
    'Ge en varsam visuell bedömning baserad på bilderna.',
    'Ställ aldrig diagnos och gör ingen medicinsk bedömning.',
    'Uppskatta inte exakt kroppsfett som ett medicinskt värde.',
    'Fokusera på förändringar över tid, hållning, fotokonsekvens och allmänna råd.',
    'Svara kort, tydligt och tryggt.',
  ].join(' ')
}

function createMockAnalysis() {
  return mockBodyAnalysisResult
}

async function analyzeWithOpenAI(frontImage, sideImage) {
  // TODO: Call OpenAI here through src/services/bodyAnalysisAi.js.
  const prompt = buildOpenAIPrompt()

  void prompt
  void frontImage
  void sideImage

  return createMockAnalysis()
}

export default async function handler(request, response) {
  let images

  try {
    images = await parseImages(request)
  } catch {
    return sendResponse(response, 400, {
      error: 'Kunde inte läsa bilderna.',
    })
  }

  const validationError = validateRequest(request, images)

  if (validationError) {
    if (validationError.status === 405) {
      response.setHeader('Allow', 'POST')
    }

    return sendResponse(response, validationError.status, {
      error: validationError.error,
    })
  }

  try {
    const result = await analyzeWithOpenAI(images.frontImage, images.sideImage)

    return sendResponse(response, 200, result)
  } catch {
    return sendResponse(response, 500, {
      error: 'Internal server error.',
    })
  }
}
