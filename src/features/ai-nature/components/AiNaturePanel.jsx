import { useEffect, useRef, useState } from 'react'
import { createCameraSession } from '../../shared/camera/cameraSession.js'
import { requestNatureIdentification } from '../aiNatureAnalysisService.js'
import { requestAiNatureConsent } from '../aiNatureConsentService.js'
import { supabase } from '../../../services/supabaseClient.js'

const safetyMessage = 'Ät aldrig svampar, bär eller växter enbart utifrån en bildidentifiering.'

export default function AiNaturePanel({ onClose, analysisEnabled = false }) {
  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [identification, setIdentification] = useState(null)
  const [busy, setBusy] = useState(false)
  const [previewName, setPreviewName] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    const session = createCameraSession({ facingMode: 'environment' })
    sessionRef.current = session
    return () => {
      session.stop()
      abortRef.current?.abort()
      sessionRef.current = null
    }
  }, [])

  async function startCamera() {
    setCameraError('')
    const result = await sessionRef.current?.start(videoRef.current)
    if (!result?.ok) setCameraError(result?.message || 'Kameran kunde inte startas.')
    setCameraActive(Boolean(result?.ok))
  }

  function stopCamera() {
    sessionRef.current?.stop()
    setCameraActive(false)
  }

  function takePhoto() {
    const canvas = sessionRef.current?.captureFrame(videoRef.current)
    if (!canvas) return setCameraError('Bilden kunde inte tas.')
    const image = canvas.toDataURL('image/jpeg', 0.85)
    setPhoto(image)
    setIdentification(null)
    stopCamera()
  }

  function selectFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setCameraError('Välj en JPG-, PNG- eller WebP-bild på högst 8 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(typeof reader.result === 'string' ? reader.result : null)
      setIdentification(null)
      setCameraError('')
    }
    reader.readAsDataURL(file)
  }

  async function identify() {
    if (!analysisEnabled || busy || !photo) return
    setPreviewName('')
    setBusy(true)
    setCameraError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { data, error } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token
      if (error || !accessToken) throw new Error('Du behöver vara inloggad för att analysera bilden.')
      const image = await (await fetch(photo)).blob()
      // Called only after the user presses the explicit approval button.
      // Request an image-bound consent token for this exact blob.
      const consentToken = await requestAiNatureConsent({ image, accessToken, signal: controller.signal })
      if (controller.signal.aborted) return
      const result = await requestNatureIdentification({ image, accessToken, consentToken, signal: controller.signal, onProgress: name => { if (!controller.signal.aborted) setPreviewName(name) } })
      if (!controller.signal.aborted) setIdentification(result)
    } catch (error) {
      if (!controller.signal.aborted) setCameraError(error?.message || 'Analysen kunde inte genomföras.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPreviewName('')
      setBusy(false)
    }
  }

  function reset() {
    abortRef.current?.abort()
    setPhoto(null)
    setIdentification(null)
    setCameraError('')
  }

  return (
    <section className="ai-nature-panel" aria-label="AI Natur mm" style={{ maxWidth: 560, margin: '0 auto', padding: 16, color: 'inherit' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>AI Natur mm</h2>
          <p style={{ margin: '6px 0 16px' }}>Upptäck träd, blommor, växter, frukt, grönsaker, svampar, fåglar, insekter, djur, fiskar och stenar.</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Stäng AI Natur mm">Stäng</button>}
      </header>

      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#14241a', minHeight: 230, display: 'grid', placeItems: 'center' }}>
        <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', display: cameraActive ? 'block' : 'none' }} />
        {photo ? <img src={photo} alt="Vald naturbild" style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} /> : !cameraActive && <span style={{ color: '#dcefe0', padding: 24, textAlign: 'center' }}>Ta en bild eller välj ett foto från din enhet.</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {!cameraActive && !photo && <button type="button" onClick={startCamera}>Öppna kameran</button>}
        {cameraActive && <button type="button" onClick={takePhoto}>Ta bild</button>}
        {cameraActive && <button type="button" onClick={stopCamera}>Stäng kameran</button>}
        {!cameraActive && <label style={{ cursor: 'pointer', padding: '8px 12px', border: '1px solid currentColor', borderRadius: 8 }}>Välj bild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} style={{ display: 'none' }} /></label>}
        {photo && <button type="button" onClick={reset}>Välj en annan bild</button>}
      </div>

      {cameraError && <p role="alert">{cameraError}</p>}
      <p style={{ fontSize: 13, opacity: 0.85 }}>Bilden stannar på din enhet tills du uttryckligen godkänner analys. {analysisEnabled ? 'Godkänn endast om du vill skicka bilden för AI-analys.' : 'AI-analysen är ännu inte aktiverad.'}</p>
      {photo && <button type="button" onClick={identify} disabled={!analysisEnabled || busy} title={!analysisEnabled ? "AI Natur mm är spärrad tills separat kvot och betalningskontroll är verifierade" : undefined}>{busy ? "Identifierar…" : analysisEnabled ? "Godkänn och identifiera med AI" : "Identifiera med AI – kommer snart"}</button>}
      {busy && <p role="status">{previewName ? `Preliminär identifiering: ${previewName}. Hämtar övrig information…` : 'Identifierar art…'}</p>}
      {identification && (
        <article aria-live="polite" style={{ marginTop: 18 }}>
          <h3 style={{
            display: 'inline-block',
            maxWidth: '100%',
            boxSizing: 'border-box',
            margin: 0,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: '#14241a',
            color: '#ffda8a',
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(1.25rem, 5vw, 1.75rem)',
            fontWeight: 700,
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
          }}>{identification.swedishName}</h3>
          {identification.category === 'animal' && <p><strong>Kategori: Djur</strong></p>}
          {identification.category === 'insect' && <p><strong>Kategori: Insekt</strong></p>}
          {identification.scientificName && <p><i>{identification.scientificName}</i></p>}
          <p>{identification.description}</p>
          {identification.reproduction && <section aria-label="Fortplantning"><h4>Fortplantning</h4><p>{identification.reproduction}</p></section>}
          {identification.rootSpread && <section aria-label="Rötter under marken"><h4>Rötter under marken</h4><p>{identification.rootSpread}</p></section>}
          {['flower', 'plant', 'fruit', 'vegetable'].includes(identification.category) && [
            ['habitat', 'Ursprung och växtplats'],
            ['floweringPeriod', ['fruit', 'vegetable'].includes(identification.category) ? 'Växt- och skördesäsong' : 'Blomningsperiod'],
            ['lifespan', 'Livslängd'],
            ['care', 'Solljus, vatten och jord'],
            ['toxicity', 'Giftighet för människor och husdjur'],
          ].map(([field, label]) => identification[field] && (
            <section key={field} aria-label={label}><h4>{label}</h4><p>{identification[field]}</p></section>
          ))}
          {['fruit', 'vegetable'].includes(identification.category) && [
            ['vitamins', 'Vitaminer'],
            ['benefit', 'Näringsfördelar'],
            ['curiosity', 'Intressant fakta'],
          ].map(([field, label]) => identification[field] && (
            <section key={field} aria-label={label}><h4>{label}</h4><p>{identification[field]}</p></section>
          ))}
          {['animal', 'fish', 'insect'].includes(identification.category) && [
            ['animalHabitat', 'Livsmiljö och utbredning'],
            ['animalSize', 'Storlek och vikt'],
            ['animalLifespan', 'Livslängd'],
            ['animalDiet', 'Föda och jaktbeteende'],
            ['animalPredators', 'Naturliga fiender'],
            ['animalMovement', identification.category === 'fish' ? 'Simning och vandring' : 'Hastighet och rörelse'],
            ['animalBehavior', 'Beteende, vinterdvala och migration'],
            ['animalRisks', 'Risker för människor'],
            ['animalConservation', 'Bevarandestatus'],
          ].map(([field, label]) => identification[field] && (
            <section key={field} aria-label={label}><h4>{label}</h4><p>{identification[field]}</p></section>
          ))}
          {identification.facts?.length > 0 && <ul>{identification.facts.map((fact, i) => <li key={i}>{fact}</li>)}</ul>}
          {identification.uncertain && <p>Artbestämningen är osäker.</p>}
          {identification.potentiallyPoisonous && <p role="alert">Kan vara giftig.</p>}
          <p>{identification.safetyNote || safetyMessage}</p>
        </article>
      )}
      <p style={{ fontSize: 12, opacity: 0.8 }}>{safetyMessage}</p>
    </section>
  )
}
