import { useCallback, useEffect, useRef, useState } from 'react'

import {
  defaultBodyScanFacingMode,
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  getNextBodyScanFacingMode,
  stopMediaStream,
} from '../../../services/bodyAnalysisGuidedScan.js'
import { getActiveUserDataScope } from '../../../services/userDataRepository.js'
import {
  inspectLegacyBodyImages,
  readLegacyCleanupMarker,
  runLegacyBodyImageCleanup,
} from '../legacyBodyImageCleanup.js'
import {
  buildSavableRecord,
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
import { captureFrame, frameFromImageFile } from '../localFrame.js'
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

function LegacyImageCleanup({ scope }) {
  const [status, setStatus] = useState(() => inspectLegacyBodyImages({ scope }))
  const [confirming, setConfirming] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const marker = readLegacyCleanupMarker({ scope })

  if (!status.imageCount && !outcome) {
    return marker?.status === 'done'
      ? <p className="local-body-scan-note">Gamla kroppsbilder har rensats från kroppsscanningens historik på den här enheten.</p>
      : null
  }

  function run() {
    const result = runLegacyBodyImageCleanup({ approved: true, scope })
    setOutcome(result)
    setConfirming(false)
    setStatus(inspectLegacyBodyImages({ scope }))
  }

  return (
    <section className="local-body-scan-legacy" aria-label="Gamla kroppsbilder">
      <strong>Gamla kroppsbilder på den här enheten</strong>
      {status.imageCount > 0 && (
        <p>
          Det tidigare analysflödet har sparat {status.imageCount} bildförhandsvisning{status.imageCount === 1 ? '' : 'ar'} i
          {' '}kroppsscanningens historik. Du kan ta bort bilderna och behålla analysresultaten.
        </p>
      )}
      {confirming ? (
        <div className="local-body-scan-confirm">
          <p>
            Tas bort: bildförhandsvisningar i kroppsscanningens historik. Behålls: analysresultat, datum, din viktlogg
            och dina vanliga framstegsbilder. Det går inte att ångra.
          </p>
          <div className="local-body-scan-actions">
            <button className="primary-button" type="button" onClick={run}>Ja, ta bort gamla kroppsbilder</button>
            <button className="secondary-button" type="button" onClick={() => setConfirming(false)}>Avbryt</button>
          </div>
        </div>
      ) : status.imageCount > 0 && (
        <button className="secondary-button" type="button" onClick={() => setConfirming(true)}>Ta bort gamla kroppsbilder…</button>
      )}
      {outcome && (
        <p role="status">
          {outcome.ok
            ? `Klart: ${outcome.removed} ${outcome.removed === 1 ? 'bild borttagen' : 'bilder borttagna'}. Analysresultaten finns kvar. Stäng och öppna kroppsscanningen igen för att uppdatera listan.`
            : 'Rensningen blev inte helt klar. Försök igen – redan rensade delar påverkas inte.'}
        </p>
      )}
    </section>
  )
}

function Results({ comparison, latestWeight, onDiscard, onSave, records, results, saved, weightChange }) {
  const analyzedViews = localScanViews.filter((view) => results[view.id])
  const okViews = analyzedViews.filter((view) => results[view.id].quality.ok)

  return (
    <section className="local-body-scan-results" aria-label="Resultat av lokal analys">
      <h3>Resultat</h3>
      <p className="local-body-scan-summary" role="status">
        {comparison.status === 'compared'
          ? 'Jämförelse gjord med din förra godkända scanning.'
          : comparison.status === 'no-baseline' ? 'Första scanningen – den kan användas som utgångspunkt.' : 'Kan inte bedömas den här gången.'}
        {' '}Analyserat lokalt på {new Date().toLocaleDateString('sv-SE')}.
      </p>
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
            inte ett mått.
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
      <p className="local-body-scan-note">
        Vill du spara resultatet? Ta en vanlig skärmbild – iPhone: sidoknappen + volym upp, Android: av/på + volym ned.
        Resultatet visar inga kroppsbilder.
      </p>
      {saved && <p role="status">Analysvärdena är sparade ({records.length} st totalt). Inga bilder sparades.</p>}
    </section>
  )
}

export default function LocalBodyScan({
  createAnalyzer = createLocalPoseAnalyzer,
  readImageFile = frameFromImageFile,
  scope: scopeProp,
  weights = [],
}) {
  const [scope] = useState(() => scopeProp || getActiveUserDataScope())
  const [facingMode, setFacingMode] = useState(defaultBodyScanFacingMode)
  const [source, setSource] = useState('live')
  const [landscape, setLandscape] = useState(false)
  // Ökas för varje ny kameraström så att videon alltid kopplas om.
  const [streamVersion, setStreamVersion] = useState(0)
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
  const analyzerPromiseRef = useRef(null)
  const fileInputRef = useRef(null)
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
    analyzerPromiseRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
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
  }, [phase, viewIndex, streamVersion])

  async function openCamera(facing = facingMode) {
    const requestId = cameraRequestRef.current + 1
    cameraRequestRef.current = requestId
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('no camera'), { name: 'NotSupportedError' })
    }
    const stream = await navigator.mediaDevices.getUserMedia(getBodyScanVideoConstraints(facing))
    if (requestId !== cameraRequestRef.current) {
      stopMediaStream(stream)
      return false
    }
    streamRef.current = stream
    setStreamVersion((version) => version + 1)
    return true
  }

  function loadAnalyzer() {
    if (!analyzerPromiseRef.current) {
      analyzerPromiseRef.current = createAnalyzer().then((analyzer) => {
        analyzerRef.current = analyzer
        return analyzer
      })
    }
    return analyzerPromiseRef.current
  }

  function resetSession() {
    setMessage('')
    setSaved(false)
    setResults({})
    setViewIndex(0)
  }

  // Mobilens egen kamera-app: modellen laddas först; själva kamera-appen
  // öppnas på användarens nästa tryck (krav i iOS Safari).
  async function startNative() {
    stopCamera()
    resetSession()
    setSource('native')
    setPhase('loading')
    try {
      await loadAnalyzer()
    } catch {
      releaseAll()
      setPhase('unavailable')
      return
    }
    setPhase('capture')
  }

  async function start() {
    resetSession()
    setSource('live')
    setPhase('loading')
    try {
      await loadAnalyzer()
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

  async function switchCamera() {
    const next = getNextBodyScanFacingMode(facingMode)
    stopCamera()
    setFacingMode(next)
    try {
      if (!(await openCamera(next))) return
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
    const frame = captureFrame(videoRef.current)
    if (!frame) {
      setMessage('Kameran gav ingen bild. Försök igen.')
      return
    }
    analyzeFrame(frame)
  }

  async function analyzeFile(event) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setBusy(true)
    setMessage('')
    let frame = null
    try {
      await loadAnalyzer()
      frame = await readImageFile(file)
    } catch {
      // Modell- eller läsfel hanteras nedan som "kunde inte läsas".
    } finally {
      // Släpp filreferensen direkt; bilden finns nu bara på arbets-canvasen.
      input.value = ''
    }
    if (!frame) {
      setBusy(false)
      setMessage('Bilden kunde inte läsas. Försök igen.')
      return
    }
    analyzeFrame(frame)
  }

  function analyzeFrame(frame) {
    const view = localScanViews[viewIndex]
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
      // Ett fel i WASM-modellen gör den oanvändbar för resten av sessionen.
      // Avsluta säkert: stäng kameran och visa att lokal analys inte är
      // tillgänglig – aldrig ett påhittat resultat och ingen server-fallback.
      frame.release()
      setBusy(false)
      releaseAll()
      setCountdown(null)
      setPhase('unavailable')
      return
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
      <input
        ref={fileInputRef}
        accept="image/*"
        aria-hidden="true"
        capture={facingMode === 'user' ? 'user' : 'environment'}
        hidden
        tabIndex={-1}
        type="file"
        onChange={analyzeFile}
      />

      {phase === 'intro' && (
        <>
          <h3>Kroppsscanning direkt på mobilen</h3>
          <PrivacyNotice />
          <p className="local-body-scan-note">
            Modell: {localPoseModel.library} {localPoseModel.libraryVersion} (pose + silhuett, {localPoseModel.license}).
            Modellfilerna laddas från Viktkollen, inte från någon extern tjänst.
          </p>
          <div className="local-body-scan-actions">
            <button className="primary-button" type="button" onClick={start}>Starta lokal analys</button>
            <button className="secondary-button" type="button" onClick={startNative}>Använd mobilens kamera-app</button>
          </div>
          <p className="local-body-scan-note">
            Med kamera-appen tar du bilden själv. iPhone sparar inte sådana bilder i Bilder. Vissa Android-kameraappar
            kan spara en kopia i galleriet – livekameran i Viktkollen sparar aldrig något.
          </p>
          <LegacyImageCleanup scope={scope} />
        </>
      )}

      {phase === 'loading' && <p role="status">Laddar den lokala modellen…</p>}

      {phase === 'unavailable' && (
        <div className="local-body-scan-unavailable" role="alert">
          <strong>Lokal analys är inte tillgänglig på den här enheten.</strong>
          <p>
            Den lokala modellen kunde inte startas eller avbröts. Inget resultat visas och inga bilder skickas någonstans.
            Stäng och öppna kroppsscanningen igen för att försöka på nytt.
          </p>
          <button className="secondary-button" type="button" onClick={() => setPhase('intro')}>Tillbaka</button>
        </div>
      )}

      {phase === 'camera-error' && (
        <div className="local-body-scan-unavailable" role="alert">
          <strong>Kameran kunde inte starta.</strong>
          <p>{message}</p>
          <div className="local-body-scan-actions">
            <button className="primary-button" type="button" onClick={startNative}>Använd mobilens kamera-app</button>
            <button className="secondary-button" type="button" onClick={() => setPhase('intro')}>Tillbaka</button>
          </div>
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
          {source === 'live' ? (
            <>
              <div className={`local-body-scan-frame${facingMode === 'user' ? ' is-mirrored' : ''}`}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Kamerans förhandsvisning (sparas inte)"
                  onLoadedMetadata={(event) => setLandscape(event.currentTarget.videoWidth > event.currentTarget.videoHeight)}
                />
                {countdown !== null && <span className="local-body-scan-countdown" aria-live="assertive">{countdown}</span>}
              </div>
              <div className="local-body-scan-camera-row">
                <span>{facingMode === 'user' ? 'Främre kamera' : 'Bakre kamera'}</span>
                <button className="secondary-button" disabled={busy || countdown !== null} type="button" onClick={switchCamera}>
                  Byt kamera
                </button>
              </div>
              {landscape && <p className="local-body-scan-note" role="status">Håll mobilen stående för bäst resultat.</p>}
            </>
          ) : (
            <div className="local-body-scan-native">
              <p>Ta bilden med mobilens kamera-app. Bilden analyseras här och släpps sedan direkt.</p>
            </div>
          )}
          <ViewFeedback result={currentResult} />
          {message && <p className="local-body-scan-message" role="alert">{message}</p>}
          <div className="local-body-scan-actions">
            {!currentResult && source === 'live' && (
              <button className="primary-button" disabled={busy || countdown !== null} type="button" onClick={startCountdown}>
                {busy ? 'Analyserar…' : `Analysera ${view.label.toLowerCase()} (${countdownSeconds} s)`}
              </button>
            )}
            {!currentResult && source === 'native' && (
              <button className="primary-button" disabled={busy} type="button" onClick={() => fileInputRef.current?.click()}>
                {busy ? 'Analyserar…' : `Öppna kamera-appen (${view.label.toLowerCase()})`}
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
