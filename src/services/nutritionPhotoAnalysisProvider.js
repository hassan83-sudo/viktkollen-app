import { requestAiEndpoint } from './aiApiService.js'
import { normalizeNutritionPhotoAnalysis } from './nutritionPhotoAnalysis.js'

export const nutritionPhotoProviderTypes = ['mock', 'remote']
export const nutritionPhotoAnalysisTimeoutMs = 12000

let activeRequestId = 0

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''))
}

function createMockAnalysis(input = {}, options = {}) {
  const mealType = safeText(input.mealType, 'Lunch')
  const name = mealType === 'Frukost' ? 'ägg och bröd' : mealType === 'Mellanmål' ? 'kvarg och frukt' : 'kyckling, ris och grönsaker'

  return normalizeNutritionPhotoAnalysis({
    analysisDate: options.analysisDate,
    detectedItems: [
      { calories: 240, carbohydrates: 18, confidence: 'medium', estimatedAmount: 160, fat: 7, name: name.split(',')[0], protein: 28, unit: 'g' },
      { calories: 180, carbohydrates: 38, confidence: 'low', estimatedAmount: 140, fat: 1, name: 'kolhydratkälla', protein: 4, unit: 'g' },
      { calories: 60, carbohydrates: 8, confidence: 'low', estimatedAmount: 100, fat: 3, name: 'grönsaker eller sås', protein: 2, unit: 'g' },
    ],
    estimatedNutrition: { calories: 480, carbs: 64, fat: 11, protein: 34 },
    estimatedServing: 'En normal tallrik',
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

function timeoutSignal(ms) {
  if (typeof AbortController === 'undefined') return { cleanup: () => {}, signal: undefined }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)

  return {
    cleanup: () => clearTimeout(timer),
    signal: controller.signal,
  }
}

export async function analyzeNutritionPhoto(input = {}, options = {}) {
  const providerType = nutritionPhotoProviderTypes.includes(options.providerType) ? options.providerType : 'mock'
  const requestId = activeRequestId + 1
  activeRequestId = requestId

  if (options.offline || (typeof navigator !== 'undefined' && navigator.onLine === false && providerType === 'remote')) {
    return {
      analysis: createMockAnalysis(input, options),
      ok: providerType !== 'remote',
      providerType: 'mock',
      warning: 'Du är offline. Remote analys är inte tillgänglig, men du kan registrera manuellt.',
    }
  }

  if (providerType === 'mock') {
    return {
      analysis: createMockAnalysis(input, options),
      ok: true,
      providerType,
    }
  }

  const timeout = timeoutSignal(options.timeoutMs || nutritionPhotoAnalysisTimeoutMs)

  try {
    const response = await requestAiEndpoint({
      action: 'nutrition-photo-analysis',
      image: input.preprocessedImage,
      language: 'sv',
      mealType: safeText(input.mealType),
      schema: 'nutritionPhotoAnalysis.v2',
      signal: options.signal || timeout.signal,
    })
    if (requestId !== activeRequestId) {
      return {
        analysis: null,
        ok: false,
        stale: true,
        warning: 'Ett nyare analysförsök finns redan.',
      }
    }
    const payload = response.data?.analysis || response.data || {}
    const analysis = normalizeNutritionPhotoAnalysis({
      ...payload,
      provider: { label: 'Remote AI-analys', type: 'remote' },
    }, options)

    return response.ok
      ? { analysis, ok: true, providerType }
      : {
        analysis: createMockAnalysis(input, options),
        ok: false,
        providerType: 'mock',
        warning: 'Remote analys kunde inte användas. Lokal fallback visas utan att låtsas vara AI.',
      }
  } catch (error) {
    if (isAbortError(error)) {
      return { analysis: null, aborted: true, ok: false, warning: 'Analysen avbröts.' }
    }

    return {
      analysis: createMockAnalysis(input, options),
      ok: false,
      providerType: 'mock',
      warning: 'Analysen kunde inte slutföras. Lokal fallback visas utan rått felmeddelande.',
    }
  } finally {
    timeout.cleanup()
  }
}

export const nutritionPhotoProviderInternals = {
  createMockAnalysis,
}
