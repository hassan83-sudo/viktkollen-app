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
  const [, setRevision] = useState(0)
  const [selectedAngle, setSelectedAngle] = useState('front')
  photosRef.current = photos
  onPhotoChangeRef.current = onPhotoChange

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
  const nextMissing = order.find((key) => !photos[key]) || null
  const active = selectedAngle
  const view = getBodyAnalysisView(active)
  const taken = order.filter((key) => photos[key]).length

  async function handleFile(event) {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    await acceptHomeSystemCameraFile(file)
  }

  return (
    <section className="body-scan-guided body-scan-system" aria-labelledby="body-scan-system-title">
      <h3 id="body-scan-system-title">{t('guided.systemTitle')}</h3>
      <p>{t('guided.systemProgress', { taken, total: order.length })}</p>
      <fieldset className="body-scan-system-angles">
        <legend>Välj vilken kroppsvinkel du vill fotografera</legend>
        {order.map((key) => (
          <label key={key} style={{ display: 'block', padding: '0.5rem 0' }}>
            <input
              type="radio"
              name="body-scan-angle"
              value={key}
              checked={selectedAngle === key}
              onChange={() => setSelectedAngle(key)}
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
            onClick={() => setHomeBodyScanPendingAngle(active)}
          >
            <span>{photos[active] ? 'Ta om bild' : 'Ta bild'} – {view.label}</span>
            <input
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              type="file"
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
