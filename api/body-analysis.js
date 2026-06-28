const mockBodyAnalysisResult = {
  bodyFat: '~24 %',
  muscleMass: 'Normal',
  posture: 'Bra',
  waistTrend: 'Följs över tid',
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({
      error: 'Only POST requests are allowed for body analysis.',
    })
  }

  return response.status(200).json(mockBodyAnalysisResult)
}
