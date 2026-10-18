import { useCallback, useEffect, useRef, useState } from 'react'

import { AI_EAR_MAX_SECONDS } from '../../services/aiEarAudio.js'
import { createHummingAutoStop, createStreamLevelMeter } from './hummingAutoStop.js'

const AUTO_STOP_FRAME_MS = 100

/**
 * AI-EAR-2B: the MediaRecorder microphone engine of AI Örat, shared by the
 * modes that record to an audio file (sound and bird today; later melody or
 * a server-side speech mode). Extracted unchanged from AiEarMode.jsx.
 *
 * It owns: getUserMedia, MediaRecorder, the elapsed-seconds timer, stop at
 * `maxSeconds`, the recorded Blob, and cleanup (tracks stopped, timer
 * cleared, recorder stopped without delivering a Blob on unmount/cancel).
 * It does NOT convert, upload or analyse audio: `onRecorded(blob)` hands the
 * Blob to the caller.
 *
 * Browser SpeechRecognition is a separate microphone engine and does not
 * belong here. The two must never hold the microphone at the same time
 * (notably on iPhone, where they compete for one audio session).
 *
 * Optional `autoStop` ({ silenceMs, minVoicedMs }, Humma / sjung only) stops
 * the recording by itself after a stretch of quiet once enough sound was
 * heard (hummingAutoStop.js). Without it, nothing changes for other modes.
 *
 * Errors are reported through `onError(code)`: 'mic_unavailable' (no
 * MediaRecorder or getUserMedia, or the device failed) and 'mic_denied'
 * (NotAllowedError/SecurityError).
 */
export function useAiEarRecorder({
  audioConstraints = { audio: true },
  autoStop = null,
  createLevelMeter = createStreamLevelMeter,
  getUserMedia,
  maxSeconds = AI_EAR_MAX_SECONDS,
  MediaRecorderImpl,
  onError,
  onInterrupted,
  onRecorded,
  onStart,
} = {}) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const mountedRef = useRef(true)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const meterRef = useRef(null)
  const meterTimerRef = useRef(null)
  // The latest options, so start/stop keep stable identities. Synced after
  // each render (a user can only press start after a commit).
  const optionsRef = useRef({ audioConstraints, autoStop, createLevelMeter, getUserMedia, maxSeconds, MediaRecorderImpl, onError, onInterrupted, onRecorded, onStart })
  useEffect(() => {
    optionsRef.current = { audioConstraints, autoStop, createLevelMeter, getUserMedia, maxSeconds, MediaRecorderImpl, onError, onInterrupted, onRecorded, onStart }
  })

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    if (meterTimerRef.current) clearInterval(meterTimerRef.current)
    meterTimerRef.current = null
    meterRef.current?.close?.()
    meterRef.current = null
  }, [])

  // Stops everything without delivering a Blob (unmount and cancel).
  const discard = useCallback(() => {
    generationRef.current += 1
    startingRef.current = false
    clearTimer()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      try { recorder.stop() } catch { /* already stopped */ }
    }
    recorderRef.current = null
    chunksRef.current = []
    stopTracks()
  }, [clearTimer, stopTracks])

  useEffect(() => {
    mountedRef.current = true

    function releaseMicrophone() {
      const wasActive = startingRef.current || recorderRef.current !== null
      discard()
      if (wasActive) optionsRef.current.onInterrupted?.()
      if (mountedRef.current) {
        setRecording(false)
        setSeconds(0)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') releaseMicrophone()
    }

    window.addEventListener('pagehide', releaseMicrophone)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mountedRef.current = false
      window.removeEventListener('pagehide', releaseMicrophone)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      discard()
    }
  }, [discard])

  // Safe to call at any time: a no-op when nothing is recording.
  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const cancel = useCallback(() => {
    discard()
    if (mountedRef.current) {
      setRecording(false)
      setSeconds(0)
    }
  }, [discard])

  const start = useCallback(async () => {
    // One microphone at a time: ignore a second start while one is pending
    // or recording.
    if (startingRef.current || recorderRef.current) return
    const options = optionsRef.current
    const Recorder = options.MediaRecorderImpl
    if (!Recorder || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      options.onError?.('mic_unavailable')
      return
    }

    startingRef.current = true
    const generation = ++generationRef.current
    let stream
    try {
      stream = await options.getUserMedia(options.audioConstraints)
    } catch (error) {
      if (generation !== generationRef.current) return
      startingRef.current = false
      if (mountedRef.current) {
        optionsRef.current.onError?.(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'mic_denied' : 'mic_unavailable')
      }
      return
    }
    if (generation !== generationRef.current || !mountedRef.current) {
      stream.getTracks?.().forEach((track) => track.stop())
      return
    }
    startingRef.current = false
    if (!mountedRef.current) {
      stream.getTracks?.().forEach((track) => track.stop())
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    const recorder = new Recorder(stream)
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      clearTimer()
      stopTracks()
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      chunksRef.current = []
      recorderRef.current = null
      if (!mountedRef.current) return
      setRecording(false)
      optionsRef.current.onRecorded?.(blob)
    }
    recorder.start()
    setSeconds(0)
    setRecording(true)
    optionsRef.current.onStart?.()
    const startedAt = Date.now()
    const limit = optionsRef.current.maxSeconds
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setSeconds(elapsed)
      if (elapsed >= limit) stop()
    }, 250)

    const auto = optionsRef.current.autoStop
    if (auto) {
      let meter = null
      try { meter = optionsRef.current.createLevelMeter?.(stream) || null } catch { meter = null }
      if (meter) {
        meterRef.current = meter
        const detector = createHummingAutoStop(auto)
        meterTimerRef.current = setInterval(() => {
          let level
          try { level = meter.read() } catch { level = 0 }
          if (detector.update(level, Date.now() - startedAt) === 'stop') stop()
        }, AUTO_STOP_FRAME_MS)
      }
    }
  }, [clearTimer, stop, stopTracks])

  return { cancel, recording, seconds, start, stop }
}
