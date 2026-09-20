import { useCallback, useEffect, useRef, useState } from 'react'

import { AI_EAR_MAX_INPUT_BYTES, AI_EAR_MAX_SECONDS, blobToAiEarWav } from '../../services/aiEarAudio.js'
import { interpretAiEarAudio } from '../../services/aiEarInterpret.js'
import { identifyHumming, identifyMusic, loadAiEarProviderStatus, transcribeSpeech } from '../../services/aiEarProviders.js'
import {
  buildAiEarErrorView,
  buildAiEarHummingView,
  buildAiEarMusicView,
  buildAiEarResultView,
  buildAiEarTranscriptionView,
} from './aiEarViewModel.js'
import './AiEarMode.css'

/**
 * AI-örat (Smart kamera-läge, featureflaggan `aiEar` + serverbrytaren AI_EAR_ENABLED).
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
  identifyHumming,
  identifyMusic,
  interpret: interpretAiEarAudio,
  loadProviderStatus: loadAiEarProviderStatus,
  MediaRecorderImpl: typeof MediaRecorder === 'undefined' ? null : MediaRecorder,
  transcribeSpeech,
}

/*
 * Sprint 12A: dagens fågel/ljudanalys (Perch/YAMNet) PLUS tre externa funktioner.
 * Varje läge har sin egen server-endpoint, sitt eget samtycke och sin egen leverantör;
 * ett fel i ett läge påverkar aldrig de andra. Lägen utan serverkonfiguration visas inte.
 */
const modeCopy = {
  humming: {
    analyzeLabel: 'Identifiera melodin',
    feature: 'humming',
    intro: 'Nynna, vissla eller sjung melodin så försöker AI-örat hitta vilken låt det är.',
    label: 'Nynna / vissla / sjung',
    privacy: 'När du trycker på Identifiera melodin skickas just det här ljudet till Viktkollens server, som frågar en extern meloditjänst (ACRCloud) vad du nynnade, visslade eller sjöng. Ljudet sparas inte.',
    recordLabel: 'Spela in melodin',
  },
  music: {
    analyzeLabel: 'Identifiera musiken',
    feature: 'music',
    intro: 'Spela in musik som spelas runt dig så försöker AI-örat hitta vilken låt det är.',
    label: 'Identifiera musik',
    privacy: 'När du trycker på Identifiera musiken skickas just det här ljudet till Viktkollens server, som frågar en extern musiktjänst (AudD) vilken låt det är. Ljudet sparas inte.',
    recordLabel: 'Spela in musik',
  },
  sound: {
    analyzeLabel: 'Analysera ljudet',
    feature: 'sound',
    intro: 'Spela in ett ljud eller välj en ljudfil. AI-örat säger om det låter som en fågel, tal, musik eller något annat.',
    label: 'Fåglar & ljud',
    privacy: 'När du trycker på Analysera skickas just det här ljudet till Viktkollens server för analys. Ljudet sparas inte och ingen skriver ut vad som sägs.',
    recordLabel: 'Spela in',
  },
  speech: {
    analyzeLabel: 'Skriv ut orden',
    feature: 'speech',
    intro: 'Säg eller sjung några ord så skriver AI-örat ut vad det hörde – till exempel en textrad ur en låt.',
    label: 'Ord ur en låt',
    privacy: 'När du trycker på Skriv ut orden skickas just det här ljudet till Viktkollens server, som omvandlar det till text med en extern taligenkänningstjänst (OpenAI). Ljudet och texten sparas inte.',
    recordLabel: 'Spela in orden',
  },
}
const modeOrder = ['sound', 'music', 'humming', 'speech']

export default function AiEarMode({ deps: depsOverride, locale = 'sv-SE' } = {}) {
  const deps = { ...defaultDeps, ...depsOverride }
  const depsRef = useRef(deps)
  depsRef.current = deps

  const [phase, setPhase] = useState('idle') // idle | recording | preparing | ready | analyzing | result | error
  const [seconds, setSeconds] = useState(0)
  const [view, setView] = useState(null)
  const [truncated, setTruncated] = useState(false)
  const [mode, setMode] = useState('sound')
  const [providers, setProviders] = useState({ humming: false, music: false, transcription: false })

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
    const statusController = new AbortController()
    Promise.resolve(depsRef.current.loadProviderStatus?.({ signal: statusController.signal }))
      .then((status) => { if (mountedRef.current && status) setProviders({ humming: status.humming === true, music: status.music === true, transcription: status.transcription === true }) })
      .catch(() => {})
    return () => statusController.abort('unmount')
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
    setView(buildAiEarErrorView(reason, modeCopy[mode].feature))
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
    // Trycket på analysera-knappen är det uttryckliga godkännandet att skicka just den här inspelningen
    // till just det här lägets leverantör (varje läge har eget samtycke och egen endpoint).
    const call = { consentApproved: true, signal: controller.signal, wav: wavRef.current }
    const runners = {
      humming: async () => { const o = await depsRef.current.identifyHumming(call); return o.ok ? { ...o, view: buildAiEarHummingView(o) } : o },
      music: async () => { const o = await depsRef.current.identifyMusic(call); return o.ok ? { ...o, view: buildAiEarMusicView(o) } : o },
      sound: async () => { const o = await depsRef.current.interpret({ ...call, locale }); return o.ok ? { ...o, view: buildAiEarResultView(o.result) } : o },
      speech: async () => { const o = await depsRef.current.transcribeSpeech(call); return o.ok ? { ...o, view: buildAiEarTranscriptionView(o) } : o },
    }
    let outcome
    try {
      outcome = await runners[mode]()
    } catch {
      outcome = { ok: false, reason: 'service_unavailable' }
    }
    busyRef.current = false
    controllerRef.current = null
    if (!mountedRef.current) return
    if (outcome.ok) {
      setView(outcome.view)
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

  function chooseMode(next) {
    if (next === mode || phase === 'recording' || phase === 'analyzing' || phase === 'preparing') return
    reset()
    setMode(next)
  }

  const copy = modeCopy[mode]
  const availableModes = modeOrder.filter((id) => id === 'sound' || (id === 'music' && providers.music) || (id === 'humming' && providers.humming) || (id === 'speech' && providers.transcription))

  return (
    <section className="ai-ear" aria-labelledby="ai-ear-title">
      <h3 id="ai-ear-title" className="ai-ear-title">AI Örat</h3>
      {availableModes.length > 1 && (
        <nav className="ai-ear-modes" aria-label="Välj vad AI-örat ska lyssna efter">
          {availableModes.map((id) => (
            <button key={id} className={`ai-ear-mode${id === mode ? ' is-active' : ''}`} type="button" aria-pressed={id === mode} disabled={phase === 'recording' || phase === 'analyzing' || phase === 'preparing'} onClick={() => chooseMode(id)}>
              {modeCopy[id].label}
            </button>
          ))}
        </nav>
      )}
      <p className="ai-ear-intro">{copy.intro}</p>

      {phase === 'idle' && (
        <div className="ai-ear-actions">
          <button className="primary-button" type="button" onClick={startRecording}>{copy.recordLabel}</button>
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
          <p className="ai-ear-privacy">{copy.privacy}</p>
          <div className="ai-ear-actions">
            <button className="primary-button" type="button" onClick={analyze}>{copy.analyzeLabel}</button>
            <button className="secondary-button" type="button" onClick={reset}>Ny inspelning</button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="ai-ear-analyzing" role="status" aria-live="polite" aria-busy="true">
          <span className="ai-ear-spinner" aria-hidden="true" />
          <p>{mode === 'sound' ? 'AI-örat lyssnar… Första gången kan det ta upp till en halv minut.' : 'AI-örat lyssnar… Det kan ta en liten stund.'}</p>
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
          {view.quote && <blockquote className="ai-ear-quote">{view.quote}</blockquote>}
          {view.details?.length > 0 && (
            <ul className="ai-ear-details">{view.details.map((line) => <li key={line}>{line}</li>)}</ul>
          )}
          {view.alternatives?.length > 0 && (
            <div className="ai-ear-alternatives">
              <p>Andra möjligheter:</p>
              <ul>{view.alternatives.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
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
