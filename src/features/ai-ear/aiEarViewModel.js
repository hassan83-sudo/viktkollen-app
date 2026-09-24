import i18n from '../../i18n/index.js'

/**
 * AI-örat: maps the frozen v2 result (reduced by our server hop) and hop errors
 * to what the UI shows. All semantics come from the backend (state,
 * speciesDisposition, userFacing copy). There are NO score thresholds here and
 * raw model scores never reach the client.
 */

export const aiEarStates = Object.freeze([
  'speech', 'music', 'human_whistle', 'mixed_scene', 'species_candidate', 'unresolved', 'insufficient_signal', 'unavailable',
])
export const aiEarDispositions = Object.freeze(['lead', 'caveat', 'withhold', 'unavailable'])

// A11Y-8D: all AI-örat copy lives in the i18n `aiEar` namespace. Builders take
// a translate function (the component passes useTranslation('aiEar').t for the
// active language); without one they fall back to the Swedish copy, which is
// the app's default language and what earlier callers received.
function swedish(key, options) {
  return i18n.getFixedT('sv', 'aiEar')(key, options)
}

export const aiEarFooterNote = swedish('footer')

const insufficientSignalHintKeys = Object.freeze(['hints.closer', 'hints.lessNoise', 'hints.tryAgain'])

// Species may only be shown when the backend allows it AND the state can carry one.
const speciesStates = new Set(['species_candidate', 'unresolved', 'mixed_scene'])

function cleanList(value, max) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, max) : []
}

export function buildAiEarResultView(result, t = swedish) {
  const state = aiEarStates.includes(result?.state) ? result.state : 'unavailable'
  const disposition = aiEarDispositions.includes(result?.speciesDisposition) ? result.speciesDisposition : 'withhold'
  const copy = result?.userFacing || {}
  const headline = typeof copy.headline === 'string' ? copy.headline.trim() : ''
  const contextLines = cleanList(copy.contextLines, 6)
  const canShowSpecies = (disposition === 'lead' || disposition === 'caveat') && speciesStates.has(state)
  const speciesLines = canShowSpecies ? cleanList(copy.speciesLines, disposition === 'lead' ? 5 : 1) : []
  const text = (key) => t(`results.${key}`)

  const base = {
    contextLines: [],
    disposition,
    footer: t('footer'),
    hints: [],
    retryable: false,
    species: [],
    state,
  }

  switch (state) {
    case 'insufficient_signal':
      return { ...base, hints: insufficientSignalHintKeys.map((key) => t(key)), kind: 'insufficient_signal', title: text('insufficient_signal.title'), body: text('insufficient_signal.body'), retryable: true }
    case 'unavailable':
      return { ...base, kind: 'unavailable', title: text('unavailable.title'), body: text('unavailable.body'), retryable: true }
    case 'speech':
      return { ...base, kind: 'speech', title: headline || text('speech.title'), body: text('speech.body'), contextLines }
    case 'music':
      return { ...base, kind: 'music', title: headline || text('music.title'), body: null, contextLines }
    case 'human_whistle':
      return { ...base, kind: 'human_whistle', title: headline || text('human_whistle.title'), body: null, contextLines }
    case 'mixed_scene':
      return {
        ...base,
        contextLines,
        kind: 'mixed_scene',
        species: speciesLines.map((line) => ({ text: line })),
        title: headline || text('mixed_scene.title'),
        body: text('mixed_scene.body'),
      }
    case 'species_candidate':
      return {
        ...base,
        kind: disposition === 'lead' ? 'species_lead' : 'species_caveat',
        species: speciesLines.map((line) => ({ text: line })),
        title: headline || (disposition === 'lead' ? text('species_lead.title') : text('species_caveat.title')),
        body: disposition === 'lead' ? null : text('species_caveat.body'),
      }
    case 'unresolved':
    default:
      return {
        ...base,
        contextLines,
        kind: 'unresolved',
        species: speciesLines.map((line) => ({ text: line })),
        title: text('unresolved.title'),
        body: text('unresolved.body'),
        retryable: true,
      }
  }
}

// Only whether a reason can be retried is decided here; the copy is in i18n.
const errorRetryable = Object.freeze({
  aborted: true,
  auth_required: false,
  consent_required: true,
  invalid_audio: true,
  invalid_response: true,
  network: true,
  not_available: false,
  offline: true,
  rate_limited: true,
  service_unavailable: true,
  timeout: true,
  too_large: false,
  unsupported_media: false,
  audio_empty: true,
  audio_too_large: false,
  audio_too_short: true,
  audio_undecodable: true,
  audio_unsupported: false,
  mic_denied: true,
  mic_unavailable: true,
  not_audio: false,
})

export function buildAiEarErrorView(reason, t = swedish) {
  const known = Object.hasOwn(errorRetryable, reason)
  const key = known ? reason : 'service_unavailable'
  return {
    body: t(`errors.${key}.body`),
    kind: 'error',
    reason: key,
    retryable: errorRetryable[key],
    title: t(`errors.${key}.title`),
  }
}
