import { useCallback, useEffect, useRef, useState } from 'react'

import { AI_EAR_MAX_INPUT_BYTES, AI_EAR_MAX_SECONDS, blobToAiEarWav } from '../../services/aiEarAudio.js'
import { interpretAiEarAudio } from '../../services/aiEarInterpret.js'
import { buildAiEarErrorView, buildAiEarResultView } from './aiEarViewModel.js'
import './AiEarMode.css'

/**
 * AI-örat (Smart kamera-läge, bakom featureflaggan `aiEar`, default AV).
 *
 * Flöde: spela in (max 12 s) eller välj en ljudfil -> ljudet görs om till WAV på
 * enheten -> användaren trycker uttryckligen "Analysera ljudet" (det är
 * godkännandet) -> vår server-hop /api/ai-ear/interpret -> resultat.
 *
 * Ljudet hålls bara i minnet under sessionen: det sparas aldrig, skrivs aldrig
 * till localStorage/databas och loggas aldrig. Inga Google-uppgifter finns i
 * klienten. Alla tolkningar (state/speciesDisposition/text) kommer från backend;
 * inga poäng eller trösklar hanteras här.
 */

const defaultDeps = {
  blobToWav: blobToAiEarWav,
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  interpret: interpretAiEarAudio,
  MediaRecorderImpl: typeof MediaRecorder === 'undefined' ? null : MediaRecorder,
}

export default function AiEarMode({ deps: depsOverride, locale = 'sv-SE' } = {}) {
  const deps = { ...defaultDeps, ...depsOverride }
  const depsRef = useRef(deps)
  depsRef.current = deps

  const [phase, setPhase] = useState('idle') // idle | recording | preparing | ready | analyzing | result | error
  const [seconds, setSeconds] = useState(0)
  const [view, setView] = useState(null)
  const [truncated, setTruncated] = useState(false)

  const mountedRef = useRef(true)
  const wavRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const controllerRef = useRef(null)
  const busyRef = useRef(false)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimer()
      controllerRef.current?.abort('unmount')
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        try { recorder.stop() } catch { /* already stopped */ }
      }
      recorderRef.current = null
      chunksRef.current = []
      wavRef.current = null
      stopTracks()
    }
  }, [clearTimer, stopTracks])

  function showError(reason) {
    if (!mountedRef.current) return
    setView(buildAiEarErrorView(reason))
    setPhase('error')
  }

  async function prepareBlob(blob) {
    setPhase('preparing')
    try {
      const prepared = await depsRef.current.blobToWav(blob)
      if (!mountedRef.current) return
      wavRef.current = prepared.wav
      setTruncated(prepared.truncated === true)
      setPhase('ready')
    } catch (error) {
      showError(error?.message || 'audio_undecodable')
    }
  }

  async function startRecording() {
    if (phase === 'recording') return
    const Recorder = depsRef.current.MediaRecorderImpl
    if (!Recorder || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showError('mic_unavailable')
      return
    }

    let stream
    try {
      stream = await depsRef.current.getUserMedia({ audio: true })
    } catch (error) {
      showError(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'mic_denied' : 'mic_unavailable')
      return
    }
    if (!mountedRef.current) {
      stream.getTracks?.().forEach((track) => track.stop())
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    wavRef.current = null
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
      if (mountedRef.current) prepareBlob(blob)
    }
    recorder.start()
    setSeconds(0)
    setPhase('recording')
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setSeconds(elapsed)
      if (elapsed >= AI_EAR_MAX_SECONDS) stopRecording()
    }, 250)
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  function onFileChosen(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type && !file.type.startsWith('audio/')) return showError('not_audio')
    if (file.size > AI_EAR_MAX_INPUT_BYTES) return showError('too_large')
    prepareBlob(file)
  }

  async function analyze() {
    if (busyRef.current || !wavRef.current) return
    busyRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setPhase('analyzing')
    // Trycket på "Analysera ljudet" är det uttryckliga godkännandet att skicka just den här inspelningen.
    const outcome = await depsRef.current.interpret({ consentApproved: true, locale, signal: controller.signal, wav: wavRef.current })
    busyRef.current = false
    controllerRef.current = null
    if (!mountedRef.current) return
    if (outcome.ok) {
      setView(buildAiEarResultView(outcome.result))
      setPhase('result')
      return
    }
    if (outcome.reason === 'aborted') {
      setPhase('ready')
      return
    }
    showError(outcome.reason)
  }

  function cancelAnalysis() {
    controllerRef.current?.abort('userCancel')
  }

  function reset() {
    wavRef.current = null
    setView(null)
    setTruncated(false)
    setPhase('idle')
  }

  return (
    <section className="ai-ear" aria-labelledby="ai-ear-title">
      <h3 id="ai-ear-title" className="ai-ear-title">AI Örat</h3>
      <p className="ai-ear-intro">Spela in ett ljud eller välj en ljudfil. AI-örat säger om det låter som en fågel, tal, musik eller något annat.</p>

      {phase === 'idle' && (
        <div className="ai-ear-actions">
          <button className="primary-button" type="button" onClick={startRecording}>Spela in</button>
          <label className="secondary-button ai-ear-file">
            Välj ljudfil
            <input type="file" accept="audio/*" onChange={onFileChosen} />
          </label>
        </div>
      )}

      {phase === 'recording' && (
        <div className="ai-ear-recording" role="status" aria-live="polite">
          <p className="ai-ear-mic">● Mikrofon aktiv – {seconds} s av {AI_EAR_MAX_SECONDS} s</p>
          <button className="primary-button" type="button" onClick={stopRecording}>Stoppa inspelningen</button>
        </div>
      )}

      {phase === 'preparing' && <p className="ai-ear-status" role="status" aria-live="polite">Förbereder ljudet…</p>}

      {phase === 'ready' && (
        <div className="ai-ear-ready">
          <p>Inspelningen är klar{truncated ? ` (de första ${AI_EAR_MAX_SECONDS} sekunderna analyseras)` : ''}.</p>
          <p className="ai-ear-privacy">När du trycker på Analysera skickas just det här ljudet till Viktkollens server för analys. Ljudet sparas inte och ingen skriver ut vad som sägs.</p>
          <div className="ai-ear-actions">
            <button className="primary-button" type="button" onClick={analyze}>Analysera ljudet</button>
            <button className="secondary-button" type="button" onClick={reset}>Ny inspelning</button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="ai-ear-analyzing" role="status" aria-live="polite" aria-busy="true">
          <span className="ai-ear-spinner" aria-hidden="true" />
          <p>AI-örat lyssnar… Första gången kan det ta upp till en halv minut.</p>
          <button className="secondary-button" type="button" onClick={cancelAnalysis}>Avbryt</button>
        </div>
      )}

      {phase === 'result' && view && (
        <div className={`ai-ear-result is-${view.kind}`} role="status" aria-live="polite">
          <h4>{view.title}</h4>
          {view.body && <p>{view.body}</p>}
          {view.contextLines.length > 0 && (
            <ul className="ai-ear-context">{view.contextLines.map((line) => <li key={line}>{line}</li>)}</ul>
          )}
          {view.species.length > 0 && (
            <ul className="ai-ear-species">{view.species.map((entry) => <li key={entry.text}>{entry.text}</li>)}</ul>
          )}
          {view.hints.length > 0 && (
            <ul className="ai-ear-hints">{view.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
          )}
          <p className="ai-ear-footer">{view.footer}</p>
          <button className="secondary-button" type="button" onClick={reset}>Ny inspelning</button>
        </div>
      )}

      {phase === 'error' && view && (
        <div className="ai-ear-error" role="alert">
          <h4>{view.title}</h4>
          <p>{view.body}</p>
          <div className="ai-ear-actions">
            {view.retryable && wavRef.current && <button className="primary-button" type="button" onClick={analyze}>Försök igen</button>}
            <button className="secondary-button" type="button" onClick={reset}>Ny inspelning</button>
          </div>
        </div>
      )}
    </section>
  )
}
