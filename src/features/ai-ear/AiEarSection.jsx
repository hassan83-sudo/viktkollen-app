import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const categoryIds = ['music', 'hum', 'birds', 'vehicles', 'other']

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

function AiEarSection() {
  const { t } = useTranslation('aiEar')
  const [selectedCategory, setSelectedCategory] = useState('music')
  const [phase, setPhase] = useState('idle') // idle | requesting | recording | stopped
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioUrlRef = useRef(null)

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
    setAudioUrl(null)
    setElapsedSeconds(0)
    setPhase('idle')
    startRecording()
  }

  function deleteRecording() {
    revokeAudioUrl()
    setAudioUrl(null)
    setElapsedSeconds(0)
    setErrorMessage('')
    setPhase('idle')
  }

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
            onClick={() => setSelectedCategory(categoryId)}
          >
            <span aria-hidden="true">{t(`categories.${categoryId}.icon`)}</span>
            <strong>{t(`categories.${categoryId}.title`)}</strong>
          </button>
        ))}
      </div>
      <p className="estimate-note">
        {t('selectedCategory', { category: t(`categories.${selectedCategory}.title`) })}
      </p>

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
