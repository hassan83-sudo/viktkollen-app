const BODY_ANALYSIS_ENDPOINT = '/api/body-analysis'
const USE_MOCK_BODY_ANALYSIS = false

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
    frontImage: frontImage.file,
    sideImage: sideImage.file,
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

async function callMockBodyAnalysis(payload) {
  void payload

  return mockBodyResult
}

async function callBodyAnalysisApi(payload) {
  try {
    const formData = new FormData()

    formData.append('frontImage', payload.frontImage)
    formData.append('sideImage', payload.sideImage)

    const response = await fetch(BODY_ANALYSIS_ENDPOINT, {
      body: formData,
      method: 'POST',
    })

    let body = {}

    try {
      body = await response.json()
    } catch {
      body = {}
    }

    if (!response.ok) {
      throw new Error(body?.error || 'Kunde inte analysera bilderna just nu.')
    }

    return body
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'Kunde inte nå analysservern. Kontrollera anslutningen och försök igen.',
        { cause: error },
      )
    }

    handleBodyAnalysisError(error)
  }
}

export async function analyzeBodyWithAI({ frontPhoto, sidePhoto }) {
  if (!frontPhoto?.file) {
    throw new Error('Bild framifrån saknas. Välj en bild och försök igen.')
  }

  if (!sidePhoto?.file) {
    throw new Error('Bild från sidan saknas. Välj en bild och försök igen.')
  }

  const payload = buildBodyAnalysisPayload(frontPhoto, sidePhoto)

  // TODO: Send the selected front-facing image as one parameter.
  // TODO: Send the selected side-facing image as one parameter.
  // TODO: Return the AI result from the backend instead of the mock result.
  const response = USE_MOCK_BODY_ANALYSIS
    ? await callMockBodyAnalysis(payload)
    : await callBodyAnalysisApi(payload)

  return normalizeBodyAnalysisResponse(response)
}
