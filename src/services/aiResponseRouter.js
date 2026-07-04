import { createAiResponseModel } from './aiFallbackEngine.js'

/**
 * Routes an AI request by priority: deterministic, local AI, then OpenAI.
 *
 * @param {object} params
 * @param {() => (object | string | null)} [params.deterministic]
 * @param {() => (object | string | null)} [params.local]
 * @param {() => Promise<object | string | null>} [params.openai]
 * @returns {Promise<object>}
 */
export async function routeAiResponse({ deterministic, local, openai }) {
  const deterministicResponse = deterministic?.()

  if (deterministicResponse) {
    return normalizeAiResponse(deterministicResponse, {
      source: 'mock',
      sourceReason: 'deterministic',
    })
  }

  const localResponse = local?.()

  if (localResponse) {
    return normalizeAiResponse(localResponse, {
      source: 'mock',
      sourceReason: 'smart_local_fallback',
    })
  }

  const openaiResponse = await openai?.()

  return normalizeAiResponse(openaiResponse, {
    source: 'openai',
    sourceReason: 'openai',
  })
}

/**
 * Normalizes any AI response into the shared AI response model.
 *
 * @param {object | string | null | undefined} response
 * @param {object} defaults
 * @returns {object}
 */
export function normalizeAiResponse(response, defaults = {}) {
  if (typeof response === 'string') {
    return createAiResponseModel({
      ...defaults,
      summary: response,
      title: defaults.title || 'AI-svar',
    })
  }

  return createAiResponseModel({
    ...defaults,
    ...(response || {}),
  })
}
