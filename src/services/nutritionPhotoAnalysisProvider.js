import { normalizeNutritionPhotoAnalysis } from './nutritionPhotoAnalysis.js'
import {
  aiAuthErrorCode,
  getAiAuthSafeMessage,
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from './ai/aiAuthTransport.js'

export const nutritionPhotoProviderTypes = ['mock', 'remote']
export const nutritionPhotoAnalysisTimeoutMs = 12000

let activeRequestId = 0
let transientClientId = ''

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''))
}

function getTransientClientId() {
  if (!transientClientId) {
    transientClientId = `scanner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  return transientClientId
}

function createMockAnalysis(input = {}, options = {}) {
  const mealType = safeText(input.mealType, 'Lunch')
  const name = mealType === 'Frukost' ? 'ägg och bröd' : mealType === 'Mellanmål' ? 'kvarg och frukt' : 'kyckling, ris och grönsaker'

  return normalizeNutritionPhotoAnalysis({
    analysisDate: options.analysisDate,
    detectedItems: [
      { calories: 240, carbohydrates: 18, confidence: 'medium', dataSource: 'aiEstimate', estimatedAmount: 160, fat: 7, name: name.split(',')[0], protein: 28, unit: 'g' },
      { calories: 180, carbohydrates: 38, confidence: 'low', dataSource: 'aiEstimate', estimatedAmount: 140, fat: 1, name: 'kolhydratkälla', protein: 4, unit: 'g' },
      { calories: 60, carbohydrates: 8, confidence: 'low', dataSource: 'aiEstimate', estimatedAmount: 100, fat: 3, name: 'grönsaker eller sås', protein: 2, unit: 'g' },
    ],
    estimatedNutrition: {
      calories: { confidence: 'medium', max: 560, midpoint: 480, min: 410 },
      carbsG: { confidence: 'medium', max: 76, midpoint: 64, min: 52 },
      fatG: { confidence: 'low', max: 17, midpoint: 11, min: 7 },
      fiberG: { confidence: 'low', max: 9, midpoint: 5, min: 2 },
      proteinG: { confidence: 'medium', max: 42, midpoint: 34, min: 26 },
    },
    portionEstimate: {
      confidence: 'medium',
      description: 'En normal tallrik',
      gramsMax: 520,
      gramsMin: 380,
    },
    ingredients: [
      { confidence: 'medium', estimatedAmount: 'ca 130-180 g', name: 'Kyckling', notes: 'Synlig proteinkälla.' },
      { confidence: 'low', estimatedAmount: 'ca 140-220 g', name: 'Ris eller liknande kolhydrat', notes: 'Mängden är svår att avgöra från vinkel.' },
      { confidence: 'low', estimatedAmount: 'okänd', name: 'Sås eller olja', notes: 'Kan vara dold i tillagningen.' },
    ],
    uncertainIngredients: [
      { confidence: 'low', name: 'Sås eller olja', reason: 'Dolda fetter kan påverka kalorier och fett.' },
    ],
    estimatedServing: 'En normal tallrik',
    analysisQuality: {
      confidence: 'medium',
      limitations: ['Portion och dolda fetter är osäkra i en enskild bild.'],
      summary: 'Lokal försiktig uppskattning med breda intervall.',
    },
    imageMetadata: input.imageMetadata,
    limitations: [
      'Portionsstorlek och dolda ingredienser kan inte avgöras exakt från bilden.',
      'Sås, olja och tillagning kan påverka kalorierna.',
    ],
    provider: { label: 'Lokal demo-uppskattning', type: 'mock' },
    safeSummary: 'Lokal fallback: detta är en försiktig demo-uppskattning från bildflödet.',
    sourceType: 'photo',
    warnings: ['Granska och redigera värdena innan du sparar.'],
  }, options)
}

function timeoutSignal(ms, upstreamSignal) {
  if (typeof AbortController === 'undefined') return { cleanup: () => {}, signal: undefined }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const abortFromUpstream = () => controller.abort()
  if (upstreamSignal?.aborted) controller.abort()
  upstreamSignal?.addEventListener?.('abort', abortFromUpstream, { once: true })

  return {
    cleanup: () => {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener?.('abort', abortFromUpstream)
    },
    signal: controller.signal,
  }
}

function createRemoteFormData(input = {}) {
  if (typeof FormData === 'undefined') {
    throw new Error('form_data_unavailable')
  }
  const formData = new FormData()
  formData.append('mealType', safeText(input.mealType, 'Lunch', 40))
  formData.append('schema', 'nutritionPhotoAnalysis.v3')
  formData.append('image', input.preprocessedImage, 'meal-image.jpg')

  return formData
}

function safeRemoteWarning(status, errorCode) {
  if ([aiAuthErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_EXPIRED'].includes(errorCode) || status === 401) {
    return 'Logga in igen för att använda remote bildanalys.'
  }
  if (errorCode === 'AUTH_UNAVAILABLE') return 'Inloggningen kunde inte verifieras just nu. Försök igen senare.'
  if (errorCode === 'RATE_LIMITED') return 'För många bildanalyser just nu. Vänta en stund och försök igen manuellt.'
  if (errorCode === 'PROVIDER_NOT_CONFIGURED') return 'Remote bildanalys är inte konfigurerad på servern.'
  if (errorCode === 'PROVIDER_TIMEOUT') return 'Bildanalysen tog för lång tid. Försök igen med en tydligare bild.'
  if (errorCode === 'PROVIDER_UNAVAILABLE') return 'Remote bildanalys är tillfälligt otillgänglig.'
  if (status === 429 || errorCode === 'rateLimit') return 'För många bildanalyser just nu. Vänta en stund och försök igen manuellt.'
  if (status === 503 || errorCode === 'serverConfiguration') return 'Remote bildanalys är inte konfigurerad på servern.'
  if (status === 504 || errorCode === 'timeout') return 'Bildanalysen tog för lång tid. Försök igen med en tydligare bild.'
  if (status >= 500) return 'Remote bildanalys är tillfälligt otillgänglig.'

  return 'Remote bildanalys kunde inte slutföras.'
}

export async function analyzeNutritionPhoto(input = {}, options = {}) {
  const providerType = nutritionPhotoProviderTypes.includes(options.providerType) ? options.providerType : 'mock'
  const requestId = activeRequestId + 1
  activeRequestId = requestId

  if (options.offline || (typeof navigator !== 'undefined' && navigator.onLine === false && providerType === 'remote')) {
    return {
      analysis: null,
      ok: providerType !== 'remote',
      providerType: 'remote',
      warning: 'Du är offline. Remote analys är inte tillgänglig, men du kan registrera manuellt eller skapa en lokal uppskattning.',
    }
  }

  if (providerType === 'mock') {
    return {
      analysis: createMockAnalysis(input, options),
      ok: true,
      providerType,
    }
  }

  const timeout = timeoutSignal(options.timeoutMs || nutritionPhotoAnalysisTimeoutMs, options.signal)

  try {
    if (timeout.signal?.aborted) {
      return { analysis: null, aborted: true, ok: false, providerType, warning: 'Analysen avbröts.' }
    }
    if (!input.preprocessedImage) {
      return {
        analysis: null,
        ok: false,
        providerType,
        warning: 'Bild saknas för remote analys.',
      }
    }

    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) {
      return {
        analysis: null,
        errorCode: auth.errorCode,
        ok: false,
        providerType,
        warning: auth.warning || getAiAuthSafeMessage(auth.errorCode),
      }
    }

    const response = await fetch('/api/nutrition-photo-analysis', {
      body: createRemoteFormData(input),
      headers: {
        Authorization: auth.authorizationHeader,
        'x-viktkollen-client-id': getTransientClientId(),
      },
      method: 'POST',
      signal: timeout.signal,
    })
    if (requestId !== activeRequestId) {
      return {
        analysis: null,
        ok: false,
        stale: true,
        warning: 'Ett nyare analysförsök finns redan.',
      }
    }

    if (!await hasSameAiAuthUser(auth.userScope)) {
      return {
        analysis: null,
        errorCode: aiAuthErrorCode.AUTH_STALE,
        ok: false,
        providerType,
        stale: true,
        warning: getAiAuthSafeMessage(aiAuthErrorCode.AUTH_STALE),
      }
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      return {
        analysis: null,
        ok: false,
        providerType,
        warning: 'Remote bildanalys gav ett ogiltigt svar.',
      }
    }

    const errorCode = payload?.error?.code
    if (!response.ok || payload?.ok === false) {
      return {
        analysis: null,
        ok: false,
        providerType,
        retryable: payload?.error?.retryable === true || response.status >= 500 || response.status === 429,
        warning: safeRemoteWarning(response.status, errorCode),
      }
    }

    const analysis = normalizeNutritionPhotoAnalysis({
      ...(payload.analysis || {}),
      provider: { label: 'Remote AI-analys', type: 'remote' },
    }, options)

    return { analysis, ok: true, providerType }
  } catch (error) {
    if (isAbortError(error)) {
      return { analysis: null, aborted: true, ok: false, providerType, warning: 'Analysen avbröts.' }
    }

    return {
      analysis: null,
      ok: false,
      providerType,
      warning: 'Remote bildanalys kunde inte slutföras. Ingen kostnadsbärande retry kördes automatiskt.',
    }
  } finally {
    timeout.cleanup()
  }
}

export const nutritionPhotoProviderInternals = {
  createMockAnalysis,
  createRemoteFormData,
  safeRemoteWarning,
}
