import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AI_EAR_HUMMING_MAX_SECONDS, AI_EAR_MAX_INPUT_BYTES, AI_EAR_MAX_SECONDS, blobToAiEarWav } from '../../services/aiEarAudio.js'
import { loadAiEarHummingAccess } from '../../services/aiEarHummingAccess.js'
import { identifyHumming } from '../../services/aiEarProviders.js'
import { interpretAiEarAudio } from '../../services/aiEarInterpret.js'
import AiEarDictation from './AiEarDictation.jsx'
import { aiEarModes, defaultAiEarModeId, getAiEarMode } from './aiEarModes.js'
import { buildAiEarErrorView, buildAiEarModeView, buildHummingView } from './aiEarViewModel.js'
import { useAiEarRecorder } from './useAiEarRecorder.js'
import './AiEarMode.css'

/**
 * AI-örat (Smart kamera-läge, bakom featureflaggan `aiEar`, default AV).
 *
 * AI-EAR-1: fyra lägen (Ljudigenkänning, Fågelljud, Tal → text, Humma /
 * sjung) i samma vy. Ljud och fågel använder samma server-hop nedan och visar
 * resultatet på olika sätt. Tal → text (AI-EAR-2C) använder webbläsarens
 * taligenkänning (AiEarDictation.jsx), utan server. Humma / sjung skickar
 * klippet till /api/ai-ear-humming-recognition efter ett uttryckligt tryck.
 *
 * Flöde: spela in (max 12 s) eller välj en ljudfil -> ljudet görs om till WAV på
 * enheten -> användaren trycker uttryckligen "Analysera ljudet" (det är
 * godkännandet) -> vår server-hop /api/ai-ear/interpret -> resultat.
 *
 * AI-EAR-2B: mikrofonen (getUserMedia, MediaRecorder, timer, maxtid,
 * uppstädning) ägs av useAiEarRecorder.js. Här finns flödet runt den.
 *
 * Ljudet hålls bara i minnet under sessionen: det sparas aldrig, skrivs aldrig
 * till localStorage/databas och loggas aldrig. Inga Google-uppgifter finns i
 * klienten. Alla tolkningar (state/speciesDisposition/text) kommer från backend;
 * inga poäng eller trösklar hanteras här.
 */

// Humma / sjung wants the raw voice: the browser's call processing (echo
// cancellation, noise suppression, automatic gain) flattens sung pitch. Plain
// values are preferences, so a browser that cannot turn one off still records.
const HUMMING_AUDIO_CONSTRAINTS = Object.freeze({
  audio: Object.freeze({ autoGainControl: false, echoCancellation: false, noiseSuppression: false }),
})
const HUMMING_AUTO_STOP = Object.freeze({})

const defaultDeps = {
  blobToWav: blobToAiEarWav,
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  identifyHumming,
  interpret: interpretAiEarAudio,
  loadHummingAccess: loadAiEarHummingAccess,
  MediaRecorderImpl: typeof MediaRecorder === 'undefined' ? null : MediaRecorder,
}

export default function AiEarMode({ deps: depsOverride, locale = 'sv-SE' } = {}) {
  const { t } = useTranslation('aiEar')
  const deps = { ...defaultDeps, ...depsOverride }
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  })

  const [phase, setPhase] = useState('idle') // idle | recording | preparing | ready | analyzing | result | error
  const [modeId, setModeId] = useState(defaultAiEarModeId)
  // Humma / sjung stays locked (no recorder, no audio sent) unless the server
  // confirms the owner account for the test period.
  const [hummingAllowed, setHummingAllowed] = useState(false)
  const baseMode = getAiEarMode(modeId)
  const mode = baseMode.id === 'melody' && hummingAllowed ? { ...baseMode, execution: 'humming' } : baseMode
  const isHumming = mode.execution === 'humming'
  const maxSeconds = isHumming ? AI_EAR_HUMMING_MAX_SECONDS : AI_EAR_MAX_SECONDS
  // Modes cannot change while the microphone or a request is active.
  const busy = phase === 'recording' || phase === 'preparing' || phase === 'analyzing'
  const [view, setView] = useState(null)
  const [truncated, setTruncated] = useState(false)
  // Mirrors wavRef for rendering (the Retry button needs a prepared recording).
  const [hasWav, setHasWav] = useState(false)

  const mountedRef = useRef(true)
  const wavRef = useRef(null)
  const controllerRef = useRef(null)
  const busyRef = useRef(false)

  // The recorder hook stops the microphone on unmount; this aborts an
  // in-flight analysis and drops the prepared audio.
  useEffect(() => {
    const load = depsRef.current.loadHummingAccess
    if (typeof load !== 'function') return undefined
    const controller = new AbortController()
    Promise.resolve(load({ signal: controller.signal }))
      .then((allowed) => {
        if (!controller.signal.aborted) setHummingAllowed(allowed === true)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort('unmount')
      wavRef.current = null
    }
  }, [])

  function showError(reason) {
    if (!mountedRef.current) return
    setView(buildAiEarErrorView(reason, t))
    setPhase('error')
  }

  async function prepareBlob(blob, { autoAnalyze = false } = {}) {
    setPhase('preparing')
    try {
      const prepared = await depsRef.current.blobToWav(blob, { maxSeconds })
      if (!mountedRef.current) return
      wavRef.current = prepared.wav
      setHasWav(true)
      setTruncated(prepared.truncated === true)
      setPhase('ready')
      // Humma / sjung: tapping the microphone, under the ACRCloud notice, is the
      // approval to send this recording, so identification starts right away.
      if (autoAnalyze) analyze()
    } catch (error) {
      showError(error?.message || 'audio_undecodable')
    }
  }

  const recorder = useAiEarRecorder({
    audioConstraints: isHumming ? HUMMING_AUDIO_CONSTRAINTS : undefined,
    autoStop: isHumming ? HUMMING_AUTO_STOP : null,
    createLevelMeter: deps.createLevelMeter,
    getUserMedia: deps.getUserMedia,
    maxSeconds,
    MediaRecorderImpl: deps.MediaRecorderImpl,
    onError: showError,
    onInterrupted: () => {
      wavRef.current = null
      setHasWav(false)
      setPhase('idle')
    },
    onRecorded: (blob) => prepareBlob(blob, { autoAnalyze: isHumming }),
    onStart: () => {
      wavRef.current = null
      setHasWav(false)
      setPhase('recording')
    },
  })
  const seconds = recorder.seconds

  function startRecording() {
    if (phase === 'recording') return
    recorder.start()
  }

  function stopRecording() {
    recorder.stop()
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
    if (mode.execution === 'local') {
      setView({
        alternatives: [],
        body: t(`modes.${mode.id}.unavailable`),
        contextLines: [],
        hints: [],
        retryable: false,
        species: [],
        title: t(`modes.${mode.id}.title`),
      })
      setPhase('error')
      return
    }
    busyRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setPhase('analyzing')
    // Trycket på "Analysera ljudet" är det uttryckliga godkännandet att skicka just den här inspelningen.
    const outcome = mode.execution === 'humming'
      ? await depsRef.current.identifyHumming({ consentApproved: true, signal: controller.signal, wav: wavRef.current })
      : await depsRef.current.interpret({ consentApproved: true, locale, signal: controller.signal, wav: wavRef.current })
    busyRef.current = false
    controllerRef.current = null
    if (!mountedRef.current) return
    if (outcome.ok) {
      setView(mode.execution === 'humming' ? buildHummingView(outcome, t) : buildAiEarModeView(outcome.result, modeId, t))
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
    setHasWav(false)
    setView(null)
    setTruncated(false)
    setPhase('idle')
  }

  function selectMode(id) {
    if (busy || id === modeId) return
    // Leaving a mode releases its microphone engine: the recorder is cancelled
    // here, and a Tal → text session is aborted when its panel unmounts.
    recorder.cancel()
    reset()
    setModeId(id)
  }

  // A11Y-8D: all copy from i18n; status text is never only an icon, colour or
  // sound. While recording, the live region announces once that the
  // microphone is on; the per-second counter is visible but not live, so a
  // screen reader is not interrupted every second.
  return (
    <section className="ai-ear" aria-labelledby="ai-ear-title">
      <div className="ai-ear-hero" aria-hidden="true"><span className="ai-ear-wave">▂▅▇▃▆</span><span className="ai-ear-hero-icon">👂</span><span className="ai-ear-wave">▆▃▇▅▂</span></div>
      <div className="ai-ear-kicker">♫ AI ÖRAT</div>
      <h3 id="ai-ear-title" className="ai-ear-title">{t('title')}</h3>
      <p className="ai-ear-intro">{t('intro')}</p>

      {/* AI-EAR-1: four modes as one native radio group. Each card is the
          radio's label, so the whole card is the target and arrow keys move
          between modes. GRATIS/PREMIUM is the verified launch access (see
          aiEarModes.js), shown as text. */}
      <fieldset className="ai-ear-modes" disabled={busy}>
        <legend>{t('modes.legend')}</legend>
        {aiEarModes.map((entry) => (
          <label className={`ai-ear-mode-card${entry.id === modeId ? ' is-selected' : ''}`} key={entry.id}>
            <input checked={entry.id === modeId} name="ai-ear-mode" type="radio" value={entry.id} onChange={() => selectMode(entry.id)} />
            <span className="ai-ear-mode-text">
              {/* Spaces between the parts keep them separate words in the
                  radio's name, whatever the layout. */}
              <span className="ai-ear-mode-title"><span aria-hidden="true">{entry.icon} </span>{t(`modes.${entry.id}.title`)}</span>{' '}
              <span className="ai-ear-mode-description">{t(`modes.${entry.id}.description`)}</span>{' '}
              <span className={`ai-ear-mode-access is-${entry.access}`}>{t(`modes.access.${entry.access}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="ai-ear-workspace"><h4 className="ai-ear-mode-heading" id="ai-ear-mode-title">{t(`modes.${mode.id}.title`)}</h4>
      <p className="ai-ear-mode-instruction">{t(`modes.${mode.id}.instruction`)}</p>

      {(!mode.execution || mode.execution === 'local') && <p className="ai-ear-premium">{t(`modes.${mode.id}.unavailable`)}</p>}

      {mode.execution === 'browser' && <AiEarDictation deps={deps.dictation} microphoneBusy={recorder.recording} />}

      {isHumming && phase === 'idle' && (
        <>
          <p className="ai-ear-privacy" id="ai-ear-humming-start-notice">{t('modes.melody.sendNotice')}</p>
          <p className="ai-ear-privacy">{t('modes.melody.autoStopHint')}</p>
        </>
      )}

      {(mode.execution === 'interpret' || mode.execution === 'humming') && phase === 'idle' && (
        <div className="ai-ear-actions">
          <button aria-describedby={isHumming ? 'ai-ear-humming-start-notice' : undefined} className="primary-button" type="button" onClick={startRecording}>{t('record')}</button>
          <label className="secondary-button ai-ear-file">
            {t('chooseFile')}
            <input type="file" accept="audio/*" onChange={onFileChosen} />
          </label>
        </div>
      )}

      {phase === 'recording' && (
        <div className="ai-ear-recording">
          <p className="ai-ear-status" role="status">{t('recordingStatus')}</p>
          <p className="ai-ear-mic">
            <span aria-hidden="true">● </span>
            {t('recordingProgress', { max: maxSeconds, seconds })}
          </p>
          {isHumming ? <p className="ai-ear-privacy">{t('modes.melody.autoStopHint')}</p> : null}
          <button className="primary-button" type="button" onClick={stopRecording}>{t('stopRecording')}</button>
        </div>
      )}

      {phase === 'preparing' && <p className="ai-ear-status" role="status">{t('preparing')}</p>}

      {phase === 'ready' && (
        <div className="ai-ear-ready">
          <p>{truncated ? t('readyTruncated', { max: maxSeconds }) : t('ready')}</p>
          <p className="ai-ear-privacy" id="ai-ear-privacy">{t('privacy')}</p>
          {mode.execution === 'humming' ? <p className="ai-ear-privacy" id="ai-ear-humming-privacy">{t('modes.melody.sendNotice')}</p> : null}
          <div className="ai-ear-actions">
            <button aria-describedby={mode.execution === 'humming' ? 'ai-ear-privacy ai-ear-humming-privacy' : 'ai-ear-privacy'} className="primary-button" type="button" onClick={analyze}>{t('analyze')}</button>
            <button className="secondary-button" type="button" onClick={reset}>{t('newRecording')}</button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="ai-ear-analyzing" role="status" aria-busy="true">
          <span className="ai-ear-spinner" aria-hidden="true" />
          <p>{t('analyzing')}</p>
          <button className="secondary-button" type="button" onClick={cancelAnalysis}>{t('cancel')}</button>
        </div>
      )}

      {phase === 'result' && view && (
        <div className={`ai-ear-result is-${view.kind}`} role="status">
          {view.label && <p className="ai-ear-result-label">{view.label}</p>}
          <h5>{view.title}</h5>
          {view.body && <p>{view.body}</p>}
          {view.alternatives.length > 0 && (
            <>
              <p className="ai-ear-result-label">{view.alternativesLabel || t('modes.bird.alternatives')}</p>
              <ul className="ai-ear-alternatives">{view.alternatives.map((line) => <li key={line}>{line}</li>)}</ul>
            </>
          )}
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
          <button className="secondary-button" type="button" onClick={reset}>{t('newRecording')}</button>
        </div>
      )}

      {phase === 'error' && view && (
        <div className="ai-ear-error" role="alert">
          <h5>{view.title}</h5>
          <p>{view.body}</p>
          <div className="ai-ear-actions">
            {view.retryable && hasWav && <button className="primary-button" type="button" onClick={analyze}>{t('retry')}</button>}
            <button className="secondary-button" type="button" onClick={reset}>{t('newRecording')}</button>
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
