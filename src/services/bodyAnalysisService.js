const BODY_ANALYSIS_ENDPOINT = '/api/body-analysis'

const mockBodyResult = {
  bodyFat: '~24 %',
  muscleMass: 'Normal',
  posture: 'Bra',
  waistTrend: 'Följs över tid',
}

function buildBodyAnalysisPayload(frontImage, sideImage) {
  return {
    createdAt: new Date().toISOString(),
    frontImage,
    sideImage,
  }
}

function normalizeBodyAnalysisResponse(response) {
  // TODO: Normalize future API responses into the body analysis result shape here.
  return response
}

export function analyzeBodyWithAI({ frontPhoto, sidePhoto }) {
  if (!frontPhoto) {
    throw new Error('Bild framifrån saknas. Välj en bild och försök igen.')
  }

  if (!sidePhoto) {
    throw new Error('Bild från sidan saknas. Välj en bild och försök igen.')
  }

  const payload = buildBodyAnalysisPayload(frontPhoto, sidePhoto)

  // TODO: Use BODY_ANALYSIS_ENDPOINT when the fetch request is connected.
  // TODO: Replace this mock with a backend API request for body analysis.
  // TODO: Send the selected front-facing image as one parameter.
  // TODO: Send the selected side-facing image as one parameter.
  // TODO: Return the AI result from the backend instead of the mock result.
  void BODY_ANALYSIS_ENDPOINT
  void payload

  return normalizeBodyAnalysisResponse(mockBodyResult)
}
