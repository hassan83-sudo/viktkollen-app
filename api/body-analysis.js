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

function parseRequestBody(request) {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body)
  }

  return request.body ?? {}
}

function hasMultipartFile(request, fieldName) {
  const contentType = request.headers?.['content-type'] || ''

  if (!contentType.includes('multipart/form-data')) {
    return false
  }

  const rawBody = Buffer.isBuffer(request.body)
    ? request.body.toString('latin1')
    : String(request.body || '')

  return rawBody.includes(`name="${fieldName}"`) && rawBody.includes('filename=')
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

async function analyzeWithOpenAI(frontImage, sideImage) {
  // TODO: Implement the OpenAI body analysis request here.
  const prompt = buildOpenAIPrompt()

  void prompt
  void frontImage
  void sideImage

  return mockBodyAnalysisResult
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({
      error: 'Only POST requests are allowed for body analysis.',
    })
  }

  try {
    const isMultipart = request.headers?.['content-type']?.includes(
      'multipart/form-data',
    )
    const body = isMultipart ? {} : parseRequestBody(request)
    const hasFrontImage = isMultipart
      ? hasMultipartFile(request, 'frontImage')
      : Boolean(body.frontImage)
    const hasSideImage = isMultipart
      ? hasMultipartFile(request, 'sideImage')
      : Boolean(body.sideImage)

    if (!hasFrontImage || !hasSideImage) {
      return response.status(400).json({
        error: 'Both frontImage and sideImage are required.',
      })
    }

    const result = await analyzeWithOpenAI(body.frontImage, body.sideImage)

    return response.status(200).json(result)
  } catch {
    return response.status(500).json({
      error: 'Internal server error.',
    })
  }
}
