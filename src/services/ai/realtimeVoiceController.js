export const VOICE_UNAVAILABLE_MESSAGE = 'Röstsamtal är inte tillgängligt just nu.'
export const VOICE_PERMISSION_DENIED_MESSAGE =
  'Mikrofonbehörighet nekades. Tillåt mikrofon i webbläsaren och försök igen.'

export const voicePhaseLabels = {
  idle: 'Redo',
  listening: 'Lyssnar...',
  thinking: 'AI tänker...',
  speaking: 'AI pratar...',
}

let activeRealtimeSession = null

export function hasActiveRealtimeVoiceSession() {
  return Boolean(activeRealtimeSession)
}

export function getVoicePhaseLabel({
  isAiSpeaking = false,
  isListening = false,
  isVoiceConversationActive = false,
  voiceStatus = '',
} = {}) {
  const status = String(voiceStatus || '').trim()
  if (status) return status
  if (isAiSpeaking) return voicePhaseLabels.speaking
  if (isListening) return voicePhaseLabels.listening
  if (isVoiceConversationActive) return voicePhaseLabels.idle
  return 'Tryck för att prata'
}

export function getAvatarVoicePhaseLabel({
  isAiSpeaking = false,
  isListening = false,
  isVoiceConversationActive = false,
  voiceStatus = '',
} = {}) {
  const status = String(voiceStatus || '').trim()
  if (status && !/^(redo|lyssnar|ai tänker|ai pratar)/i.test(status)) {
    return status
  }
  if (isAiSpeaking) return '🔊 AI pratar...'
  if (/tänk/i.test(status)) return 'AI tänker...'
  if (isListening) return '🎙 Lyssnar...'
  if (isVoiceConversationActive) return '● Redo'
  return '● Redo'
}

function readEventType(payload) {
  return payload?.type || payload?.event || ''
}

export function mapRealtimeEventToPhase(payload) {
  const type = readEventType(payload)

  if (/input_audio_buffer\.speech_started|conversation\.item\.input_audio_transcription\.completed/i.test(type)) {
    return 'listening'
  }
  if (/response\.created|response\.output_item\.added/i.test(type)) {
    return 'thinking'
  }
  if (/response\.(output_audio|audio_transcript)\.delta|output_audio_buffer\.started/i.test(type)) {
    return 'speaking'
  }
  if (/response\.done|output_audio_buffer\.stopped/i.test(type)) {
    return 'listening'
  }
  return ''
}

export function createRealtimeVoiceController({
  connectRealtime,
  getUserMedia,
  onPhaseChange,
  onStatus,
  requestSession,
  setActive,
  setListening,
  setMuted,
  setSpeaking,
  timers = globalThis,
} = {}) {
  let closed = false
  let idleTimer = null
  let maxTimer = null
  let mediaStream = null
  let muted = false
  let peer = null
  let sessionLimits = { idleTimeoutMs: 45000, maxSessionMs: 180000 }

  function clearTimers() {
    if (idleTimer) timers.clearTimeout(idleTimer)
    if (maxTimer) timers.clearTimeout(maxTimer)
    idleTimer = null
    maxTimer = null
  }

  function applyPhase(phase) {
    if (!phase || closed) return
    setListening?.(phase === 'listening')
    setSpeaking?.(phase === 'speaking')
    onPhaseChange?.(phase)
    onStatus?.(voicePhaseLabels[phase] || voicePhaseLabels.listening)
  }

  function armIdleTimer() {
    clearTimers()
    idleTimer = timers.setTimeout(() => {
      onStatus?.('Samtalet avslutades efter inaktivitet.')
      stop()
    }, sessionLimits.idleTimeoutMs)
    maxTimer = timers.setTimeout(() => {
      onStatus?.('Samtalet nådde maxlängden och avslutades.')
      stop()
    }, sessionLimits.maxSessionMs)
  }

  function handleRealtimeMessage(payload) {
    const phase = mapRealtimeEventToPhase(payload)
    if (phase) applyPhase(phase)
    if (phase === 'listening' || phase === 'thinking' || phase === 'speaking') {
      armIdleTimer()
    }
  }

  async function start() {
    if (activeRealtimeSession && activeRealtimeSession !== api) {
      activeRealtimeSession.stop()
    }
    if (peer) stop()

    closed = false
    setActive?.(true)
    applyPhase('thinking')
    onStatus?.('Startar röstsamtal...')

    const session = await requestSession?.()
    if (closed) return { ok: false, reason: 'closed' }

    if (!session?.available || !session.clientSecret) {
      setActive?.(false)
      onStatus?.(session?.message || VOICE_UNAVAILABLE_MESSAGE)
      return { ok: false, reason: 'unavailable' }
    }

    sessionLimits = {
      idleTimeoutMs: Number(session.idleTimeoutMs) || 45000,
      maxSessionMs: Number(session.maxSessionMs) || 180000,
    }

    try {
      mediaStream = await getUserMedia({ audio: true })
    } catch (error) {
      setActive?.(false)
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        onStatus?.(VOICE_PERMISSION_DENIED_MESSAGE)
        return { ok: false, reason: 'denied' }
      }
      onStatus?.(VOICE_UNAVAILABLE_MESSAGE)
      return { ok: false, reason: 'unavailable' }
    }

    if (closed) {
      mediaStream?.getTracks?.().forEach((track) => track.stop())
      return { ok: false, reason: 'closed' }
    }

    try {
      peer = await connectRealtime({
        clientSecret: session.clientSecret,
        mediaStream,
        model: session.model,
        onMessage: handleRealtimeMessage,
      })
    } catch {
      mediaStream?.getTracks?.().forEach((track) => track.stop())
      setActive?.(false)
      onStatus?.(VOICE_UNAVAILABLE_MESSAGE)
      return { ok: false, reason: 'unavailable' }
    }

    activeRealtimeSession = api
    applyPhase('listening')
    armIdleTimer()
    return { ok: true }
  }

  function setMicrophoneMuted(nextMuted) {
    muted = Boolean(nextMuted)
    mediaStream?.getAudioTracks?.().forEach((track) => {
      track.enabled = !muted
    })
    setMuted?.(muted)
    return muted
  }

  function stop() {
    closed = true
    clearTimers()
    try {
      peer?.close?.()
    } catch {
      // Ignore WebRTC teardown races.
    }
    mediaStream?.getTracks?.().forEach((track) => track.stop())
    peer = null
    mediaStream = null
    if (activeRealtimeSession === api) activeRealtimeSession = null
    setListening?.(false)
    setSpeaking?.(false)
    setActive?.(false)
    setMuted?.(false)
  }

  const api = {
    handleRealtimeMessage,
    isActive: () => Boolean(peer) && !closed,
    isMuted: () => muted,
    setMicrophoneMuted,
    start,
    stop,
  }

  return api
}

export async function connectOpenAiRealtimeWebRtc({
  AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext,
  RTCPeerConnectionCtor = globalThis.RTCPeerConnection,
  clientSecret,
  fetchImpl = fetch,
  mediaStream,
  model,
  onMessage,
} = {}) {
  if (!RTCPeerConnectionCtor || !clientSecret) {
    throw new Error('realtime-unavailable')
  }

  const peer = new RTCPeerConnectionCtor()
  const remoteStream = new MediaStream()
  const playback = new Audio()
  playback.autoplay = true
  playback.srcObject = remoteStream

  peer.ontrack = (event) => {
    event.streams?.[0]?.getTracks?.().forEach((track) => remoteStream.addTrack(track))
    if (!event.streams?.[0] && event.track) remoteStream.addTrack(event.track)
  }

  mediaStream?.getAudioTracks?.().forEach((track) => peer.addTrack(track, mediaStream))

  const dataChannel = peer.createDataChannel('oai-events')
  dataChannel.addEventListener('message', (event) => {
    try {
      onMessage?.(JSON.parse(event.data))
    } catch {
      // Ignore malformed realtime events.
    }
  })

  const offer = await peer.createOffer()
  await peer.setLocalDescription(offer)

  const realtimeUrl = new URL('https://api.openai.com/v1/realtime')
  if (model) realtimeUrl.searchParams.set('model', model)

  const sdpResponse = await fetchImpl(realtimeUrl.toString(), {
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      'Content-Type': 'application/sdp',
      'OpenAI-Beta': 'realtime=v1',
    },
    method: 'POST',
  })

  if (!sdpResponse.ok) {
    peer.close()
    throw new Error('realtime-unavailable')
  }

  const answer = await sdpResponse.text()
  await peer.setRemoteDescription({ sdp: answer, type: 'answer' })

  return {
    close() {
      try {
        dataChannel.close()
      } catch {
        // Ignore.
      }
      try {
        playback.pause()
        playback.srcObject = null
      } catch {
        // Ignore.
      }
      try {
        AudioContextCtor?.name
      } catch {
        // Unused, kept for future local audio graphs.
      }
      peer.close()
    },
  }
}
