import { useCallback, useEffect, useRef, useState } from 'react'

import { AI_EAR_MAX_SECONDS } from '../../services/aiEarAudio.js'

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
 * Errors are reported through `onError(code)`: 'mic_unavailable' (no
 * MediaRecorder or getUserMedia, or the device failed) and 'mic_denied'
 * (NotAllowedError/SecurityError).
 */
export function useAiEarRecorder({
  audioConstraints = { audio: true },
  getUserMedia,
  maxSeconds = AI_EAR_MAX_SECONDS,
  MediaRecorderImpl,
  onError,
  onRecorded,
  onStart,
} = {}) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const mountedRef = useRef(true)
  const startingRef = useRef(false)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  // The latest options, so start/stop keep stable identities. Synced after
  // each render (a user can only press start after a commit).
  const optionsRef = useRef({ audioConstraints, getUserMedia, maxSeconds, MediaRecorderImpl, onError, onRecorded, onStart })
  useEffect(() => {
    optionsRef.current = { audioConstraints, getUserMedia, maxSeconds, MediaRecorderImpl, onError, onRecorded, onStart }
  })

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  // Stops everything without delivering a Blob (unmount and cancel).
  const discard = useCallback(() => {
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
    return () => {
      mountedRef.current = false
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
    let stream
    try {
      stream = await options.getUserMedia(options.audioConstraints)
    } catch (error) {
      startingRef.current = false
      if (mountedRef.current) {
        optionsRef.current.onError?.(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'mic_denied' : 'mic_unavailable')
      }
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
  }, [clearTimer, stop, stopTracks])

  return { cancel, recording, seconds, start, stop }
}
