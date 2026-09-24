// Upper bound for a single spoken focus label (navigation speech).
const MAX_SPEECH_LENGTH = 160
// A11Y-8A: longest text handed to one SpeechSynthesisUtterance. Longer text
// (e.g. a full 280-character communication message) is split into several
// utterances at sentence/word boundaries and spoken in order, because some
// browsers silently cut or stall very long single utterances.
const MAX_SPEECH_SEGMENT_LENGTH = 160

const speechRates = Object.freeze({
  slow: 0.8,
  normal: 1,
  fast: 1.2,
})

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function visibleText(element) {
  const textCopy = element.cloneNode(true)
  textCopy.querySelectorAll('[hidden], [aria-hidden="true"], script, style, template').forEach((node) => node.remove())
  return normalizeText(textCopy.textContent)
}

function isHidden(element) {
  return Boolean(element.hidden || element.getAttribute('aria-hidden') === 'true' || element.closest('[hidden], [aria-hidden="true"], script, style, template'))
}

export function getAccessibilitySpeechApi() {
  if (typeof window === 'undefined') return null

  const synthesis = window.speechSynthesis
  const Utterance = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance
  if (!synthesis?.speak || !Utterance) return null

  return { synthesis, Utterance }
}

export function getAccessibilitySpeechLocale(language) {
  const locales = {
    sv: 'sv-SE',
    en: 'en-US',
    da: 'da-DK',
    no: 'nb-NO',
    fi: 'fi-FI',
    de: 'de-DE',
    fr: 'fr-FR',
    es: 'es-ES',
    it: 'it-IT',
    nl: 'nl-NL',
    pt: 'pt-PT',
    pl: 'pl-PL',
  }
  return locales[String(language || '').split('-')[0]] || 'en-US'
}

export function getAccessibilitySpeechRate(rate) {
  return speechRates[rate] || speechRates.normal
}

function splitLongPart(part, maxLength) {
  const segments = []
  let current = ''

  part.split(' ').forEach((word) => {
    let remaining = word
    // A single "word" longer than a segment (e.g. a long URL-like token) is
    // the only case that is cut mid-word.
    while (remaining.length > maxLength) {
      if (current) {
        segments.push(current)
        current = ''
      }
      segments.push(remaining.slice(0, maxLength))
      remaining = remaining.slice(maxLength)
    }
    if (!remaining) return

    const candidate = current ? `${current} ${remaining}` : remaining
    if (candidate.length <= maxLength) {
      current = candidate
      return
    }
    segments.push(current)
    current = remaining
  })

  if (current) segments.push(current)
  return segments
}

// Splits text into ordered segments of at most maxLength characters. Sentence
// boundaries are preferred, then word boundaries; the joined segments always
// contain the complete (whitespace-normalized) text.
export function splitAccessibilitySpeechText(text, maxLength = MAX_SPEECH_SEGMENT_LENGTH) {
  const normalized = normalizeText(text)
  if (!normalized) return []
  if (normalized.length <= maxLength) return [normalized]

  const sentences = normalized.split(/(?<=[.!?…])\s+/)
  const segments = []
  let current = ''

  sentences.forEach((sentence) => {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length <= maxLength) {
      current = candidate
      return
    }
    if (current) segments.push(current)
    if (sentence.length <= maxLength) {
      current = sentence
      return
    }
    const parts = splitLongPart(sentence, maxLength)
    current = parts.pop() || ''
    segments.push(...parts)
  })

  if (current) segments.push(current)
  return segments
}

// A11Y-8A: every speak/cancel starts a new sequence. Callbacks from an older
// sequence (a cancelled or replaced read-aloud) are ignored here, so a stale
// utterance can never continue speaking, report completion or report an error
// for the read-aloud that replaced it.
let activeSpeechSequence = 0

export function cancelAccessibilitySpeech() {
  activeSpeechSequence += 1
  getAccessibilitySpeechApi()?.synthesis.cancel?.()
}

export function speakAccessibilityText({ language, onEnd, onError, rate, text }) {
  const speechApi = getAccessibilitySpeechApi()
  if (!speechApi) return false

  cancelAccessibilitySpeech()
  const sequence = activeSpeechSequence
  const segments = splitAccessibilitySpeechText(text)
  if (!segments.length) segments.push('')
  const lang = getAccessibilitySpeechLocale(language)
  const speechRate = getAccessibilitySpeechRate(rate)

  function speakSegment(index) {
    const utterance = new speechApi.Utterance(segments[index])
    utterance.lang = lang
    utterance.rate = speechRate
    utterance.onend = (event) => {
      if (sequence !== activeSpeechSequence) return
      if (index + 1 < segments.length) {
        speakSegment(index + 1)
        return
      }
      onEnd?.(event)
    }
    utterance.onerror = (event) => {
      if (sequence !== activeSpeechSequence) return
      // An error ends the whole sequence; remaining segments are not spoken.
      activeSpeechSequence += 1
      onError?.(event)
    }
    speechApi.synthesis.speak(utterance)
  }

  speakSegment(0)
  return true
}

function associatedLabel(element) {
  if (element.labels?.length) {
    return normalizeText([...element.labels].map((label) => {
      const labelCopy = label.cloneNode(true)
      labelCopy.querySelectorAll('input, select, textarea').forEach((control) => control.remove())
      return labelCopy.textContent
    }).join(' '))
  }
  return ''
}

function labelledByText(element) {
  const ids = normalizeText(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean)
  return normalizeText(ids.map((id) => document.getElementById(id)?.textContent).join(' '))
}

function stateText(element, states) {
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') return states.disabled
  if (element.getAttribute('aria-expanded')) return element.getAttribute('aria-expanded') === 'true' ? states.expanded : states.collapsed
  if (element.getAttribute('aria-checked')) return element.getAttribute('aria-checked') === 'true' ? states.checked : states.unchecked
  if (element.getAttribute('aria-selected')) return element.getAttribute('aria-selected') === 'true' ? states.selected : states.notSelected
  if (element.getAttribute('aria-pressed')) return element.getAttribute('aria-pressed') === 'true' ? states.pressed : states.notPressed
  return ''
}

export function getNavigationSpeechLabel(element, { fallback, states = {} } = {}) {
  if (!element || isHidden(element)) return ''

  const isTextInput = element.matches('input, textarea, select')
  const explicitLabel = element.dataset.a11ySpeechLabel
  const ariaLabel = element.getAttribute('aria-label')
  const labelledBy = labelledByText(element)
  const label = normalizeText(explicitLabel || ariaLabel || labelledBy || (isTextInput ? associatedLabel(element) : visibleText(element)) || fallback)
  if (!label || /^(?:https?:|data:|blob:)/i.test(label)) return normalizeText(fallback).slice(0, MAX_SPEECH_LENGTH)

  const inputType = element.getAttribute('type')
  const inputHint = isTextInput ? (inputType === 'password' ? states.password : states.input) : ''
  return [label, inputHint, stateText(element, states)]
    .filter(Boolean)
    .join('. ')
    .slice(0, MAX_SPEECH_LENGTH)
}

export function isNavigationSpeechTarget(element) {
  return Boolean(element?.matches('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]'))
}

export { MAX_SPEECH_LENGTH, MAX_SPEECH_SEGMENT_LENGTH }
