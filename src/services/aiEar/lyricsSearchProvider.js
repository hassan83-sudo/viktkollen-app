// AI-örat -> "Ord ur en låt": the separate, deliberately tiny boundary for
// step two - looking up which song a transcript might be from.
//
// Sprint 7 builds ONLY speech-to-text (see lyricsTranscriptionProvider.js).
// This module is the explicit, isolated seam for the next step, so a
// later sprint can connect a real provider here without touching the
// transcription flow at all. It makes NO network call of any kind today.
//
// Why nothing is connected yet (Sprint 5 research, re-confirmed for this
// sprint): Musixmatch's free tier is not usable commercially, and their
// commercial pricing/terms were not resolved. No Genius scraping, no
// general web scraping, and no full-text lyrics database are used or
// planned - see the "VIKTIGT - COPYRIGHT" note below. Until a specific
// commercial provider is researched, approved and implemented, this stays
// "not-connected", exactly like birdProvider/vehicleProvider/
// generalSoundProvider in providers.js.
//
// Copyright note: even once a real provider is connected here, the goal
// is only ever { title, artist, candidates } - matching a short phrase to
// a possible song - never displaying or storing the full lyrics of any
// song. No "show full lyrics" feature should ever be built against this
// module's result.

/**
 * @param {string} transcript - the transcribed text from
 *   lyricsTranscriptionProvider.recognizeLyrics(). Not used yet - kept as
 *   a real parameter so the eventual provider swap-in does not need to
 *   change this function's signature.
 * @returns {Promise<{status: 'not-connected'}>}
 */
export function search(transcript) {
  void transcript
  return Promise.resolve({ status: 'not-connected' })
}

export const lyricsSearchProvider = { search }
