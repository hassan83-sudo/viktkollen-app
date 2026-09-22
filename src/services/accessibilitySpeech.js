const MAX_SPEECH_LENGTH = 160

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

export function cancelAccessibilitySpeech() {
  getAccessibilitySpeechApi()?.synthesis.cancel?.()
}

export function speakAccessibilityText({ language, onEnd, onError, rate, text }) {
  const speechApi = getAccessibilitySpeechApi()
  if (!speechApi) return false

  cancelAccessibilitySpeech()
  const utterance = new speechApi.Utterance(normalizeText(text).slice(0, MAX_SPEECH_LENGTH))
  utterance.lang = getAccessibilitySpeechLocale(language)
  utterance.rate = getAccessibilitySpeechRate(rate)
  utterance.onend = onEnd
  utterance.onerror = onError
  speechApi.synthesis.speak(utterance)
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

export { MAX_SPEECH_LENGTH }
