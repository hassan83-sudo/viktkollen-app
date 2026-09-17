// AI-örat - analysis orchestrator.
//
// This is the only entry point the UI calls. It does not know or care
// which provider ends up doing the work for a given category - it just
// routes to the right provider slot (see providers.js) and normalizes
// whatever comes back into the shared result model (see
// audioResultModel.js).
//
// Sprint 4: musicProvider is now connected to a real network call (see
// providers.js / musicRecognitionProvider.js); every other category still
// resolves with { ok: false, reason: 'not-connected' }. This file itself
// still makes no network request and never reads the audio blob's bytes -
// it only ever hands the blob to the resolved provider and normalizes
// whatever that provider returns.

import { analysisFailureReasons, createAudioAnalysisResult, createLyricsTranscriptionResult } from './audioResultModel.js'
import { providersByCategory } from './providers.js'

/**
 * Analyze a locally recorded audio clip.
 *
 * @param {Object} input
 * @param {Blob} input.audioBlob - the recorded clip (never sent anywhere by this function itself).
 * @param {string} input.category - one of the AI-örat category ids (music, hum, birds, vehicles, other).
 * @param {string} [input.subcategory] - optional narrower hint, currently only meaningful for 'vehicles'.
 * @param {boolean} [input.consentApproved] - forwarded as-is to the provider; only
 *   musicProvider (Sprint 4) reads it, since it is the only provider that ever sends
 *   anything over the network. Every stub provider ignores the extra field, so this
 *   is a backward-compatible addition, not a contract change for them.
 * @returns {Promise<
 *   { ok: true, matched: false } |
 *   { ok: true, matched: true, result: object } |
 *   { ok: true, transcript: object } |
 *   { ok: false, reason: string, message?: string }
 * >}
 */
export async function analyzeAudio({ audioBlob, category, consentApproved = false, subcategory = null } = {}) {
  const provider = providersByCategory[category]

  if (!provider) {
    return { ok: false, reason: analysisFailureReasons.NOT_CONNECTED }
  }

  try {
    const outcome = await provider.analyze(audioBlob, { consentApproved, subcategory })

    if (!outcome || outcome.ok !== true) {
      return { ok: false, reason: outcome?.reason || analysisFailureReasons.NOT_CONNECTED }
    }

    // lyricsProvider (Sprint 7) never returns a song/melody "hit" - it
    // returns a speech-to-text TRANSCRIPT, which must stay a structurally
    // different shape from createAudioAnalysisResult's title/subtitle
    // "match" shape (see audioResultModel.js). This branch is checked
    // FIRST, before the matched/no-match logic below, and returns early -
    // no other provider today ever sets `transcript` on its outcome.
    if (typeof outcome.transcript === 'string') {
      return {
        ok: true,
        transcript: createLyricsTranscriptionResult({
          language: outcome.language,
          lyricsSearch: outcome.lyricsSearch,
          noSpeech: outcome.noSpeech,
          transcript: outcome.transcript,
        }),
      }
    }

    // A provider may report "analyzed successfully, no confident match"
    // (e.g. musicProvider when AudD finds no song) - a normal, non-error
    // outcome that must stay visibly distinct from both a real hit and a
    // provider error. No stub provider ever sets matched: false today.
    if (outcome.matched === false) {
      return { ok: true, matched: false }
    }

    return {
      ok: true,
      matched: true,
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
