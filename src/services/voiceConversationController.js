export const voiceConversationSilenceTimeoutMs = 15000

export function getSpeechRecognitionConstructor(scope = globalThis) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null
}

export function createVoiceConversationController({
  getMediaDevices = () => globalThis.navigator?.mediaDevices,
  getScope = () => globalThis.window || globalThis,
  getSpeechSynthesis = () => globalThis.window?.speechSynthesis || globalThis.speechSynthesis,
  hostname = () => globalThis.window?.location?.hostname || '',
  isSecureContext = () => Boolean((globalThis.window || globalThis).isSecureContext),
  onTranscript,
  setActive,
  setListening,
  setStatus,
  silenceTimeoutMs = voiceConversationSilenceTimeoutMs,
  timers = globalThis,
} = {}) {
  let active = false
  let currentRecognition = null
  let hasStarted = false
  let handledResult = false
  let pendingRestart = null
  let pendingStatus = null
  let silenceTimer = null
  let stopRequested = false

  function clearTimer(timer) {
    if (timer) timers.clearTimeout(timer)
  }

  function clearTimers() {
    clearTimer(pendingRestart)
    clearTimer(pendingStatus)
    clearTimer(silenceTimer)
    pendingRestart = null
    pendingStatus = null
    silenceTimer = null
  }

  function stopSpeechOutput() {
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

  function scheduleRestart(delay = 320) {
    clearTimer(pendingRestart)
    if (!active || stopRequested) return
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

  async function handleTranscript(transcript) {
    clearTimer(silenceTimer)
    silenceTimer = null
    cleanupRecognition()
    setStatus?.('Bearbetar...')

    try {
      await wait(90)
      if (!active || stopRequested) return
      setStatus?.('AI svarar...')
      await onTranscript?.(transcript)
      await wait(180)
    } finally {
      if (active && !stopRequested) {
        setStatus?.('Lyssnar...')
        scheduleRestart(320)
      }
    }
  }

  async function startListening() {
    if (!active || stopRequested || currentRecognition) return false
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
      setStatus?.('Lyssnar...')
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
      try {
        recognition.stop?.()
      } catch {
        // Some WebKit builds throw if stop races onresult; the transcript is already captured.
      }
      void handleTranscript(transcript)
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
    setStatus?.('Lyssnar...')
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
  }
}
