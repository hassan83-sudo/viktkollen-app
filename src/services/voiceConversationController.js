import { defaultLanguageCode, supportedLanguageCodes } from '../i18n/languages.js'

export const voiceConversationSilenceTimeoutMs = 7000
export const voiceConversationSpeechRecoveryMs = 20000

const companionVoiceProfiles = Object.freeze({
  nova: { voiceIndex: 0, rate: 0.96, pitch: 1.08 },
  kai: { voiceIndex: 1, rate: 1.04, pitch: 0.92 },
  mira: { voiceIndex: 2, rate: 1.02, pitch: 1.16 },
  sol: { voiceIndex: 3, rate: 0.91, pitch: 0.88 },
  rio: { voiceIndex: 4, rate: 1.09, pitch: 1.02 },
  ash: { voiceIndex: 5, rate: 0.98, pitch: 0.82 },
  quill: { voiceIndex: 6, rate: 0.9, pitch: 1.0 },
  zen: { voiceIndex: 7, rate: 0.88, pitch: 0.94 },
})

export function getSelectedCompanionVoiceId(scope = globalThis) {
  try {
    const raw = scope?.localStorage?.getItem?.('viktkollen.ai-companion.v1')
    const parsed = raw ? JSON.parse(raw) : null
    return companionVoiceProfiles[parsed?.avatarId] ? parsed.avatarId : 'nova'
  } catch {
    return 'nova'
  }
}

export function getCompanionVoiceProfile(avatarId = 'nova') {
  return companionVoiceProfiles[avatarId] || companionVoiceProfiles.nova
}

// A11Y-8Z2 (8T/8Y B10): speech recognition and the synthesis fallback follow
// the app language (document.documentElement.lang, set by i18n) instead of
// always sv-SE. Full locales for the app's complete languages; other
// supported codes are valid language tags as they are; anything else falls
// back to the app's default language (sv -> sv-SE).
const speechLocales = Object.freeze({
  ar: 'ar-SA',
  da: 'da-DK',
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fi: 'fi-FI',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  nl: 'nl-NL',
  no: 'nb-NO',
  pl: 'pl-PL',
  pt: 'pt-PT',
  sv: 'sv-SE',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
})

export function getSpeechLocale(language) {
  const code = String(language || '')
  if (speechLocales[code]) return speechLocales[code]
  if (supportedLanguageCodes.includes(code)) return code
  return speechLocales[defaultLanguageCode]
}

export function getSpeechRecognitionConstructor(scope = globalThis) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null
}

export function selectSpeechSynthesisVoice(voices = [], avatarId = 'nova', language = defaultLanguageCode) {
  if (!Array.isArray(voices) || voices.length === 0) return null

  const prefix = getSpeechLocale(language).split('-')[0].toLowerCase()
  const languageVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith(prefix))
  if (languageVoices.length > 0) {
    const profile = getCompanionVoiceProfile(avatarId)
    return languageVoices[profile.voiceIndex % languageVoices.length]
  }

  return voices.find((voice) => voice.default) || voices[0] || null
}

export function createVoiceConversationController({
  getLanguage = () => globalThis.document?.documentElement?.lang || '',
  getMediaDevices = () => globalThis.navigator?.mediaDevices,
  getScope = () => globalThis.window || globalThis,
  getSpeechSynthesis = () => globalThis.window?.speechSynthesis || globalThis.speechSynthesis,
  getSpeechSynthesisUtterance = () =>
    globalThis.window?.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance,
  hostname = () => globalThis.window?.location?.hostname || '',
  isSecureContext = () => Boolean((globalThis.window || globalThis).isSecureContext),
  isSpeechEnabled = () => true,
  onSpeechStart,
  onTranscript,
  setActive,
  setListening,
  setSpeaking,
  setStatus,
  silenceTimeoutMs = voiceConversationSilenceTimeoutMs,
  speechRecoveryMs = voiceConversationSpeechRecoveryMs,
  timers = globalThis,
} = {}) {
  let active = false
  let currentRecognition = null
  let currentUtterance = null
  let disposed = false
  let handledResult = false
  let pendingTranscript = ''
  let finalizeTimer = null
  let silenceTimer = null
  let speechStartTimer = null
  let speechRecoveryTimer = null
  let stopRequested = false

  function clearTimer(timer) {
    if (timer) timers.clearTimeout(timer)
  }

  function clearRecognitionTimers() {
    clearTimer(finalizeTimer)
    clearTimer(silenceTimer)
    finalizeTimer = null
    silenceTimer = null
  }

  function clearSpeechTimers() {
    clearTimer(speechStartTimer)
    clearTimer(speechRecoveryTimer)
    speechStartTimer = null
    speechRecoveryTimer = null
  }

  function setConversationActive(value) {
    active = value
    setActive?.(value)
  }

  function cleanupRecognition(recognition = currentRecognition) {
    clearRecognitionTimers()
    if (currentRecognition === recognition) currentRecognition = null
    setListening?.(false)
  }

  function cancelRecognition() {
    const recognition = currentRecognition
    currentRecognition = null
    clearRecognitionTimers()
    try {
      recognition?.abort?.()
    } catch {
      // WebKit can throw when abort races an end event.
    }
    setListening?.(false)
  }

  function cancelSpeech() {
    clearSpeechTimers()
    currentUtterance = null
    setSpeaking?.(false)
    try {
      getSpeechSynthesis?.()?.cancel?.()
    } catch {
      // Ignore browser speech queue races.
    }
  }

  async function ensureMicrophoneAvailable() {
    const mediaDevices = getMediaDevices?.()
    if (!mediaDevices?.getUserMedia) {
      return { ok: false, status: 'Mikrofonen är inte tillgänglig i den här webbläsaren.' }
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true })
      stream?.getTracks?.().forEach((track) => track.stop())
      return { ok: true }
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        return {
          ok: false,
          status: 'Mikrofonbehörighet nekades. Tillåt mikrofon i webbläsaren och försök igen.',
        }
      }

      if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        return { ok: false, status: 'Ingen mikrofon hittades. Kontrollera mikrofonen eller skriv frågan.' }
      }

      return { ok: false, status: 'Mikrofonen kunde inte starta. Försök igen eller skriv frågan.' }
    }
  }

  function finishTurn() {
    if (disposed) return
    setConversationActive(false)
    setListening?.(false)
    setSpeaking?.(false)
    setStatus?.('')
  }

  function speakResponse(text) {
    const reply = String(text || '').trim()
    if (!reply || !isSpeechEnabled?.()) return Promise.resolve(false)

    const speechSynthesis = getSpeechSynthesis?.()
    const SpeechSynthesisUtterance = getSpeechSynthesisUtterance?.()
    if (!speechSynthesis?.speak || !SpeechSynthesisUtterance) return Promise.resolve(false)

    return new Promise((resolve) => {
      let settled = false
      let attempt = 0

      const settle = (didSpeak) => {
        if (settled) return
        settled = true
        clearSpeechTimers()
        currentUtterance = null
        setSpeaking?.(false)
        resolve(didSpeak)
      }

      const runAttempt = () => {
        if (settled || stopRequested || !active || disposed) {
          settle(false)
          return
        }

        attempt += 1
        let started = false
        const utterance = new SpeechSynthesisUtterance(reply)
        const scope = getScope?.()
        const avatarId = getSelectedCompanionVoiceId(scope)
        const voiceProfile = getCompanionVoiceProfile(avatarId)
        const language = getLanguage?.()
        const voice = selectSpeechSynthesisVoice(speechSynthesis.getVoices?.() || [], avatarId, language)

        if (voice) utterance.voice = voice
        utterance.lang = voice?.lang || getSpeechLocale(language)
        utterance.rate = voiceProfile.rate
        utterance.pitch = voiceProfile.pitch
        utterance.volume = 1

        utterance.onstart = () => {
          if (currentUtterance !== utterance || settled) return
          started = true
          clearTimer(speechStartTimer)
          speechStartTimer = null
          setSpeaking?.(true)
          setStatus?.('🔊 AI pratar...')
          onSpeechStart?.()
        }

        utterance.onend = () => settle(started)
        utterance.onerror = () => {
          if (!started && attempt < 2 && active && !stopRequested) {
            clearSpeechTimers()
            currentUtterance = null
            timers.setTimeout(runAttempt, 120)
            return
          }
          settle(started)
        }

        currentUtterance = utterance
        setSpeaking?.(false)
        setStatus?.('🔊 Startar AI-röst...')

        try {
          speechSynthesis.cancel?.()
          speechSynthesis.resume?.()
          speechSynthesis.speak(utterance)
        } catch {
          if (attempt < 2) {
            timers.setTimeout(runAttempt, 120)
          } else {
            settle(false)
          }
          return
        }

        speechStartTimer = timers.setTimeout(() => {
          speechStartTimer = null
          if (settled || started || currentUtterance !== utterance) return

          try {
            speechSynthesis.cancel?.()
          } catch {
            // Ignore queue reset errors.
          }

          currentUtterance = null
          if (attempt < 2 && active && !stopRequested) {
            timers.setTimeout(runAttempt, 120)
          } else {
            settle(false)
          }
        }, 1000)

        speechRecoveryTimer = timers.setTimeout(() => {
          if (!settled) settle(started)
        }, speechRecoveryMs)
      }

      runAttempt()
    })
  }

  async function processTranscript(transcript, recognition) {
    if (handledResult || stopRequested || !active) return
    handledResult = true
    clearRecognitionTimers()
    setStatus?.('🧠 Bearbetar...')

    try {
      try {
        recognition?.stop?.()
      } catch {
        try {
          recognition?.abort?.()
        } catch {
          // Ignore recognition handoff races.
        }
      }

      cleanupRecognition(recognition)

      // Let iOS release the microphone audio session before starting speaker audio.
      await new Promise((resolve) => timers.setTimeout(resolve, 140))
      if (stopRequested || !active || disposed) return

      const reply = await onTranscript?.(transcript)
      if (stopRequested || !active || disposed) return

      await speakResponse(reply)
    } finally {
      finishTurn()
    }
  }

  async function startListening() {
    if (!active || stopRequested || currentRecognition || disposed) return false

    const scope = getScope?.()
    const SpeechRecognition = getSpeechRecognitionConstructor(scope)
    if (!SpeechRecognition) {
      finishTurn()
      setStatus?.('Röstinmatning stöds inte i den här webbläsaren. Skriv frågan i stället.')
      return false
    }

    if (!isSecureContext?.() && hostname?.() !== 'localhost') {
      finishTurn()
      setStatus?.('Mikrofonen kräver HTTPS. Testa i en säker webbläsarsession.')
      return false
    }

    const microphone = await ensureMicrophoneAvailable()
    if (!microphone.ok) {
      finishTurn()
      setStatus?.(microphone.status)
      return false
    }

    if (!active || stopRequested || disposed) return false

    handledResult = false
    pendingTranscript = ''
    const recognition = new SpeechRecognition()
    currentRecognition = recognition

    recognition.lang = getSpeechLocale(getLanguage?.())
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    const finalize = () => {
      const transcript = pendingTranscript.trim()
      if (!transcript || handledResult) return
      void processTranscript(transcript, recognition)
    }

    recognition.addEventListener('start', () => {
      if (!active || stopRequested) return
      setListening?.(true)
      setStatus?.('🎤 Lyssnar...')
      clearTimer(silenceTimer)
      silenceTimer = timers.setTimeout(() => {
        if (handledResult || pendingTranscript.trim()) {
          finalize()
          return
        }
        cancelRecognition()
        finishTurn()
        setStatus?.('Jag hörde inget. Tryck på mikrofonen och försök igen.')
      }, silenceTimeoutMs)
    })

    recognition.addEventListener('result', (event) => {
      if (handledResult || stopRequested) return

      const results = Array.from(event.results || [])
      const transcript = results
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()

      if (!transcript) return
      pendingTranscript = transcript
      clearTimer(silenceTimer)
      silenceTimer = null

      if (results.some((result) => result?.isFinal)) {
        finalize()
        return
      }

      clearTimer(finalizeTimer)
      finalizeTimer = timers.setTimeout(finalize, 500)
    })

    recognition.addEventListener('speechend', () => {
      if (handledResult || !pendingTranscript.trim()) return
      clearTimer(finalizeTimer)
      finalizeTimer = timers.setTimeout(finalize, 120)
    })

    recognition.addEventListener('error', (event = {}) => {
      if (handledResult || stopRequested) return

      if (pendingTranscript.trim()) {
        finalize()
        return
      }

      cleanupRecognition(recognition)
      finishTurn()

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setStatus?.('Mikrofonbehörighet nekades. Tillåt mikrofon och försök igen.')
      } else if (event.error === 'audio-capture') {
        setStatus?.('Ingen mikrofon hittades.')
      } else if (event.error === 'no-speech') {
        setStatus?.('Jag hörde inget. Tryck på mikrofonen och försök igen.')
      } else {
        setStatus?.('Röstinmatningen avbröts. Tryck på mikrofonen och försök igen.')
      }
    })

    recognition.addEventListener('end', () => {
      if (handledResult || stopRequested) return

      if (pendingTranscript.trim()) {
        finalize()
        return
      }

      cleanupRecognition(recognition)
      finishTurn()
    })

    try {
      recognition.start()
      return true
    } catch {
      cleanupRecognition(recognition)
      finishTurn()
      setStatus?.('Mikrofonen kunde inte starta. Tryck och försök igen.')
      return false
    }
  }

  async function start() {
    if (active) {
      stop()
      return false
    }

    stopRequested = false
    setConversationActive(true)
    setStatus?.('🎤 Startar mikrofon...')
    return startListening()
  }

  function stop() {
    stopRequested = true
    cancelRecognition()
    cancelSpeech()
    pendingTranscript = ''
    setConversationActive(false)
    setStatus?.('')
  }

  function stopSpeakingAndResume() {
    if (!currentUtterance) return false
    cancelSpeech()
    finishTurn()
    return true
  }

  function dispose() {
    disposed = true
    stopRequested = true
    cancelRecognition()
    cancelSpeech()
    pendingTranscript = ''
    active = false
  }

  return {
    dispose,
    isActive: () => active,
    start,
    stop,
    stopSpeakingAndResume,
  }
}
