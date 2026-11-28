import { useEffect, useRef, useState } from 'react'
import { requestNatureIdentification } from '../aiNatureAnalysisService.js'
import { requestAiNatureConsent } from '../aiNatureConsentService.js'
import { supabase } from '../../../services/supabaseClient.js'

const safetyMessage = 'Ät aldrig svampar, bär eller växter enbart utifrån en bildidentifiering.'

const animalCategoryLabels = {
  animal: 'Djur',
  bird: 'Djur (fågel)',
  fish: 'Djur (fisk)',
  insect: 'Insekt',
}

export default function AiNaturePanel({ onClose, analysisEnabled = false }) {
  const fileReaderRef = useRef(null)
  const [imageError, setImageError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [identification, setIdentification] = useState(null)
  const [busy, setBusy] = useState(false)
  const [previewName, setPreviewName] = useState('')
  const abortRef = useRef(null)

  useEffect(() => () => {
    fileReaderRef.current?.abort()
    abortRef.current?.abort()
  }, [])

  function selectFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    fileReaderRef.current?.abort()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setImageError('Välj en JPG-, PNG- eller WebP-bild på högst 8 MB.')
      return
    }
    const reader = new FileReader()
    fileReaderRef.current = reader
    reader.onload = () => {
      if (typeof reader.result === 'string') showAndAnalyze(reader.result)
    }
    reader.onerror = () => setImageError('Bilden kunde inte läsas.')
    reader.onloadend = () => {
      if (fileReaderRef.current === reader) fileReaderRef.current = null
    }
    reader.readAsDataURL(file)
  }

  function showAndAnalyze(image) {
    setPhoto(image)
    setIdentification(null)
    setImageError('')
    if (analysisEnabled) void identify(image)
  }

  async function identify(photoDataUrl) {
    abortRef.current?.abort()
    setPreviewName('')
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { data, error } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token
      if (error || !accessToken) throw new Error('Du behöver vara inloggad för att analysera bilden.')
      const image = await (await fetch(photoDataUrl, { signal: controller.signal })).blob()
      // The labeled image picker approves this exact image for analysis.
      const consentToken = await requestAiNatureConsent({ image, accessToken, signal: controller.signal })
      if (controller.signal.aborted) return
      const result = await requestNatureIdentification({ image, accessToken, consentToken, signal: controller.signal, onProgress: name => { if (!controller.signal.aborted) setPreviewName(name) } })
      if (!controller.signal.aborted) setIdentification(result)
    } catch (error) {
      if (!controller.signal.aborted) setImageError(error?.message || 'Analysen kunde inte genomföras.')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setPreviewName('')
        setBusy(false)
      }
    }
  }

  function reset() {
    fileReaderRef.current?.abort()
    abortRef.current?.abort()
    setPhoto(null)
    setIdentification(null)
    setImageError('')
  }

  const categoryLabel = animalCategoryLabels[identification?.category]

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
        {photo ? <img src={photo} alt="Vald naturbild" style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} /> : <span style={{ color: '#dcefe0', padding: 24, textAlign: 'center' }}>Ta en bild eller välj ett foto från din enhet.</span>}
      </div>

      <p style={{ fontSize: 13, opacity: 0.85 }}>
        {analysisEnabled
          ? 'När du väljer eller tar en bild för AI-analys skickas den direkt för att identifieras.'
          : 'AI-analysen är ännu inte aktiverad.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <label style={{ cursor: 'pointer', padding: '8px 12px', border: '1px solid currentColor', borderRadius: 8 }}>{analysisEnabled ? 'Välj bild för AI-analys' : 'Välj bild'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} style={{ display: 'none' }} /></label>
        {photo && <button type="button" onClick={reset}>Välj en annan bild</button>}
      </div>

      {imageError && <p role="alert">{imageError}</p>}
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
          {categoryLabel && <p><strong>Kategori: {categoryLabel}</strong></p>}
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
