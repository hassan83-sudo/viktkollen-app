import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analyzeAudio } from '../../services/aiEar/analyzeAudio.js'
import { vehicleSubcategories } from '../../services/aiEar/audioResultModel.js'

const categoryIds = ['music', 'lyrics', 'hum', 'birds', 'vehicles', 'other']

function isRecordingSupported() {
  return typeof window !== 'undefined'
    && !!window.navigator?.mediaDevices?.getUserMedia
    && typeof window.MediaRecorder !== 'undefined'
}

function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatConfidence(confidence) {
  if (typeof confidence !== 'number') return null
  return `${Math.round(confidence * 100)}%`
}

function AiEarSection() {
  const { t } = useTranslation('aiEar')
  const [selectedCategory, setSelectedCategory] = useState('music')
  const [selectedVehicleSubcategory, setSelectedVehicleSubcategory] = useState('car')
  const [phase, setPhase] = useState('idle') // idle | requesting | recording | stopped | analyzing | result
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [analysisOutcome, setAnalysisOutcome] = useState(null)
  // Music (Sprint 4, AudD) and Nynna & vissla (Sprint 6, ACRCloud) are
  // the only categories that ever send the recorded clip anywhere - each
  // gets its OWN consent gate with its own wording, never shared, since a
  // different external provider receives the clip for each. Every other
  // category never sets either of these and keeps calling runAnalysis()
  // immediately, unchanged from Sprint 3.
  const [awaitingMusicConsent, setAwaitingMusicConsent] = useState(false)
  const [awaitingHumConsent, setAwaitingHumConsent] = useState(false)
  const [awaitingLyricsConsent, setAwaitingLyricsConsent] = useState(false)

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioUrlRef = useRef(null)
  const audioBlobRef = useRef(null)

  function clearTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function stopMicrophone() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  function revokeAudioUrl() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }

  useEffect(() => {
    // Stop the microphone and release all resources whenever the user
    // leaves AI-örat (component unmount), not only when they press Stoppa.
    return () => {
      clearTimer()
      stopMicrophone()
      revokeAudioUrl()
    }
  }, [])

  async function startRecording() {
    setErrorMessage('')
    setAnalysisOutcome(null)

    if (!isRecordingSupported()) {
      setErrorMessage(t('unsupported.message'))
      return
    }

    setPhase('requesting')

    let stream
    try {
      stream = await window.navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setPhase('idle')
      setErrorMessage(t('permissionDenied.message'))
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    let recorder
    try {
      recorder = new window.MediaRecorder(stream)
    } catch {
      stopMicrophone()
      setPhase('idle')
      setErrorMessage(t('unsupported.message'))
      return
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onstop = () => {
      stopMicrophone()
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      chunksRef.current = []
      audioBlobRef.current = blob
      revokeAudioUrl()
      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url
      setAudioUrl(url)
      setPhase('stopped')
    }

    recorderRef.current = recorder
    recorder.start()
    setPhase('recording')
    setElapsedSeconds(0)
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)
  }

  function stopRecording() {
    clearTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    } else {
      stopMicrophone()
      setPhase('stopped')
    }
  }

  function recordAgain() {
    revokeAudioUrl()
    audioBlobRef.current = null
    setAudioUrl(null)
    setElapsedSeconds(0)
    setAnalysisOutcome(null)
    setAwaitingMusicConsent(false)
    setAwaitingHumConsent(false)
    setAwaitingLyricsConsent(false)
    setPhase('idle')
    startRecording()
  }

  function deleteRecording() {
    revokeAudioUrl()
    audioBlobRef.current = null
    setAudioUrl(null)
    setElapsedSeconds(0)
    setErrorMessage('')
    setAnalysisOutcome(null)
    setAwaitingMusicConsent(false)
    setAwaitingHumConsent(false)
    setAwaitingLyricsConsent(false)
    setPhase('idle')
  }

  async function runAnalysis({ consentApproved = false } = {}) {
    if (!audioBlobRef.current) return
    setPhase('analyzing')
    const outcome = await analyzeAudio({
      audioBlob: audioBlobRef.current,
      category: selectedCategory,
      consentApproved,
      subcategory: selectedCategory === 'vehicles' ? selectedVehicleSubcategory : null,
    })
    setAnalysisOutcome(outcome)
    setPhase('result')
  }

  // Music (Sprint 4) and Nynna & vissla (Sprint 6) are the only categories
  // whose analysis leaves the device, so each goes through its OWN
  // explicit consent step first instead of calling runAnalysis() straight
  // away - never a shared one, since a different external provider
  // receives the clip for each. Every other category behaves exactly as
  // in Sprint 3: an immediate, local, always "not-connected" call.
  function requestAnalysis() {
    if (selectedCategory === 'music') {
      setAwaitingMusicConsent(true)
      return
    }
    if (selectedCategory === 'hum') {
      setAwaitingHumConsent(true)
      return
    }
    if (selectedCategory === 'lyrics') {
      setAwaitingLyricsConsent(true)
      return
    }
    runAnalysis()
  }

  function confirmMusicConsent() {
    setAwaitingMusicConsent(false)
    runAnalysis({ consentApproved: true })
  }

  function cancelMusicConsent() {
    setAwaitingMusicConsent(false)
  }

  function confirmHumConsent() {
    setAwaitingHumConsent(false)
    runAnalysis({ consentApproved: true })
  }

  function cancelHumConsent() {
    setAwaitingHumConsent(false)
  }

  function confirmLyricsConsent() {
    setAwaitingLyricsConsent(false)
    runAnalysis({ consentApproved: true })
  }

  function cancelLyricsConsent() {
    setAwaitingLyricsConsent(false)
  }

  const isVehicleCategory = selectedCategory === 'vehicles'

  return (
    <article className="panel" id="ai-ear">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2>{t('title')}</h2>
        </div>
      </div>
      <p>{t('intro')}</p>

      <div className="wellbeing-quick-grid" role="group" aria-label={t('categoryGroupLabel')}>
        {categoryIds.map((categoryId) => (
          <button
            aria-pressed={selectedCategory === categoryId}
            className={selectedCategory === categoryId ? 'is-selected' : ''}
            key={categoryId}
            type="button"
            onClick={() => {
              setSelectedCategory(categoryId)
              setAwaitingMusicConsent(false)
              setAwaitingHumConsent(false)
              setAwaitingLyricsConsent(false)
            }}
          >
            <span aria-hidden="true">{t(`categories.${categoryId}.icon`)}</span>
            <strong>{t(`categories.${categoryId}.title`)}</strong>
          </button>
        ))}
      </div>
      <p className="estimate-note">
        {t('selectedCategory', { category: t(`categories.${selectedCategory}.title`) })}
      </p>

      {isVehicleCategory && (
        <div className="wellbeing-quick-grid" role="group" aria-label={t('vehicleSubcategoryGroupLabel')}>
          {vehicleSubcategories.map((subcategoryId) => (
            <button
              aria-pressed={selectedVehicleSubcategory === subcategoryId}
              className={selectedVehicleSubcategory === subcategoryId ? 'is-selected' : ''}
              key={subcategoryId}
              type="button"
              onClick={() => setSelectedVehicleSubcategory(subcategoryId)}
            >
              <strong>{t(`vehicleSubcategories.${subcategoryId}`)}</strong>
            </button>
          ))}
        </div>
      )}

      {phase === 'idle' && (
        <>
          <button className="primary-button" type="button" onClick={startRecording}>
            {t('start.title')}
          </button>
          <p className="estimate-note">{t('start.note')}</p>
        </>
      )}

      {phase === 'requesting' && (
        <p className="estimate-note" role="status" aria-live="polite">{t('requestingPermission')}</p>
      )}

      {phase === 'recording' && (
        <>
          <p className="form-success" role="status" aria-live="polite">
            {'● '}{t('listening.status')} {formatElapsed(elapsedSeconds)}
          </p>
          <button className="primary-button" type="button" onClick={stopRecording}>
            {t('listening.stop')}
          </button>
        </>
      )}

      {phase === 'stopped' && audioUrl && (
        <>
          <p className="form-success" role="status" aria-live="polite">{t('afterStop.title')}</p>
          <audio controls src={audioUrl} />
          <div className="wellbeing-actions">
            <button className="secondary-button" type="button" onClick={recordAgain}>
              {t('afterStop.recordAgain')}
            </button>
            <button className="secondary-button" type="button" onClick={deleteRecording}>
              {t('afterStop.delete')}
            </button>
          </div>
          {!awaitingMusicConsent && !awaitingHumConsent && !awaitingLyricsConsent && (
            <button className="primary-button" type="button" onClick={requestAnalysis}>
              {t('analyze.button')}
            </button>
          )}
          {awaitingMusicConsent && (
            <div className="wellbeing-accordion-content">
              <p>{t('consent.body')}</p>
              <div className="wellbeing-actions">
                <button className="primary-button" type="button" onClick={confirmMusicConsent}>
                  {t('consent.confirm')}
                </button>
                <button className="secondary-button" type="button" onClick={cancelMusicConsent}>
                  {t('consent.cancel')}
                </button>
              </div>
            </div>
          )}
          {awaitingHumConsent && (
            <div className="wellbeing-accordion-content">
              <p>{t('humConsent.body')}</p>
              <div className="wellbeing-actions">
                <button className="primary-button" type="button" onClick={confirmHumConsent}>
                  {t('humConsent.confirm')}
                </button>
                <button className="secondary-button" type="button" onClick={cancelHumConsent}>
                  {t('humConsent.cancel')}
                </button>
              </div>
            </div>
          )}
          {awaitingLyricsConsent && (
            <div className="wellbeing-accordion-content">
              <p>{t('lyricsConsent.body')}</p>
              <div className="wellbeing-actions">
                <button className="primary-button" type="button" onClick={confirmLyricsConsent}>
                  {t('lyricsConsent.confirm')}
                </button>
                <button className="secondary-button" type="button" onClick={cancelLyricsConsent}>
                  {t('lyricsConsent.cancel')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'analyzing' && (
        <p className="estimate-note" role="status" aria-live="polite">{t('analyze.inProgress')}</p>
      )}

      {phase === 'result' && audioUrl && (
        <>
          <audio controls src={audioUrl} />

          {analysisOutcome?.ok && typeof analysisOutcome.transcript?.transcript === 'string' ? (
            <div className="wellbeing-accordion-content">
              {analysisOutcome.transcript.transcript && !analysisOutcome.transcript.noSpeech ? (
                <>
                  <p className="form-success" role="status" aria-live="polite">{t('result.lyricsHeardLabel')}</p>
                  {/* The transcript is the user's own analysis result text, rendered
                      as plain text only (React escapes it automatically) - never as
                      HTML, never evaluated as code/commands. See
                      audioResultModel.createLyricsTranscriptionResult. */}
                  <p>&ldquo;{analysisOutcome.transcript.transcript}&rdquo;</p>
                </>
              ) : (
                <p className="form-success" role="status" aria-live="polite">{t('result.lyricsNoSpeech')}</p>
              )}
              <p className="estimate-note">{t('result.lyricsSearchNotConnected')}</p>
            </div>
          ) : analysisOutcome?.ok && analysisOutcome.matched !== false ? (
            <div className="wellbeing-accordion-content">
              <p className="form-success" role="status" aria-live="polite">
                {t('result.mainHitLabel')}: {analysisOutcome.result.title}
              </p>
              {analysisOutcome.result.subtitle && <p>{analysisOutcome.result.subtitle}</p>}
              {formatConfidence(analysisOutcome.result.confidence) && (
                <p className="estimate-note">
                  {t('result.confidenceLabel', { percent: formatConfidence(analysisOutcome.result.confidence) })}
                </p>
              )}
              {analysisOutcome.result.details && (
                <p className="estimate-note">
                  {[
                    analysisOutcome.result.details.album,
                    analysisOutcome.result.details.releaseYear,
                    analysisOutcome.result.details.provider,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              {analysisOutcome.result.alternatives.length > 0 && (
                <>
                  <p className="estimate-note">{t('result.alternativesLabel')}</p>
                  <ul>
                    {analysisOutcome.result.alternatives.map((alternative) => (
                      <li key={alternative.title}>
                        {alternative.title}
                        {formatConfidence(alternative.confidence) ? ` (${formatConfidence(alternative.confidence)})` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : analysisOutcome?.ok && analysisOutcome.matched === false ? (
            <p className="form-success" role="status" aria-live="polite">{t(selectedCategory === 'hum' ? 'result.noMatchMelody' : 'result.noMatch')}</p>
          ) : (
            <p className="wellbeing-urgent" role="status" aria-live="polite">
              {analysisOutcome?.reason === 'error' ? t('result.error') : t('result.notConnected')}
            </p>
          )}

          {!awaitingMusicConsent && !awaitingHumConsent && !awaitingLyricsConsent && (
            <div className="wellbeing-actions">
              <button className="secondary-button" type="button" onClick={requestAnalysis}>
                {t('result.retryAnalysis')}
              </button>
              <button className="secondary-button" type="button" onClick={recordAgain}>
                {t('afterStop.recordAgain')}
              </button>
            </div>
          )}
          {awaitingMusicConsent && (
            <div className="wellbeing-accordion-content">
              <p>{t('consent.body')}</p>
              <div className="wellbeing-actions">
                <button className="primary-button" type="button" onClick={confirmMusicConsent}>
                  {t('consent.confirm')}
                </button>
                <button className="secondary-button" type="button" onClick={cancelMusicConsent}>
                  {t('consent.cancel')}
                </button>
              </div>
            </div>
          )}
          {awaitingHumConsent && (
            <div className="wellbeing-accordion-content">
              <p>{t('humConsent.body')}</p>
              <div className="wellbeing-actions">
                <button className="primary-button" type="button" onClick={confirmHumConsent}>
                  {t('humConsent.confirm')}
                </button>
                <button className="secondary-button" type="button" onClick={cancelHumConsent}>
                  {t('humConsent.cancel')}
                </button>
              </div>
            </div>
          )}
          {awaitingLyricsConsent && (
            <div className="wellbeing-accordion-content">
              <p>{t('lyricsConsent.body')}</p>
              <div className="wellbeing-actions">
                <button className="primary-button" type="button" onClick={confirmLyricsConsent}>
                  {t('lyricsConsent.confirm')}
                </button>
                <button className="secondary-button" type="button" onClick={cancelLyricsConsent}>
                  {t('lyricsConsent.cancel')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {errorMessage && (
        <p className="wellbeing-urgent" role="alert">{errorMessage}</p>
      )}

      <p className="estimate-note">{t('privacyNote')}</p>
    </article>
  )
}

export default AiEarSection
