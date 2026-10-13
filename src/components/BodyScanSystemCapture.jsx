import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getBodyAnalysisView } from '../services/bodyAnalysisGuidedScan'
import {
  acceptHomeSystemCameraFile,
  readHomeBodyScanSession,
  setHomeBodyScanNotice,
  setHomeBodyScanPendingAngle,
  subscribeHomeBodyScanSession,
} from '../services/homeBodyScanSession.js'

const order = ['front', 'side', 'back']

/**
 * Home body scan uses the phone's own camera through a file input.
 * The live getUserMedia preview is intentionally not started here.
 * The next angle opens only when the user taps again: iOS Safari blocks
 * a second camera open that is not part of a user gesture.
 */
function BodyScanSystemCapture({
  canAnalyze,
  currentAnalysisStatus,
  disabledReason,
  photos,
  onAnalyze,
  onPhotoChange,
}) {
  const { t } = useTranslation('bodyScan')
  const photosRef = useRef(photos)
  const onPhotoChangeRef = useRef(onPhotoChange)
  const fileInputRef = useRef(null)
  const selectedAngleRef = useRef('front')
  const captureAngleRef = useRef('front')
  const [, setRevision] = useState(0)
  const [selectedAngle, setSelectedAngle] = useState('front')

  useEffect(() => {
    photosRef.current = photos
    onPhotoChangeRef.current = onPhotoChange
    selectedAngleRef.current = selectedAngle
  })

  useEffect(() => {
    const input = fileInputRef.current
    if (!input) return undefined
    const handleCancel = () => setHomeBodyScanNotice('cancelled')
    input.addEventListener('cancel', handleCancel)
    return () => input.removeEventListener('cancel', handleCancel)
  })

  useEffect(() => subscribeHomeBodyScanSession((session) => {
    for (const key of order) {
      const next = session.photos[key]
      const current = photosRef.current[key]
      if ((next?.file || null) !== (current?.file || null)) {
        onPhotoChangeRef.current(next ? next.file : null, key, next?.preview || '')
      }
    }
    setRevision((value) => value + 1)
  }), [])

  const session = readHomeBodyScanSession()
  const active = selectedAngle
  const view = getBodyAnalysisView(active)
  const taken = order.filter((key) => photos[key]).length

  function chooseAngle(key) {
    selectedAngleRef.current = key
    setSelectedAngle(key)
  }

  function beginCapture() {
    captureAngleRef.current = selectedAngleRef.current
    setHomeBodyScanPendingAngle(captureAngleRef.current)
  }

  async function handleFile(event) {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    const angle = captureAngleRef.current
    await acceptHomeSystemCameraFile(file, angle)
  }

  return (
    <section className="body-scan-guided body-scan-system" aria-labelledby="body-scan-system-title">
      <h3 id="body-scan-system-title">{t('guided.systemTitle')}</h3>
      <p>{t('guided.systemProgress', { taken, total: order.length })}</p>
      <fieldset className="body-scan-system-angles">
        <legend>{t('guided.systemChooseAngle')}</legend>
        {order.map((key) => (
          <label key={key} style={{ display: 'block', padding: '0.5rem 0' }}>
            <input
              type="radio"
              name="body-scan-angle"
              value={key}
              checked={selectedAngle === key}
              onChange={() => chooseAngle(key)}
            />
            {' '}{getBodyAnalysisView(key).label}
            {photos[key] ? ` ✓ ${t('guided.systemSaved')}` : ''}
            {photos[key]?.preview && (
              <img
                src={photos[key].preview}
                alt={getBodyAnalysisView(key).label}
                style={{ display: 'block', width: 80, height: 80, objectFit: 'cover', margin: '0.4rem 0 0 1.5rem', borderRadius: 8 }}
              />
            )}
          </label>
        ))}
      </fieldset>
      {view && (
        <>
          <p>{t('guided.systemPromptFirst', { label: view.label })}</p>
          <p>{view.poseTips[0]}</p>
          <label
            className="body-scan-guided-cta body-scan-system-file"
            onClick={beginCapture}
          >
            <span>{photos[active] ? t('guided.systemRetakePhoto', { label: view.label }) : t('guided.systemTakePhoto', { label: view.label })}</span>
            <input
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              type="file"
              onClick={beginCapture}
              onChange={handleFile}
            />
          </label>
        </>
      )}
      {taken === order.length && <p>{t('guided.systemAllDone')}</p>}
      {session.notice === 'cancelled' && <p role="alert">{t('guided.systemCancelled')}</p>}
      {session.notice === 'failed' && <p role="alert">{t('guided.systemFailed')}</p>}
      <button
        className="body-scan-guided-cta"
        type="button"
        disabled={!canAnalyze || taken !== order.length}
        onClick={onAnalyze}
      >
        {t('uploader.analyze')}
      </button>
      {currentAnalysisStatus && <p className="analysis-status" aria-live="polite">{currentAnalysisStatus}</p>}
      {disabledReason && <p className="progress-photo-safety">{disabledReason}</p>}
    </section>
  )
}

export default BodyScanSystemCapture
