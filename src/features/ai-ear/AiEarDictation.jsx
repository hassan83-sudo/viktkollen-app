import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createAiEarDictation, isAiEarDictationSupported } from '../../services/aiEarDictation.js'

/**
 * AI-EAR-2C: Tal → text panel in AI Örat. The browser's SpeechRecognition
 * does the work (services/aiEarDictation.js); nothing is uploaded, stored or
 * billed by Viktkollen.
 *
 * Accessibility:
 * - one polite status region: "Lyssnar…" when the session starts, "Klart"
 *   when it ends, "Kopierat" / "Texten är rensad." after those actions;
 * - interim text is shown visually but is outside the live region, so a
 *   screen reader is not interrupted while the user speaks;
 * - the transcript is plain text under its own heading;
 * - Start and Stop are one button, so focus stays on it when it changes;
 *   focus never moves when text arrives. After "Rensa" (whose button then
 *   disappears) focus goes back to that button.
 *
 * Unmounting (mode change or leaving AI Örat) aborts the recognition and
 * releases the microphone; no callback runs afterwards.
 */
const defaultDeps = {
  createDictation: createAiEarDictation,
  isSupported: isAiEarDictationSupported,
  writeClipboard: (text) => navigator.clipboard.writeText(text),
}

export default function AiEarDictation({ deps: depsOverride, microphoneBusy = false } = {}) {
  const { t } = useTranslation('aiEar')
  const [deps] = useState(() => ({ ...defaultDeps, ...depsOverride }))
  const [supported] = useState(() => deps.isSupported())
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const controllerRef = useRef(null)
  const toggleRef = useRef(null)
  // Whether this listening session produced text (decides the "Klart" line).
  const sessionTextRef = useRef(false)

  useEffect(() => {
    if (!supported) return undefined
    const controller = deps.createDictation({
      onEnd: () => {
        setListening(false)
        setInterim('')
        setAnnouncement(sessionTextRef.current ? t('dictation.done') : '')
      },
      onError: (code) => {
        setListening(false)
        setInterim('')
        setAnnouncement('')
        setErrorCode(code)
      },
      onFinal: (text) => {
        sessionTextRef.current = true
        setTranscript((current) => (current ? `${current} ${text}` : text))
      },
      onInterim: (text) => setInterim(text),
      onStart: () => {
        setListening(true)
        setAnnouncement(t('dictation.listening'))
      },
    })
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [deps, supported, t])

  function start() {
    // MediaRecorder and SpeechRecognition never hold the microphone together.
    if (microphoneBusy || !controllerRef.current) return
    setErrorCode('')
    setAnnouncement('')
    sessionTextRef.current = false
    controllerRef.current.start()
  }

  function stop() {
    controllerRef.current?.stop()
  }

  async function copy() {
    try {
      await deps.writeClipboard(transcript)
      setAnnouncement(t('dictation.copied'))
    } catch {
      setAnnouncement(t('dictation.copyFailed'))
    }
  }

  function clear() {
    setTranscript('')
    setAnnouncement(t('dictation.cleared'))
    toggleRef.current?.focus()
  }

  if (!supported) {
    return (
      <div className="ai-ear-error ai-ear-dictation-unsupported" role="status">
        <h5>{t('dictation.unsupported.title')}</h5>
        <p>{t('dictation.unsupported.body')}</p>
      </div>
    )
  }

  return (
    <div className="ai-ear-dictation">
      <p className="ai-ear-privacy" id="ai-ear-dictation-privacy">{t('dictation.privacy')}</p>
      <div className="ai-ear-actions">
        <button
          aria-describedby={listening ? undefined : 'ai-ear-dictation-privacy'}
          className="primary-button"
          ref={toggleRef}
          type="button"
          onClick={listening ? stop : start}
        >
          {listening ? t('dictation.stop') : t('dictation.start')}
        </button>
      </div>
      <p className="ai-ear-status" role="status">{announcement}</p>
      {listening && interim && (
        <p className="ai-ear-interim"><span className="ai-ear-result-label">{t('dictation.interimLabel')}: </span>{interim}</p>
      )}
      {errorCode && (
        <div className="ai-ear-error" role="alert">
          <h5>{t(`dictation.errors.${errorCode}.title`)}</h5>
          <p>{t(`dictation.errors.${errorCode}.body`)}</p>
          <div className="ai-ear-actions">
            <button className="secondary-button" type="button" onClick={start}>{t('retry')}</button>
          </div>
        </div>
      )}
      <section aria-labelledby="ai-ear-transcript-title" className="ai-ear-transcript">
        <h5 id="ai-ear-transcript-title">{t('dictation.transcriptTitle')}</h5>
        {transcript ? <p className="ai-ear-transcript-text">{transcript}</p> : <p>{t('dictation.empty')}</p>}
        {transcript && (
          <div className="ai-ear-actions">
            <button className="secondary-button" type="button" onClick={copy}>{t('dictation.copy')}</button>
            <button className="secondary-button" type="button" onClick={clear}>{t('dictation.clear')}</button>
          </div>
        )}
      </section>
    </div>
  )
}
