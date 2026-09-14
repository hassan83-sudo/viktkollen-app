export const voiceConversationSilenceTimeoutMs = 15000
export const voiceConversationSpeechRecoveryMs = 30000

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

export function getSpeechRecognitionConstructor(scope = globalThis) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null
}

export function selectSpeechSynthesisVoice(voices = [], avatarId = 'nova') {
  if (!Array.isArray(voices) || voices.length === 0) return null

  const swedishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('sv'))
  if (swedishVoices.length > 0) {
    const profile = getCompanionVoiceProfile(avatarId)
    return swedishVoices[profile.voiceIndex % swedishVoices.length]
  }

  return voices.find((voice) => voice.default) || voices[0] || null
}

export function createVoiceConversationController({
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
  let hasStarted = false
  let handledResult = false
  let pendingRestart = null
  let pendingStatus = null
  let silenceTimer = null
  let speechRecoveryTimer = null
  let speechStartTimer = null
  let stopRequested = false
  let userInterruptedSpeech = false

  function clearTimer(timer) {
    if (timer) timers.clearTimeout(timer)
  }

  function clearTimers() {
    clearTimer(pendingRestart)
    clearTimer(pendingStatus)
    clearTimer(silenceTimer)
    clearTimer(speechRecoveryTimer)
    clearTimer(speechStartTimer)
    pendingRestart = null
    pendingStatus = null
    silenceTimer = null
    speechRecoveryTimer = null
    speechStartTimer = null
  }

  function stopSpeechOutput() {
    userInterruptedSpeech = true
    currentUtterance = null
    setSpeaking?.(false)
    clearTimer(speechRecoveryTimer)
    clearTimer(speechStartTimer)
    speechRecoveryTimer = null
    speechStartTimer = null

    try {
      getSpeechSynthesis?.()?.cancel?.()
    } catch {
      // Ignore browser-specific speech synthesis races.
    }
  }

  function wait(ms) {
    return new Promise((resolve) => {
      pendingStatus = timers.setTimeout(() => {
        pendingStatus = null
        resolve()
      }, ms)
    })
  }

  function setConversationActive(nextActive) {
    active = nextActive
    setActive?.(nextActive)
  }

  function cleanupRecognition(recognition = currentRecognition) {
    if (currentRecognition === recognition) {
      currentRecognition = null
    }
    setListening?.(false)
  }

  async function releaseRecognitionForSpeech(recognition) {
    clearTimer(silenceTimer)
    silenceTimer = null

    if (!recognition) {
      cleanupRecognition()
      return
    }

    try {
      recognition.stop?.()
    } catch {
      try {
        recognition.abort?.()
      } catch {
        // Ignore WebKit stop/abort races.
      }
    }

    // iOS Safari can keep the microphone audio session active briefly after
    // SpeechRecognition.stop(). Starting SpeechSynthesis before it is released
    // can leave the voice queued until the user presses Stop. Give WebKit a
    // short handoff window before starting AI playback.
    await wait(180)
    cleanupRecognition(recognition)
  }

  function scheduleRestart(delay = 320) {
    clearTimer(pendingRestart)
    if (!active || stopRequested || currentRecognition || currentUtterance) return
    pendingRestart = timers.setTimeout(() => {
      pendingRestart = null
      void startListening()
    }, delay)
  }

  function armSilenceTimer() {
    clearTimer(silenceTimer)
    silenceTimer = timers.setTimeout(() => {
      if (!active || stopRequested || handledResult) return
      setStatus?.('Jag hör inget. Vill du fortsätta?')
      currentRecognition?.abort?.()
      scheduleRestart(450)
    }, silenceTimeoutMs)
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

  function speakResponse(text) {
    const reply = String(text || '').trim()
    if (!reply || !isSpeechEnabled?.()) return Promise.resolve(false)

    const speechSynthesis = getSpeechSynthesis?.()
    const SpeechSynthesisUtterance = getSpeechSynthesisUtterance?.()
    if (!speechSynthesis?.speak || !SpeechSynthesisUtterance) return Promise.resolve(false)

    return new Promise((resolve) => {
      let settled = false
      let started = false
      const utterance = new SpeechSynthesisUtterance(reply)
      const scope = getScope?.()
      const avatarId = getSelectedCompanionVoiceId(scope)
      const voiceProfile = getCompanionVoiceProfile(avatarId)
      const voices = speechSynthesis.getVoices?.() || []
      const voice = selectSpeechSynthesisVoice(voices, avatarId)
      let removeVoicesChangedListener = null

      if (voice) utterance.voice = voice
      utterance.lang = voice?.lang || 'sv-SE'
      utterance.rate = voiceProfile.rate
      utterance.pitch = voiceProfile.pitch
      utterance.volume = 1

      if (!voice && typeof speechSynthesis.addEventListener === 'function') {
        const handleVoicesChanged = () => {
          const loadedVoice = selectSpeechSynthesisVoice(speechSynthesis.getVoices?.() || [], avatarId)
          if (!loadedVoice || currentUtterance !== utterance) return
          utterance.voice = loadedVoice
          utterance.lang = loadedVoice.lang || 'sv-SE'
        }
        speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true })
        removeVoicesChangedListener = () => {
          speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged)
        }
      }

      function settle() {
        if (settled) return
        settled = true
        removeVoicesChangedListener?.()
        clearTimer(speechRecoveryTimer)
        clearTimer(speechStartTimer)
        speechRecoveryTimer = null
        speechStartTimer = null
        currentUtterance = null
        setSpeaking?.(false)
        resolve(true)
      }

      utterance.onstart = () => {
        started = true
        clearTimer(speechStartTimer)
        speechStartTimer = null
        setStatus?.('🔊 AI pratar...')
      }
      utterance.onend = settle
      utterance.onerror = settle

      currentUtterance = utterance
      userInterruptedSpeech = false
      setSpeaking?.(true)
      setStatus?.('🔊 AI pratar...')
      speechRecoveryTimer = timers.setTimeout(settle, speechRecoveryMs)

      try {
        speechSynthesis.cancel?.()
        speechSynthesis.resume?.()
        onSpeechStart?.()
        speechStartTimer = timers.setTimeout(() => {
          speechStartTimer = null
          if (settled || currentUtterance !== utterance || !active || stopRequested) {
            settle()
            return
          }

          try {
            speechSynthesis.resume?.()
            speechSynthesis.speak(utterance)
          } catch {
            settle()
            return
          }

          speechStartTimer = timers.setTimeout(() => {
            speechStartTimer = null
            if (settled || started || currentUtterance !== utterance || !active || stopRequested) return

            try {
              speechSynthesis.cancel?.()
              speechSynthesis.resume?.()
              speechSynthesis.speak(utterance)
            } catch {
              settle()
            }
          }, 900)
        }, 80)
      } catch {
        settle()
      }
    })
  }

  async function handleTranscript(transcript, recognition) {
    clearTimer(silenceTimer)
    silenceTimer = null
    setStatus?.('🧠 Bearbetar...')

    try {
      await releaseRecognitionForSpeech(recognition)
      if (!active || stopRequested) return
      setStatus?.('🧠 AI svarar...')
      const reply = await onTranscript?.(transcript)
      if (!active || stopRequested) return
      await speakResponse(reply)
      await wait(180)
    } finally {
      if (active && !stopRequested) {
        setStatus?.('🎤 Lyssnar...')
        scheduleRestart(userInterruptedSpeech ? 120 : 320)
      }
    }
  }

  async function startListening() {
    if (!active || stopRequested || currentRecognition || currentUtterance) return false
    const scope = getScope?.()
    const SpeechRecognition = getSpeechRecognitionConstructor(scope)

    if (!SpeechRecognition) {
      setConversationActive(false)
      setStatus?.('Röstinmatning stöds inte i den här webbläsaren. Skriv frågan i stället.')
      return false
    }

    if (!isSecureContext?.() && hostname?.() !== 'localhost') {
      setConversationActive(false)
      setStatus?.('Mikrofonen kräver oftast HTTPS. Testa i en säker webbläsarsession.')
      return false
    }

    if (!hasStarted) {
      const microphone = await ensureMicrophoneAvailable()
      if (!microphone.ok) {
        setConversationActive(false)
        setStatus?.(microphone.status)
        return false
      }
      hasStarted = true
    }

    handledResult = false
    const recognition = new SpeechRecognition()
    currentRecognition = recognition

    recognition.lang = 'sv-SE'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.addEventListener('start', () => {
      if (!active || stopRequested) return
      setListening?.(true)
      setStatus?.('🎤 Lyssnar...')
      armSilenceTimer()
    })

    recognition.addEventListener('result', (event) => {
      if (handledResult) return
      const transcript = Array.from(event.results || [])
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()

      if (!transcript) return
      handledResult = true
      void handleTranscript(transcript, recognition)
    })

    recognition.addEventListener('error', (event = {}) => {
      clearTimer(silenceTimer)
      silenceTimer = null
      cleanupRecognition(recognition)

      if (stopRequested) return

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setConversationActive(false)
        setStatus?.('Mikrofonbehörighet nekades. Tillåt mikrofon i webbläsaren och försök igen.')
        return
      }

      if (event.error === 'audio-capture') {
        setConversationActive(false)
        setStatus?.('Ingen mikrofon hittades. Kontrollera mikrofonen eller skriv frågan.')
        return
      }

      if (event.error === 'no-speech') {
        setStatus?.('Jag hör inget. Vill du fortsätta?')
        scheduleRestart(450)
        return
      }

      setStatus?.('Röstinmatningen startas om automatiskt.')
      scheduleRestart(600)
    })

    recognition.addEventListener('end', () => {
      clearTimer(silenceTimer)
      silenceTimer = null
      cleanupRecognition(recognition)

      if (!active || stopRequested || handledResult) return
      scheduleRestart(320)
    })

    try {
      recognition.start()
      return true
    } catch {
      cleanupRecognition(recognition)
      setStatus?.('Röstinmatningen startas om automatiskt.')
      scheduleRestart(600)
      return false
    }
  }

  async function start() {
    if (active) {
      stop()
      return false
    }

    stopRequested = false
    hasStarted = false
    setConversationActive(true)
    setStatus?.('🎤 Lyssnar...')
    return startListening()
  }

  function stop() {
    stopRequested = true
    setConversationActive(false)
    clearTimers()
    stopSpeechOutput()
    const recognition = currentRecognition
    currentRecognition = null
    try {
      recognition?.abort?.()
    } catch {
      // Ignore browser-specific abort races.
    }
    setListening?.(false)
    setStatus?.('')
  }

  function stopSpeakingAndResume() {
    if (!active || stopRequested || !currentUtterance) return false
    stopSpeechOutput()
    setStatus?.('🎤 Lyssnar...')
    scheduleRestart(120)
    return true
  }

  function dispose() {
    stopRequested = true
    active = false
    clearTimers()
    stopSpeechOutput()
    const recognition = currentRecognition
    currentRecognition = null
    try {
      recognition?.abort?.()
    } catch {
      // Ignore browser-specific abort races during unmount.
    }
  }

  return {
    dispose,
    isActive: () => active,
    start,
    stop,
    stopSpeakingAndResume,
  }
}
