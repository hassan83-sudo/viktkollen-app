import { getSpeechLocale, getSpeechRecognitionConstructor } from './voiceConversationController.js'

/**
 * AI-EAR-2C: Tal → text for AI Örat with the browser's own SpeechRecognition
 * (or webkitSpeechRecognition). No Viktkollen server, no provider, no audio
 * file: the browser turns speech into text (depending on the browser its
 * vendor may process the audio). Nothing is stored or sent by Viktkollen.
 *
 * Reuses the AI Coach engine's constructor detection and language mapping
 * (voiceConversationController.js) but is a separate controller, so AI Coach
 * is unaffected.
 *
 * SpeechRecognition opens the microphone itself. It is a separate engine
 * from the MediaRecorder hook (useAiEarRecorder.js); AI Örat never runs both
 * at the same time.
 *
 * Callbacks: onStart(), onInterim(text), onFinal(text), onEnd(), onError(code).
 * Error codes (never raw browser messages): 'mic_denied', 'audio_capture',
 * 'no_speech', 'aborted', 'unsupported', 'insecure', 'recognition_error'.
 */
export const aiEarDictationErrors = Object.freeze([
  'aborted', 'audio_capture', 'insecure', 'mic_denied', 'no_speech', 'recognition_error', 'unsupported',
])

export function isAiEarDictationSupported(scope = globalThis.window || globalThis) {
  return Boolean(getSpeechRecognitionConstructor(scope))
}

export function mapAiEarDictationError(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'mic_denied'
  if (error === 'audio-capture') return 'audio_capture'
  if (error === 'no-speech') return 'no_speech'
  if (error === 'aborted') return 'aborted'
  return 'recognition_error'
}

export function createAiEarDictation({
  getLanguage = () => globalThis.document?.documentElement?.lang || '',
  getScope = () => globalThis.window || globalThis,
  hostname = () => globalThis.window?.location?.hostname || '',
  isSecureContext = () => Boolean((globalThis.window || globalThis).isSecureContext),
  onEnd,
  onError,
  onFinal,
  onInterim,
  onStart,
} = {}) {
  let recognition = null
  let stopRequested = false
  let disposed = false
  let errored = false

  function detach(current) {
    if (!current) return
    current.onstart = null
    current.onresult = null
    current.onerror = null
    current.onend = null
  }

  function finish() {
    detach(recognition)
    recognition = null
  }

  function start() {
    if (disposed || recognition) return false
    const Recognition = getSpeechRecognitionConstructor(getScope?.())
    if (!Recognition) {
      onError?.('unsupported')
      return false
    }
    if (!isSecureContext?.() && hostname?.() !== 'localhost') {
      onError?.('insecure')
      return false
    }

    stopRequested = false
    errored = false
    const current = new Recognition()
    recognition = current
    current.lang = getSpeechLocale(getLanguage?.())
    current.continuous = true
    current.interimResults = true
    current.maxAlternatives = 1

    current.onstart = () => {
      if (recognition === current) onStart?.()
    }
    current.onresult = (event = {}) => {
      if (recognition !== current) return
      const results = Array.from(event.results || [])
      let interim = ''
      for (let index = event.resultIndex || 0; index < results.length; index += 1) {
        const result = results[index]
        const text = String(result?.[0]?.transcript || '').trim()
        if (!text) continue
        if (result.isFinal) onFinal?.(text)
        else interim = interim ? `${interim} ${text}` : text
      }
      onInterim?.(interim)
    }
    current.onerror = (event = {}) => {
      if (recognition !== current) return
      // A requested stop/abort ends quietly.
      if (stopRequested && event.error === 'aborted') return
      errored = true
      onError?.(mapAiEarDictationError(event.error))
    }
    current.onend = () => {
      if (recognition !== current) return
      finish()
      onInterim?.('')
      if (!errored) onEnd?.()
    }

    try {
      current.start()
      return true
    } catch {
      finish()
      onError?.('recognition_error')
      return false
    }
  }

  // Ends the session normally: the browser delivers the last final result,
  // then `end`.
  function stop() {
    if (!recognition) return
    stopRequested = true
    try { recognition.stop() } catch { finish() }
  }

  // Ends the session at once without further callbacks (mode change, unmount).
  function abort() {
    const current = recognition
    if (!current) return
    stopRequested = true
    finish()
    try { current.abort() } catch { /* already ended */ }
  }

  function dispose() {
    abort()
    disposed = true
  }

  return {
    abort,
    dispose,
    isActive: () => Boolean(recognition),
    start,
    stop,
  }
}
