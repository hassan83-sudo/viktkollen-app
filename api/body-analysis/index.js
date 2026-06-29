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
  const prompt = createBodyAnalysisPrompt()

  try {
    // TODO: Pass prompt and images into OpenAI Vision when implemented.
    void prompt

    return await analyzeBodyImages(images.frontImage, images.sideImage)
  } catch (error) {
    if (error instanceof Error && error.message === 'Not implemented') {
      return createMockAnalysis()
    }

    throw error
  }
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

    return sendResponse(response, 200, result)
  } catch {
    return sendResponse(response, 500, {
      error: 'Internal server error.',
    })
  }
}
