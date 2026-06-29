const BODY_ANALYSIS_ENDPOINT = '/api/body-analysis'
const USE_MOCK_BODY_ANALYSIS = false

const mockBodyResult = {
  bodyComposition:
    'Visuell kroppssammansättning ser stabil ut i demoanalysen.',
  comparison: {
    better: 'Demoanalysen visar ingen säker förbättring utan tidigare jämförelse.',
    nextFocus: 'Ta nästa analys med samma ljus, vinkel och avstånd.',
    unchanged: 'Fotokonsekvens och hållning följs vidare över tid.',
  },
  confidence: 'Medel',
  confidenceLevel: 'Medel',
  generatedAt: new Date().toISOString(),
  improvementAreas: ['Fortsätt använda samma plats och ljus.'],
  limitations: ['Demoanalysen använder inte riktig bildtolkning.'],
  monthlyFocus: 'Ta bilder konsekvent och följ utvecklingen över tid.',
  nextSteps: ['Ta nästa analys om ungefär 7 dagar.'],
  posture: 'Hållningen ser stabil ut i demoanalysen.',
  progressSummary: 'Demoanalysen ger en lokal testpunkt för historiken.',
  recommendations: ['Fokusera på jämna förändringar över tid.'],
  routineFeedback: 'Regelbundenhet gör jämförelserna mer användbara.',
  safetyNote:
    'Detta är en visuell uppskattning och inte medicinsk rådgivning.',
  source: 'mock',
  sourceReason: 'demo',
  status: 'completed',
  strengths: ['Du har valt bilder från två vinklar.'],
  summary: 'Demoanalysen är klar och visas som en försiktig uppskattning.',
  visualConsistency: 'Försök använda samma ljus, avstånd och vinkel.',
}

function buildBodyAnalysisPayload(frontImage, sideImage, previousAnalysis) {
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
    previousAnalysis,
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

    if (payload.previousAnalysis) {
      formData.append('previousAnalysis', JSON.stringify(payload.previousAnalysis))
    }

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

/**
 * Sends selected body analysis images to the backend route.
 *
 * @param {{frontPhoto: {file?: File}, previousAnalysis?: object, sidePhoto: {file?: File}}} params
 * @returns {Promise<Record<string, unknown>>}
 */
export async function analyzeBodyWithAI({
  frontPhoto,
  previousAnalysis,
  sidePhoto,
}) {
  if (!frontPhoto?.file) {
    throw new Error('Välj en bild framifrån innan du startar analysen.')
  }

  if (!sidePhoto?.file) {
    throw new Error('Välj en bild från sidan innan du startar analysen.')
  }

  const payload = buildBodyAnalysisPayload(
    frontPhoto,
    sidePhoto,
    previousAnalysis,
  )

  // TODO: Send the selected front-facing image as one parameter.
  // TODO: Send the selected side-facing image as one parameter.
  // TODO: Return the AI result from the backend instead of the mock result.
  const response = USE_MOCK_BODY_ANALYSIS
    ? await callMockBodyAnalysis(payload)
    : await callBodyAnalysisApi(payload)

  return normalizeBodyAnalysisResponse(response)
}
