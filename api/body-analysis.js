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

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({
      error: 'Only POST requests are allowed for body analysis.',
    })
  }

  try {
    const body = parseRequestBody(request)

    if (!body.frontImage || !body.sideImage) {
      return response.status(400).json({
        error: 'Both frontImage and sideImage are required.',
      })
    }

    return response.status(200).json(mockBodyAnalysisResult)
  } catch {
    return response.status(500).json({
      error: 'Internal server error.',
    })
  }
}
