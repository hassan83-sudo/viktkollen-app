// AI-örat - per-category analysis providers.
//
// Each category gets its own provider slot. This is deliberate: identifying
// a played song, a hummed melody, a bird call, a vehicle, and a generic
// sound are different problems that need different specialized services -
// a music-fingerprinting API cannot be assumed to recognize humming, and
// neither can identify a bird or a vehicle. Keeping them separate now means
// a future sprint can connect a real provider to one category without
// touching the others.
//
// IMPORTANT: as of Sprint 4, ONLY musicProvider is connected to a real
// analysis service (see musicRecognitionProvider.js - a server-side AudD
// call, gated behind the same explicit consent-token flow as the rest of
// the app's remote AI features). Every OTHER provider below still only
// reports that it is not connected - none of them invent a
// plausible-looking result. See analyzeAudio.js for how the UI is
// expected to react to "not-connected" versus a real outcome.
//
// No network access happens anywhere in this file itself - musicProvider
// only delegates to musicRecognitionProvider.js, which is the one place
// that talks to the network.

import { analysisTypes } from './audioResultModel.js'
import { recognizeMusic } from './musicRecognitionProvider.js'

function notConnected() {
  return Promise.resolve({ ok: false, reason: 'not-connected' })
}

/**
 * Song / recorded-music identification (e.g. music playing nearby).
 * Sprint 4: connected to a real provider (AudD, via Viktkollen's own
 * server-side /api/ai-ear-music-recognition route - see
 * musicRecognitionProvider.js). Only proceeds when the caller has passed
 * an explicit consentApproved: true, mirroring the app's other
 * consent-gated analysis features; analyzeAudio.js is the only caller and
 * always forwards the consentApproved flag it was given.
 */
export const musicProvider = {
  analysisType: analysisTypes.SONG_IDENTIFICATION,
  analyze(audioBlob, { consentApproved } = {}) {
    return recognizeMusic({ audioBlob, consentApproved })
  },
}

/**
 * Humming / whistling / singing a tune. Deliberately a *different*
 * provider slot than musicProvider - a recorded-audio fingerprint match
 * cannot be assumed to work on a hummed, off-key rendition of a song.
 * A real implementation would need a melody-search service built for
 * query-by-humming, not a fingerprinting service.
 */
export const humProvider = {
  analysisType: analysisTypes.HUMMED_MELODY_SEARCH,
  // eslint-disable-next-line no-unused-vars -- see musicProvider.analyze
  analyze(audioBlob) {
    return notConnected()
  },
}

/**
 * Bird call / birdsong identification. Its own provider slot, never
 * blended with the music providers above.
 */
export const birdProvider = {
  analysisType: analysisTypes.BIRD_SPECIES_IDENTIFICATION,
  // eslint-disable-next-line no-unused-vars -- see musicProvider.analyze
  analyze(audioBlob, { subcategory } = {}) {
    return notConnected()
  },
}

/**
 * Vehicles & machines (cars, motorcycles, trucks/buses, aircraft,
 * helicopters, trains, trams, work machines, ...). subcategory narrows
 * the guess space when the user has picked one; it is never required.
 * Real vehicle-sound identification has very limited off-the-shelf
 * provider options today - see the Sprint 3 report.
 */
export const vehicleProvider = {
  analysisType: analysisTypes.VEHICLE_SOUND_IDENTIFICATION,
  // eslint-disable-next-line no-unused-vars -- see musicProvider.analyze
  analyze(audioBlob, { subcategory } = {}) {
    return notConnected()
  },
}

/**
 * Fallback for sounds that do not fit any of the categories above -
 * general environmental sound classification.
 */
export const generalSoundProvider = {
  analysisType: analysisTypes.GENERAL_SOUND_CLASSIFICATION,
  // eslint-disable-next-line no-unused-vars -- see musicProvider.analyze
  analyze(audioBlob) {
    return notConnected()
  },
}

/** category id (as used by AiEarSection) -> provider. */
export const providersByCategory = Object.freeze({
  music: musicProvider,
  hum: humProvider,
  birds: birdProvider,
  vehicles: vehicleProvider,
  other: generalSoundProvider,
})
