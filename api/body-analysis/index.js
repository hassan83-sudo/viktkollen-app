import { analyzeBodyImages } from '../../src/services/bodyAnalysisAi.js'
import { createBodyAnalysisPrompt } from '../../src/services/bodyAnalysisPrompt.js'
import { formatBodyAnalysisResult } from './formatter.js'
import { createMockAnalysis } from './mockAnalysis.js'
import { parseImages } from './parser.js'
import { sendResponse } from './response.js'
import { validateRequest } from './validation.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function runBodyAnalysis(images) {
  const prompt = createBodyAnalysisPrompt(images.previousAnalysis)
  const startedAt = Date.now()

  try {
    const analysis = await analyzeBodyImages(
      images.frontImage,
      images.sideImage,
      prompt,
      images.previousAnalysis,
    )

    const result = {
      ...analysis,
      source: 'ai',
      sourceReason: analysis.sourceReason || 'ai_success',
    }

    console.info('[api/body-analysis] Analysis completed', {
      durationMs: Date.now() - startedAt,
      source: result.source,
      sourceReason: result.sourceReason,
    })

    return result
  } catch (error) {
    const sourceReason = getFallbackReason(error)

    console.warn('[api/body-analysis] AI analysis failed, using mock', {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      source: 'mock',
      sourceReason,
    })

    return createMockAnalysis(images.previousAnalysis, sourceReason)
  }
}

function getFallbackReason(error) {
  if (error instanceof Error) {
    if (error.message.includes('OPENAI_API_KEY')) {
      return 'missing_api_key'
    }

    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return 'timeout'
    }

    if (error instanceof SyntaxError || error.message.includes('JSON')) {
      return 'invalid_json'
    }
  }

  return 'api_error'
}

/**
 * Orchestrates the body analysis API route.
 *
 * @param {import('http').IncomingMessage & { body?: unknown }} request
 * @param {import('http').ServerResponse & { status: Function }} response
 * @returns {Promise<unknown>}
 */
export default async function handler(request, response) {
  let images

  try {
    images = await parseImages(request)
  } catch {
    return sendResponse(response, 400, {
      error: 'Kunde inte läsa bilderna.',
    })
  }

  const validationError = validateRequest(request, images)

  if (validationError) {
    if (validationError.status === 405) {
      response.setHeader('Allow', 'POST')
    }

    return sendResponse(response, validationError.status, {
      error: validationError.error,
    })
  }

  try {
    const analysis = await runBodyAnalysis(images)
    const result = formatBodyAnalysisResult(analysis)

    console.info('[api/body-analysis] Response sent', {
      source: result.source,
      sourceReason: result.sourceReason,
    })

    return sendResponse(response, 200, result)
  } catch (error) {
    console.error('[api/body-analysis] Unexpected route error', {
      error: error instanceof Error ? error.message : String(error),
      source: 'error',
    })

    return sendResponse(response, 500, {
      error: 'Internal server error.',
    })
  }
}
