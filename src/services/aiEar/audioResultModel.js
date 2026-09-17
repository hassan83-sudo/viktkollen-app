// AI-örat - shared audio analysis result model.
//
// This is intentionally generic: it has to represent very different kinds
// of "what did I just hear" answers (a song + artist, a bird species, a
// vehicle's possible model family, ...) with the same shape, so the result
// UI never has to know which analysis type produced it.
//
// No provider is connected yet (see providers.js). Every result that
// reaches the UI today is either a "not connected" placeholder or a real
// normalized result from a future provider - never an invented guess.

/** Stable identifiers for what kind of analysis produced a result. */
export const analysisTypes = Object.freeze({
  SONG_IDENTIFICATION: 'song-identification',
  HUMMED_MELODY_SEARCH: 'hummed-melody-search',
  // Sprint 7: NOT a "hit" like the two types above - see
  // createLyricsTranscriptionResult below. A transcript is never forced
  // through createAudioAnalysisResult's title/subtitle "match" shape.
  LYRICS_TRANSCRIPTION: 'lyrics-transcription',
  BIRD_SPECIES_IDENTIFICATION: 'bird-species-identification',
  VEHICLE_SOUND_IDENTIFICATION: 'vehicle-sound-identification',
  GENERAL_SOUND_CLASSIFICATION: 'general-sound-classification',
})

/** Reasons analyzeAudio() can fail to produce a real result. */
export const analysisFailureReasons = Object.freeze({
  NOT_CONNECTED: 'not-connected',
  ERROR: 'error',
})

/**
 * One normalized "candidate" - either the main hit or one alternative.
 * confidence is 0-1, or null when the provider does not give a usable
 * confidence value (never invented).
 */
function normalizeCandidate(candidate = {}) {
  return {
    title: String(candidate.title || '').trim(),
    subtitle: candidate.subtitle ? String(candidate.subtitle).trim() : '',
    confidence: typeof candidate.confidence === 'number' && candidate.confidence >= 0 && candidate.confidence <= 1
      ? candidate.confidence
      : null,
  }
}

/**
 * Builds a normalized AudioAnalysisResult from whatever shape a provider
 * returns. Providers should call this before returning so the UI only
 * ever deals with one consistent shape, regardless of analysisType.
 *
 * category / subcategory: which AI-örat category (and, for vehicles, which
 *   subcategory) the sound was analyzed as.
 * analysisType: one of analysisTypes above.
 * provider: a short id for which provider produced this (e.g. 'acrcloud'),
 *   null while nothing is connected.
 * title / subtitle: the main hit, e.g. title: 'Boeing 737-familjen'.
 * confidence: 0-1 or null.
 * alternatives: array of { title, subtitle, confidence }.
 * details: free-form extra fields specific to the analysisType (e.g.
 *   { engineType: 'jet-twin' } for a vehicle result). Never required by
 *   the generic UI, only shown when present.
 */
export function createAudioAnalysisResult({
  category,
  subcategory = null,
  analysisType,
  provider = null,
  title,
  subtitle = '',
  confidence = null,
  alternatives = [],
  details = null,
} = {}) {
  return {
    category,
    subcategory,
    analysisType,
    provider,
    ...normalizeCandidate({ title, subtitle, confidence }),
    alternatives: Array.isArray(alternatives) ? alternatives.map(normalizeCandidate) : [],
    details: details && typeof details === 'object' ? details : null,
  }
}

/**
 * Builds a normalized "what did I hear as text" result for the
 * "Ord ur en låt" category (Sprint 7) - deliberately NOT
 * createAudioAnalysisResult: a speech-to-text transcript is not a song
 * match, has no title/subtitle/confidence "hit", and must never be
 * dressed up to look like one (see AiEarSection.jsx's separate rendering
 * branch for this shape).
 *
 * transcript is always coerced to a plain string and defensively capped
 * in length - it is treated purely as inert analysis-result TEXT, never
 * interpreted, evaluated, or rendered as HTML/markup anywhere downstream.
 *
 * lyricsSearch is whatever src/services/aiEar/lyricsSearchProvider.js
 * returned for this transcript (today always { status: 'not-connected' }
 * - no real lyrics/song lookup is connected in Sprint 7).
 */
export function createLyricsTranscriptionResult({
  transcript = '',
  language = null,
  noSpeech = false,
  lyricsSearch = null,
} = {}) {
  const safeTranscript = String(transcript || '').slice(0, 500)
  return {
    transcript: safeTranscript,
    language: typeof language === 'string' && language ? language : null,
    noSpeech: noSpeech === true || safeTranscript.length === 0,
    lyricsSearch: lyricsSearch && typeof lyricsSearch === 'object' ? lyricsSearch : { status: 'not-connected' },
  }
}

export const vehicleSubcategories = Object.freeze([
  'car',
  'motorcycle',
  'truckOrBus',
  'aircraft',
  'helicopter',
  'train',
  'tram',
  'machine',
  'other',
])
