import { createAiResponseModel } from './aiFallbackEngine.js'
import {
  aiAuthErrorCode,
  getAiAuthSafeMessage,
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from './ai/aiAuthTransport.js'

const BODY_ANALYSIS_ENDPOINT = '/api/body-analysis'
const USE_MOCK_BODY_ANALYSIS = false
const BODY_ANALYSIS_TIMEOUT_MS = 15000

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
  strengths: ['Du har valt bilder från tre vinklar.'],
  summary: 'Demoanalysen är klar och visas som en försiktig uppskattning.',
  visualConsistency: 'Försök använda samma ljus, avstånd och vinkel.',
}

export function buildBodyAnalysisPayload(frontImage, sideImage, backImage, previousAnalysis) {
  const requestMetadata = {
    createdAt: new Date().toISOString(),
    requestId: `body-analysis-${Date.now()}`,
    source: 'body-analysis',
  }

  // TODO: Include requestMetadata in the payload when request status is added.
  void requestMetadata

  return {
    createdAt: new Date().toISOString(),
    backImage: backImage.file,
    frontImage: frontImage.file,
    previousAnalysis,
    sideImage: sideImage.file,
  }
}

function normalizeBodyAnalysisResponse(response) {
  const commonResponse = createAiResponseModel({
    actions: response.nextSteps || response.actions,
    confidence: response.confidenceLevel || response.confidence || 'medel',
    followUp: response.followUp || 'Vill du jämföra mot nästa analys senare?',
    generatedAt: response.generatedAt,
    source: response.source || 'mock',
    sourceReason: response.sourceReason || 'body_analysis',
    status: response.status || 'completed',
    summary: response.summary,
    title: response.title || 'AI-kroppsanalys',
    warnings: response.limitations || response.warnings,
  })

  return {
    ...commonResponse,
    ...response,
  }
}

function handleBodyAnalysisError(error) {
  // TODO: Translate future API errors into user-friendly messages here.
  throw error
}

function getBodyAnalysisApiErrorMessage(body = {}, status = 0) {
  const code = body?.error?.code
  const safeMessage = body?.error?.safeMessage

  if (safeMessage) return safeMessage
  if (code === 'AUTH_REQUIRED') return 'Logga in för att använda AI-kroppsanalys.'
  if (code === 'AUTH_EXPIRED') return 'Sessionen har gått ut. Logga in igen och försök på nytt.'
  if (code === 'AUTH_INVALID') return 'Du behöver logga in igen innan AI-kroppsanalys kan användas.'
  if (code === 'AUTH_UNAVAILABLE') return 'Inloggningen kunde inte verifieras just nu. Försök igen senare.'
  if (code === 'REQUEST_TOO_LARGE' || status === 413) return 'Bilderna är för stora. Välj mindre bilder och försök igen.'
  if (code === 'INVALID_REQUEST') return 'Bilderna kunde inte valideras säkert. Välj nya bilder och försök igen.'
  if (typeof body?.error === 'string') return body.error

  return 'Kunde inte analysera bilderna just nu.'
}

async function callMockBodyAnalysis(payload) {
  void payload

  return mockBodyResult
}

async function callBodyAnalysisApi(payload) {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), BODY_ANALYSIS_TIMEOUT_MS)
    : null

  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) {
      throw new Error(auth.warning || getAiAuthSafeMessage(auth.errorCode || aiAuthErrorCode.AUTH_REQUIRED))
    }

    const formData = new FormData()

    formData.append('frontImage', payload.frontImage)
    formData.append('sideImage', payload.sideImage)
    formData.append('backImage', payload.backImage)

    if (payload.previousAnalysis) {
      formData.append('previousAnalysis', JSON.stringify(payload.previousAnalysis))
    }

    const response = await fetch(BODY_ANALYSIS_ENDPOINT, {
      body: formData,
      headers: {
        Authorization: auth.authorizationHeader,
      },
      method: 'POST',
      signal: controller?.signal,
    })

    let body = {}

    try {
      body = await response.json()
    } catch {
      body = {}
    }

    if (!response.ok) {
      throw new Error(getBodyAnalysisApiErrorMessage(body, response.status))
    }

    if (!await hasSameAiAuthUser(auth.userScope)) {
      throw new Error(getAiAuthSafeMessage(aiAuthErrorCode.AUTH_STALE))
    }

    return body
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Analysen tog för lång tid. Försök igen med tydligare bilder eller kontrollera anslutningen.',
        { cause: error },
      )
    }

    if (error instanceof TypeError) {
      throw new Error(
        'Kunde inte nå analysservern. Kontrollera anslutningen och försök igen.',
        { cause: error },
      )
    }

    handleBodyAnalysisError(error)
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  }
}

/**
 * Sends selected body analysis images to the backend route.
 *
 * @param {{backPhoto: {file?: File}, frontPhoto: {file?: File}, previousAnalysis?: object, sidePhoto: {file?: File}}} params
 * @returns {Promise<Record<string, unknown>>}
 */
export async function analyzeBodyWithAI({
  backPhoto,
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

  if (!backPhoto?.file) {
    throw new Error('Välj en bild bakifrån innan du startar analysen.')
  }

  const payload = buildBodyAnalysisPayload(
    frontPhoto,
    sidePhoto,
    backPhoto,
    previousAnalysis,
  )

  // TODO: Return the AI result from the backend instead of the mock result.
  const response = USE_MOCK_BODY_ANALYSIS
    ? await callMockBodyAnalysis(payload)
    : await callBodyAnalysisApi(payload)

  return normalizeBodyAnalysisResponse(response)
}
