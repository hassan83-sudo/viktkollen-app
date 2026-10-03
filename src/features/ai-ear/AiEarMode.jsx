import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AI_EAR_MAX_INPUT_BYTES, AI_EAR_MAX_SECONDS, blobToAiEarWav } from '../../services/aiEarAudio.js'
import { interpretAiEarAudio } from '../../services/aiEarInterpret.js'
import { recognizeAiEarHumming } from '../../services/aiEarHumming.js'
import AiEarDictation from './AiEarDictation.jsx'
import { aiEarModes, defaultAiEarModeId, getAiEarMode } from './aiEarModes.js'
import { buildAiEarErrorView, buildAiEarHummingView, buildAiEarModeView } from './aiEarViewModel.js'
import { useAiEarRecorder } from './useAiEarRecorder.js'
import './AiEarMode.css'

/**
 * AI-örat (Smart kamera-läge, bakom featureflaggan `aiEar`, default AV).
 *
 * AI-EAR-1: fyra lägen (Ljudigenkänning, Fågelljud, Tal → text, Humma /
 * sjung) i samma vy. Ljud och fågel använder samma server-hop nedan och visar
 * resultatet på olika sätt. Tal → text (AI-EAR-2C) använder webbläsarens
 * taligenkänning (AiEarDictation.jsx), utan server. Humma / sjung använder
 * samma inspelning och skickar ljudet till /api/ai-ear/humming.
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

const defaultDeps = {
  blobToWav: blobToAiEarWav,
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  interpret: interpretAiEarAudio,
  recognizeHumming: recognizeAiEarHumming,
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
  const mode = getAiEarMode(modeId)
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
  // Bumps when the user starts over, so a humming response from the previous
  // attempt cannot paint its error after Ny inspelning or a restored page.
  const attemptRef = useRef(0)
  const resetRef = useRef(() => {})

  // The recorder hook stops the microphone on unmount; this aborts an
  // in-flight analysis and drops the prepared audio.
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

  async function prepareBlob(blob) {
    setPhase('preparing')
    try {
      const prepared = await depsRef.current.blobToWav(blob)
      if (!mountedRef.current) return
      wavRef.current = prepared.wav
      setHasWav(true)
      setTruncated(prepared.truncated === true)
      setPhase('ready')
    } catch (error) {
      showError(error?.message || 'audio_undecodable')
    }
  }

  const recorder = useAiEarRecorder({
    getUserMedia: deps.getUserMedia,
    maxSeconds: AI_EAR_MAX_SECONDS,
    MediaRecorderImpl: deps.MediaRecorderImpl,
    onError: showError,
    onRecorded: prepareBlob,
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
    const attempt = attemptRef.current + 1
    attemptRef.current = attempt
    busyRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setPhase('analyzing')
    // Trycket på "Analysera ljudet" är det uttryckliga godkännandet att skicka just den här inspelningen.
    const recognize = mode.execution === 'humming' ? depsRef.current.recognizeHumming : depsRef.current.interpret
    const outcome = await recognize({ consentApproved: true, locale, signal: controller.signal, wav: wavRef.current })
    if (!mountedRef.current || attempt !== attemptRef.current) return
    busyRef.current = false
    controllerRef.current = null
    if (outcome.ok) {
      setView(mode.execution === 'humming' ? buildAiEarHummingView(outcome.result, t) : buildAiEarModeView(outcome.result, modeId, t))
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
    attemptRef.current += 1
    controllerRef.current?.abort('reset')
    controllerRef.current = null
    busyRef.current = false
    recorder.cancel()
    wavRef.current = null
    setHasWav(false)
    setView(null)
    setTruncated(false)
    setPhase('idle')
  }
  resetRef.current = reset

  // A restored page (back-forward cache) keeps the old React tree, including a
  // humming error. Nothing is read back from storage; the restored error is
  // dropped so the start controls are current again.
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) resetRef.current()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

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

      <h4 className="ai-ear-mode-heading" id="ai-ear-mode-title">{t(`modes.${mode.id}.title`)}</h4>
      <p className="ai-ear-mode-instruction">{t(`modes.${mode.id}.instruction`)}</p>

      {!mode.execution && <p className="ai-ear-premium">{t(`modes.${mode.id}.unavailable`)}</p>}

      {mode.execution === 'browser' && <AiEarDictation deps={deps.dictation} microphoneBusy={recorder.recording} />}

      {(mode.execution === 'interpret' || mode.execution === 'humming') && phase === 'idle' && (
        <div className="ai-ear-actions">
          <button className="primary-button" type="button" onClick={startRecording}>{t('record')}</button>
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
            {t('recordingProgress', { max: AI_EAR_MAX_SECONDS, seconds })}
          </p>
          <button className="primary-button" type="button" onClick={stopRecording}>{t('stopRecording')}</button>
        </div>
      )}

      {phase === 'preparing' && <p className="ai-ear-status" role="status">{t('preparing')}</p>}

      {phase === 'ready' && (
        <div className="ai-ear-ready">
          <p>{truncated ? t('readyTruncated', { max: AI_EAR_MAX_SECONDS }) : t('ready')}</p>
          <p className="ai-ear-privacy" id="ai-ear-privacy">{t('privacy')}</p>
          <div className="ai-ear-actions">
            <button aria-describedby="ai-ear-privacy" className="primary-button" type="button" onClick={analyze}>{t('analyze')}</button>
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
              <p className="ai-ear-result-label">{t('modes.bird.alternatives')}</p>
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
    </section>
  )
}
