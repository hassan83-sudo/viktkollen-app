export function getSpeechRecognitionConstructor(globalObject = globalThis) {
  if (!globalObject || typeof globalObject !== 'object') return null
  return globalObject.SpeechRecognition || globalObject.webkitSpeechRecognition || null
}

const speechLanguageByAppLocale = {
  ar: 'ar-SA',
  cs: 'cs-CZ',
  da: 'da-DK',
  de: 'de-DE',
  el: 'el-GR',
  en: 'en-US',
  es: 'es-ES',
  fi: 'fi-FI',
  fr: 'fr-FR',
  he: 'he-IL',
  hi: 'hi-IN',
  hu: 'hu-HU',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ms: 'ms-MY',
  nl: 'nl-NL',
  no: 'nb-NO',
  pl: 'pl-PL',
  pt: 'pt-PT',
  ro: 'ro-RO',
  sv: 'sv-SE',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  vi: 'vi-VN',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
}

export function resolveSpeechRecognitionLanguage(appLocale, fallback = 'sv-SE') {
  const mapped = speechLanguageByAppLocale[String(appLocale || '').trim()]
  return mapped || fallback
}

export function pickSpeechTranscript(event) {
  const results = event?.results
  if (!results?.length) return ''

  const last = results[results.length - 1]
  const alternative = last?.[0]
  return String(alternative?.transcript || '').replace(/\s+/g, ' ').trim()
}

export function isFinalSpeechResult(event) {
  const results = event?.results
  if (!results?.length) return false
  return Boolean(results[results.length - 1]?.isFinal)
}

export function mapSpeechRecognitionError(error) {
  const code = String(error || '')
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'permission'
  if (code === 'no-speech') return 'noSpeech'
  if (code === 'audio-capture') return 'audioCapture'
  if (code === 'network') return 'network'
  if (code === 'aborted') return 'aborted'
  return 'generic'
}
