// AI-örat - analysis orchestrator.
//
// This is the only entry point the UI calls. It does not know or care
// which provider ends up doing the work for a given category - it just
// routes to the right provider slot (see providers.js) and normalizes
// whatever comes back into the shared result model (see
// audioResultModel.js).
//
// No provider is connected yet, so every call today resolves with
// { ok: false, reason: 'not-connected' } for every category. Nothing in
// this file makes a network request or sends audio anywhere - the audio
// blob is only ever handed to the local provider stub, which never reads
// its bytes.

import { analysisFailureReasons, createAudioAnalysisResult } from './audioResultModel.js'
import { providersByCategory } from './providers.js'

/**
 * Analyze a locally recorded audio clip.
 *
 * @param {Object} input
 * @param {Blob} input.audioBlob - the recorded clip (never sent anywhere by this function).
 * @param {string} input.category - one of the AI-örat category ids (music, hum, birds, vehicles, other).
 * @param {string} [input.subcategory] - optional narrower hint, currently only meaningful for 'vehicles'.
 * @returns {Promise<{ ok: true, result: object } | { ok: false, reason: string, message?: string }>}
 */
export async function analyzeAudio({ audioBlob, category, subcategory = null } = {}) {
  const provider = providersByCategory[category]

  if (!provider) {
    return { ok: false, reason: analysisFailureReasons.NOT_CONNECTED }
  }

  try {
    const outcome = await provider.analyze(audioBlob, { subcategory })

    if (!outcome || outcome.ok !== true) {
      return { ok: false, reason: outcome?.reason || analysisFailureReasons.NOT_CONNECTED }
    }

    return {
      ok: true,
      result: createAudioAnalysisResult({
        ...outcome.result,
        analysisType: outcome.result?.analysisType || provider.analysisType,
        category,
        subcategory,
      }),
    }
  } catch (error) {
    return {
      ok: false,
      message: error?.message ? String(error.message).slice(0, 200) : '',
      reason: analysisFailureReasons.ERROR,
    }
  }
}
