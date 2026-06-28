const BODY_ANALYSIS_ENDPOINT = '/api/body-analysis'
const USE_MOCK_BODY_ANALYSIS = true

const mockBodyResult = {
  bodyFat: '~24 %',
  muscleMass: 'Normal',
  posture: 'Bra',
  waistTrend: 'Följs över tid',
}

function buildBodyAnalysisPayload(frontImage, sideImage) {
  const requestMetadata = {
    createdAt: new Date().toISOString(),
    requestId: `body-analysis-${Date.now()}`,
    source: 'body-analysis',
  }

  // TODO: Include requestMetadata in the payload when request status is added.
  void requestMetadata

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

function handleBodyAnalysisError(error) {
  // TODO: Translate future API errors into user-friendly messages here.
  throw error
}

function callMockBodyAnalysis(payload) {
  void payload

  return mockBodyResult
}

function callBodyAnalysisApi(payload) {
  try {
    // TODO: Use fetch(BODY_ANALYSIS_ENDPOINT, ...) when the backend is connected.
    void BODY_ANALYSIS_ENDPOINT
    void payload

    return mockBodyResult
  } catch (error) {
    handleBodyAnalysisError(error)
  }
}

export function analyzeBodyWithAI({ frontPhoto, sidePhoto }) {
  if (!frontPhoto) {
    throw new Error('Bild framifrån saknas. Välj en bild och försök igen.')
  }

  if (!sidePhoto) {
    throw new Error('Bild från sidan saknas. Välj en bild och försök igen.')
  }

  const payload = buildBodyAnalysisPayload(frontPhoto, sidePhoto)

  // TODO: Send the selected front-facing image as one parameter.
  // TODO: Send the selected side-facing image as one parameter.
  // TODO: Return the AI result from the backend instead of the mock result.
  const response = USE_MOCK_BODY_ANALYSIS
    ? callMockBodyAnalysis(payload)
    : callBodyAnalysisApi(payload)

  return normalizeBodyAnalysisResponse(response)
}
