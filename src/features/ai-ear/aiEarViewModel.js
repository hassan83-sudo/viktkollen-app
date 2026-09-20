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

export const aiEarFooterNote = 'AI-örat är en prototyp. Resultatet är en indikation, inte en garanti.'

const insufficientSignalHints = Object.freeze([
  'Spela in närmare ljudet.',
  'Minska bakgrundsljud.',
  'Försök igen.',
])

// Species may only be shown when the backend allows it AND the state can carry one.
const speciesStates = new Set(['species_candidate', 'unresolved', 'mixed_scene'])

function cleanList(value, max) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, max) : []
}

export function buildAiEarResultView(result) {
  const state = aiEarStates.includes(result?.state) ? result.state : 'unavailable'
  const disposition = aiEarDispositions.includes(result?.speciesDisposition) ? result.speciesDisposition : 'withhold'
  const copy = result?.userFacing || {}
  const headline = typeof copy.headline === 'string' ? copy.headline.trim() : ''
  const contextLines = cleanList(copy.contextLines, 6)
  const canShowSpecies = (disposition === 'lead' || disposition === 'caveat') && speciesStates.has(state)
  const speciesLines = canShowSpecies ? cleanList(copy.speciesLines, disposition === 'lead' ? 5 : 1) : []

  const base = {
    contextLines: [],
    disposition,
    footer: aiEarFooterNote,
    hints: [],
    retryable: false,
    species: [],
    state,
  }

  switch (state) {
    case 'insufficient_signal':
      return { ...base, hints: [...insufficientSignalHints], kind: 'insufficient_signal', title: 'Ljudsignalen räckte inte', body: 'AI-örat hörde för lite för att kunna säga något.', retryable: true }
    case 'unavailable':
      return { ...base, kind: 'unavailable', title: 'AI-örat är tillfälligt otillgängligt', body: 'Försök igen om en stund.', retryable: true }
    case 'speech':
      return { ...base, kind: 'speech', title: headline || 'AI-örat hör främst tal', body: 'AI-örat skriver inte ut vad som sägs och sparar inget ljud.', contextLines }
    case 'music':
      return { ...base, kind: 'music', title: headline || 'AI-örat hör främst musik', body: null, contextLines }
    case 'human_whistle':
      return { ...base, kind: 'human_whistle', title: headline || 'Det låter mer som mänsklig vissling än ett tydligt fågelläte', body: null, contextLines }
    case 'mixed_scene':
      return {
        ...base,
        contextLines,
        kind: 'mixed_scene',
        species: speciesLines.map((text) => ({ text })),
        title: headline || 'Det finns flera ljud samtidigt',
        body: 'AI-örat kan inte peka ut en enda källa.',
      }
    case 'species_candidate':
      return {
        ...base,
        kind: disposition === 'lead' ? 'species_lead' : 'species_caveat',
        species: speciesLines.map((text) => ({ text })),
        title: headline || (disposition === 'lead' ? 'Det låter som en fågel' : 'AI-örat hör något fågelliknande, men arten är osäker'),
        body: disposition === 'lead' ? null : 'Det här är bara en möjlig kandidat.',
      }
    case 'unresolved':
    default:
      return {
        ...base,
        contextLines,
        kind: 'unresolved',
        species: speciesLines.map((text) => ({ text })),
        title: 'AI-örat kunde inte avgöra ljudet tillräckligt säkert',
        body: 'Prova en ny inspelning, gärna närmare ljudet.',
        retryable: true,
      }
  }
}

const errorViews = Object.freeze({
  aborted: { title: 'Analysen avbröts', body: 'Ingenting sparades.', retryable: true },
  auth_required: { title: 'Logga in för att använda AI-örat', body: 'Din session behöver förnyas.', retryable: false },
  consent_required: { title: 'Ljudet kunde inte godkännas för analys', body: 'Försök igen.', retryable: true },
  invalid_audio: { title: 'Ljudet kunde inte läsas', body: 'Prova att spela in på nytt.', retryable: true },
  invalid_response: { title: 'Något gick fel', body: 'Försök igen om en stund.', retryable: true },
  network: { title: 'Ingen kontakt med tjänsten', body: 'Kontrollera din uppkoppling och försök igen.', retryable: true },
  not_available: { title: 'AI-örat är inte tillgängligt just nu', body: 'Försök igen senare.', retryable: false },
  offline: { title: 'Du verkar vara offline', body: 'Anslut till internet och försök igen.', retryable: true },
  rate_limited: { title: 'För många försök just nu', body: 'Vänta en stund och försök igen.', retryable: true },
  service_unavailable: { title: 'AI-örat är tillfälligt otillgängligt', body: 'Försök igen om en stund.', retryable: true },
  timeout: { title: 'Det tog för lång tid', body: 'Första analysen kan ta längre tid. Försök igen.', retryable: true },
  too_large: { title: 'Ljudfilen är för stor', body: 'Välj en kortare inspelning.', retryable: false },
  unsupported_media: { title: 'Ljudformatet stöds inte', body: 'Spela in direkt i appen eller välj en annan ljudfil.', retryable: false },
})

const localReasonViews = Object.freeze({
  audio_empty: { title: 'Inget ljud hittades', body: 'Prova att spela in på nytt.', retryable: true },
  audio_too_large: { title: 'Ljudfilen är för stor', body: 'Välj en kortare inspelning.', retryable: false },
  audio_too_short: { title: 'Inspelningen är för kort', body: 'Spela in minst en halv sekund.', retryable: true },
  audio_undecodable: { title: 'Ljudet kunde inte läsas', body: 'Välj en annan fil eller spela in direkt i appen.', retryable: true },
  audio_unsupported: { title: 'Ljud stöds inte i den här webbläsaren', body: 'Prova en annan webbläsare.', retryable: false },
  mic_denied: { title: 'Mikrofonen är inte tillåten', body: 'Tillåt mikrofon i webbläsaren för att spela in.', retryable: true },
  mic_unavailable: { title: 'Ingen mikrofon hittades', body: 'Du kan välja en ljudfil i stället.', retryable: true },
  not_audio: { title: 'Det där är inte en ljudfil', body: 'Välj en ljudfil.', retryable: false },
})

export function buildAiEarErrorView(reason) {
  const known = Boolean(errorViews[reason] || localReasonViews[reason])
  const view = errorViews[reason] || localReasonViews[reason] || errorViews.service_unavailable
  return { ...view, kind: 'error', reason: known ? reason : 'service_unavailable' }
}
