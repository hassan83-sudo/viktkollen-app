import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  stopMediaStream,
} from '../../../services/bodyAnalysisGuidedScan.js'
import {
  buildSavableRecord,
  changeLabels,
  compareWithPrevious,
  computeViewMetrics,
  describeChange,
  getLatestRegisteredWeight,
  getRegisteredWeightChange,
  qualityIssueMessages,
} from '../localBodyMetrics.js'
import { localPoseModel, localScanViews } from '../localBodyScanConfig.js'
import {
  clearLocalScanRecords,
  deleteLocalScanRecord,
  getLocalBodyScanStorageKey,
  loadLocalScanRecords,
  saveLocalScanRecord,
} from '../localBodyScanStore.js'
import { captureFrame } from '../localFrame.js'
import { createLocalPoseAnalyzer } from '../localPoseModel.js'
import '../localBodyScan.css'

const countdownSeconds = 3

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return String(value || '')
  }
}

function formatKg(value) {
  return `${Number(value).toFixed(1).replace('.', ',')} kg`
}

function PrivacyNotice() {
  return (
    <ul className="local-body-scan-privacy">
      <li>Bilderna analyseras bara här på din mobil. Inga kroppsbilder skickas till server eller AI.</li>
      <li>Inga bilder, bildrutor eller miniatyrer sparas – varken i appen, i molnet eller i historiken.</li>
      <li>Vill du behålla en bild kan du själv ta en vanlig skärmbild.</li>
      <li>Kameran stängs när du är klar, byter läge eller lämnar sidan.</li>
      <li>Webbläsaren styr själv när arbetsminnet töms; omedelbar fysisk radering kan inte garanteras.</li>
    </ul>
  )
}

function ViewFeedback({ result }) {
  if (!result) return null
  return (
    <div className={`local-body-scan-feedback ${result.quality.ok ? 'is-ok' : 'is-warning'}`} role="status">
      <strong>{result.quality.ok ? '✓ Vyn kunde analyseras' : 'Vyn kunde inte analyseras tillförlitligt'}</strong>
      {result.quality.issues.length > 0 && (
        <ul>
          {result.quality.issues.map((issue) => <li key={issue}>{qualityIssueMessages[issue] || issue}</li>)}
        </ul>
      )}
    </div>
  )
}

function Results({ comparison, latestWeight, onDiscard, onSave, records, results, saved, weightChange }) {
  const analyzedViews = localScanViews.filter((view) => results[view.id])
  const okViews = analyzedViews.filter((view) => results[view.id].quality.ok)

  return (
    <section className="local-body-scan-results" aria-label="Resultat av lokal analys">
      <h3>Resultat</h3>
      <p className="progress-photo-safety">
        Analysen visar möjliga förändringar i kroppens proportioner och kontur i bild – inte vikt,
        kroppsfett eller centimeter.
      </p>
      <ul className="local-body-scan-views">
        {analyzedViews.map((view) => (
          <li key={view.id}>
            <strong>{view.label}</strong>
            <span>{results[view.id].quality.ok ? 'Analyserad' : 'Kunde inte bedömas'}</span>
          </li>
        ))}
      </ul>

      <h4>Jämförelse med förra godkända analysen</h4>
      {comparison.status === 'compared' ? (
        <div className="local-body-scan-comparison">
          {Object.entries(comparison.views).map(([viewId, view]) => (
            <div key={viewId}>
              <p className="local-body-scan-view-label">{localScanViews.find((entry) => entry.id === viewId)?.label}</p>
              {view.reliable
                ? (
                  <ul>
                    {Object.entries(view.changes).map(([key, change]) => (
                      <li key={key} data-level={change.level}>{describeChange(key, change)}</li>
                    ))}
                  </ul>
                )
                : <p>Kan inte bedömas: {view.reasons.join(' ')}</p>}
            </div>
          ))}
          <p className="local-body-scan-note">
            Små skillnader kan bero på kläder, andning, hållning och ljus. Bedömningen är en indikation,
            inte ett mått. ({Object.values(changeLabels).join(' · ')})
          </p>
        </div>
      ) : (
        <p className="local-body-scan-not-assessable" role="status">
          {comparison.status === 'no-baseline' ? 'Ingen jämförelse ännu. ' : 'Förändringen kan inte bedömas. '}
          {comparison.reasons.join(' ')}
        </p>
      )}

      <h4>Registrerad vikt</h4>
      {weightChange
        ? (
          <p>
            Enligt din viktlogg: {formatKg(weightChange.from.kg)} ({formatDate(weightChange.from.date)}) →{' '}
            {formatKg(weightChange.to.kg)} ({formatDate(weightChange.to.date)}),
            {' '}{weightChange.changeKg > 0 ? '+' : ''}{String(weightChange.changeKg).replace('.', ',')} kg.
            {' '}Viktförändring hämtas bara från vikter du själv har registrerat.
          </p>
        )
        : latestWeight
          ? (
            <p>
              Senast registrerade vikt: {formatKg(latestWeight.kg)} ({formatDate(latestWeight.date)}).
              {' '}Bildanalysen uppskattar aldrig vikt.
            </p>
          )
          : <p>Ingen registrerad vikt att jämföra med. Bildanalysen uppskattar aldrig vikt.</p>}

      {okViews.length > 0 && !saved && (
        <details className="local-body-scan-save-details">
          <summary>Vad sparas om jag godkänner?</summary>
          <p>
            Endast enhetslösa proportionsvärden per vy (t.ex. midjans kontur i förhållande till kroppslängden),
            avstånd/vinkel/ljus-värden för jämförbarhet, datum och modellversion. Inga bilder.
            Värdena sparas på den här enheten, kopplade till ditt konto, och raderas vid kontoradering.
          </p>
        </details>
      )}
      <div className="local-body-scan-actions">
        {okViews.length > 0 && !saved && (
          <button className="primary-button" type="button" onClick={onSave}>Godkänn och spara analysvärden</button>
        )}
        <button className="secondary-button" type="button" onClick={onDiscard}>
          {saved ? 'Klar' : 'Avsluta utan att spara'}
        </button>
      </div>
      {saved && <p role="status">Analysvärdena är sparade ({records.length} st totalt). Inga bilder sparades.</p>}
    </section>
  )
}

export default function LocalBodyScan({ createAnalyzer = createLocalPoseAnalyzer, scope, weights = [] }) {
  const [phase, setPhase] = useState('intro')
  const [viewIndex, setViewIndex] = useState(0)
  const [results, setResults] = useState({})
  const [countdown, setCountdown] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [records, setRecords] = useState(() => loadLocalScanRecords(scope))
  const [saved, setSaved] = useState(false)
  const [comparison, setComparison] = useState(null)
  const [weightChange, setWeightChange] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const analyzerRef = useRef(null)
  const timerRef = useRef(0)
  const cameraRequestRef = useRef(0)
  const canPersist = Boolean(getLocalBodyScanStorageKey(scope))

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1
    window.clearTimeout(timerRef.current)
    timerRef.current = 0
    stopMediaStream(streamRef.current)
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      try {
        video.pause?.()
      } catch {
        // ignore
      }
      video.srcObject = null
    }
  }, [])

  const releaseAll = useCallback(() => {
    stopCamera()
    analyzerRef.current?.close()
    analyzerRef.current = null
  }, [stopCamera])

  // Kamerastopp vid avmontering (navigation, stängd vy, byte av läge).
  useEffect(() => releaseAll, [releaseAll])

  // Kamerastopp när appen hamnar i bakgrunden eller sidan lämnas.
  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden' && streamRef.current) {
        stopCamera()
        setCountdown(null)
        setPhase((current) => (current === 'capture' ? 'paused' : current))
      }
    }
    function onPageHide() {
      releaseAll()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [releaseAll, stopCamera])

  useEffect(() => {
    const video = videoRef.current
    if (phase !== 'capture' || !video || !streamRef.current) return
    if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current
    video.play?.()?.catch?.(() => {})
  }, [phase, viewIndex])

  async function openCamera() {
    const requestId = cameraRequestRef.current + 1
    cameraRequestRef.current = requestId
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('no camera'), { name: 'NotSupportedError' })
    }
    const stream = await navigator.mediaDevices.getUserMedia(getBodyScanVideoConstraints())
    if (requestId !== cameraRequestRef.current) {
      stopMediaStream(stream)
      return false
    }
    streamRef.current = stream
    return true
  }

  async function start() {
    setMessage('')
    setSaved(false)
    setResults({})
    setViewIndex(0)
    setPhase('loading')
    try {
      analyzerRef.current = await createAnalyzer()
    } catch {
      releaseAll()
      setPhase('unavailable')
      return
    }
    try {
      if (!(await openCamera())) return
      setPhase('capture')
    } catch (error) {
      releaseAll()
      setMessage(getCameraPermissionMessage(error))
      setPhase('camera-error')
    }
  }

  async function resumeCamera() {
    setMessage('')
    try {
      if (!(await openCamera())) return
      setPhase('capture')
    } catch (error) {
      releaseAll()
      setMessage(getCameraPermissionMessage(error))
      setPhase('camera-error')
    }
  }

  function finish(nextResults = results) {
    releaseAll()
    setCountdown(null)
    const latest = loadLocalScanRecords(scope)[0] || null
    setComparison(compareWithPrevious(latest, nextResults))
    setWeightChange(getRegisteredWeightChange(weights, latest?.createdAt, new Date()))
    setPhase('results')
  }

  function analyzeCurrentView() {
    const view = localScanViews[viewIndex]
    const frame = captureFrame(videoRef.current)
    if (!frame) {
      setMessage('Kameran gav ingen bild. Försök igen.')
      return
    }
    setBusy(true)
    let result = null
    try {
      const output = analyzerRef.current.analyze(frame.canvas)
      result = computeViewMetrics({
        imageHeight: frame.height,
        imageWidth: frame.width,
        landmarks: output.landmarks,
        luminance: frame.luminance,
        mask: output.mask,
        view: view.id,
      })
      // Masken är härledd ur bilden – släpp referensen direkt.
      if (output.mask) output.mask.data = null
    } catch {
      setMessage('Den lokala analysen misslyckades för den här bilden. Inget resultat visas.')
    } finally {
      frame.release()
      setBusy(false)
    }
    if (result) {
      setMessage('')
      setResults((current) => ({ ...current, [view.id]: result }))
    }
  }

  function startCountdown() {
    if (busy || countdown !== null) return
    setMessage('')
    let remaining = countdownSeconds
    setCountdown(remaining)
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) {
        timerRef.current = 0
        setCountdown(null)
        analyzeCurrentView()
        return
      }
      setCountdown(remaining)
      timerRef.current = window.setTimeout(tick, 1000)
    }
    timerRef.current = window.setTimeout(tick, 1000)
  }

  function goNext() {
    if (viewIndex >= localScanViews.length - 1) {
      finish()
      return
    }
    setViewIndex((index) => index + 1)
    setMessage('')
  }

  function retake() {
    const view = localScanViews[viewIndex]
    setResults((current) => {
      const next = { ...current }
      delete next[view.id]
      return next
    })
  }

  function discard() {
    releaseAll()
    setResults({})
    setComparison(null)
    setWeightChange(null)
    setSaved(false)
    setViewIndex(0)
    setPhase('intro')
  }

  function save() {
    const record = buildSavableRecord(results)
    if (!record) return
    const outcome = saveLocalScanRecord(record, scope)
    if (outcome.ok) {
      setRecords(outcome.records)
      setSaved(true)
    } else {
      setMessage(canPersist ? 'Analysvärdena kunde inte sparas.' : 'Logga in klart innan analysvärden kan sparas.')
    }
  }

  const view = localScanViews[viewIndex]
  const currentResult = results[view?.id]

  return (
    <div className="local-body-scan" data-phase={phase}>
      <p className="eyebrow">Lokal analys (beta)</p>

      {phase === 'intro' && (
        <>
          <h3>Kroppsscanning direkt på mobilen</h3>
          <PrivacyNotice />
          <p className="local-body-scan-note">
            Modell: {localPoseModel.library} {localPoseModel.libraryVersion} (pose + silhuett, {localPoseModel.license}).
            Modellfilerna laddas från Viktkollen, inte från någon extern tjänst.
          </p>
          <button className="primary-button" type="button" onClick={start}>Starta lokal analys</button>
        </>
      )}

      {phase === 'loading' && <p role="status">Laddar den lokala modellen…</p>}

      {phase === 'unavailable' && (
        <div className="local-body-scan-unavailable" role="alert">
          <strong>Lokal analys är inte tillgänglig på den här enheten.</strong>
          <p>Modellen kunde inte startas. Inget resultat visas och inga bilder skickas någonstans.</p>
          <button className="secondary-button" type="button" onClick={() => setPhase('intro')}>Tillbaka</button>
        </div>
      )}

      {phase === 'camera-error' && (
        <div className="local-body-scan-unavailable" role="alert">
          <strong>Kameran kunde inte starta.</strong>
          <p>{message}</p>
          <button className="secondary-button" type="button" onClick={() => setPhase('intro')}>Tillbaka</button>
        </div>
      )}

      {phase === 'paused' && (
        <div className="local-body-scan-unavailable" role="status">
          <strong>Kameran stängdes när appen lämnades.</strong>
          <div className="local-body-scan-actions">
            <button className="primary-button" type="button" onClick={resumeCamera}>Starta kameran igen</button>
            <button className="secondary-button" type="button" onClick={() => finish()}>Visa resultat</button>
          </div>
        </div>
      )}

      {phase === 'capture' && view && (
        <>
          <ol className="local-body-scan-steps" aria-label="Vyer">
            {localScanViews.map((entry, index) => (
              <li
                key={entry.id}
                aria-current={index === viewIndex ? 'step' : undefined}
                className={results[entry.id]?.quality.ok ? 'is-done' : index === viewIndex ? 'is-current' : ''}
              >
                {entry.label}{entry.required ? '' : ' (valfri)'}
              </li>
            ))}
          </ol>
          <p className="local-body-scan-instruction">{view.instruction}</p>
          <div className="local-body-scan-frame">
            <video ref={videoRef} autoPlay muted playsInline aria-label="Kamerans förhandsvisning (sparas inte)" />
            {countdown !== null && <span className="local-body-scan-countdown" aria-live="assertive">{countdown}</span>}
          </div>
          <ViewFeedback result={currentResult} />
          {message && <p className="local-body-scan-message" role="alert">{message}</p>}
          <div className="local-body-scan-actions">
            {!currentResult && (
              <button className="primary-button" disabled={busy || countdown !== null} type="button" onClick={startCountdown}>
                {busy ? 'Analyserar…' : `Analysera ${view.label.toLowerCase()} (${countdownSeconds} s)`}
              </button>
            )}
            {currentResult && (
              <button className="secondary-button" type="button" onClick={retake}>Ta om</button>
            )}
            {currentResult?.quality.ok && (
              <button className="primary-button" type="button" onClick={goNext}>
                {viewIndex >= localScanViews.length - 1 ? 'Visa resultat' : 'Nästa vy'}
              </button>
            )}
            {!view.required && !currentResult?.quality.ok && (
              <button className="secondary-button" type="button" onClick={goNext}>Hoppa över</button>
            )}
            {Object.values(results).some((result) => result.quality.ok) && viewIndex < localScanViews.length - 1 && (
              <button className="secondary-button" type="button" onClick={() => finish()}>Avsluta och visa resultat</button>
            )}
            <button className="secondary-button" type="button" onClick={discard}>Avbryt</button>
          </div>
        </>
      )}

      {phase === 'results' && comparison && (
        <Results
          comparison={comparison}
          latestWeight={getLatestRegisteredWeight(weights)}
          records={records}
          results={results}
          saved={saved}
          weightChange={weightChange}
          onDiscard={discard}
          onSave={save}
        />
      )}
      {phase === 'results' && message && <p className="local-body-scan-message" role="alert">{message}</p>}

      {records.length > 0 && (phase === 'intro' || phase === 'results') && (
        <details className="local-body-scan-history">
          <summary>Sparade analysvärden ({records.length})</summary>
          <ul>
            {records.map((record) => (
              <li key={record.id}>
                <span>{formatDate(record.createdAt)} · {Object.keys(record.views).length} vy(er)</span>
                <button className="secondary-button" type="button" onClick={() => setRecords(deleteLocalScanRecord(record.id, scope))}>
                  Radera
                </button>
              </li>
            ))}
          </ul>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              clearLocalScanRecords(scope)
              setRecords([])
            }}
          >
            Radera alla analysvärden
          </button>
        </details>
      )}
    </div>
  )
}
