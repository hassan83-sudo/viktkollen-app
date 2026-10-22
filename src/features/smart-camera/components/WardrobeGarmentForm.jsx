import { useEffect, useRef, useState } from 'react'
import { garmentTypes } from '../../../services/wardrobeStorage.js'
import { createWardrobePhoto, wardrobePhotoCanvas } from '../../../services/wardrobePhoto.js'
import { scanObjectBankPhoto } from '../../../services/objectBankScan.js'

export default function WardrobeGarmentForm({ onAdd }) {
  const [name, setName] = useState('')
  const [type, setType] = useState(garmentTypes[0])
  const [color, setColor] = useState('#446fa4')
  const [image, setImage] = useState('')
  const [localConsent, setLocalConsent] = useState(false)
  const [remoteConsent, setRemoteConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const operation = useRef(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1; operation.current?.abort() }, [])

  async function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || operation.current) return
    const current = ++generation.current
    setBusy(true); setImage(''); setLocalConsent(false); setRemoteConsent(false); setSuggestions([]); setNotice('')
    try {
      const result = await createWardrobePhoto(file)
      if (current === generation.current) setImage(result)
    } catch {
      if (current === generation.current) setNotice('Bilden kunde inte läsas. Välj JPG, PNG eller WebP, högst 8 MB.')
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }

  async function recognize() {
    if (!remoteConsent || !image || busy || operation.current) return
    const controller = new AbortController()
    operation.current = controller
    const current = generation.current
    setBusy(true); setNotice(''); setSuggestions([]); setRemoteConsent(false)
    try {
      const canvas = await wardrobePhotoCanvas(image)
      if (controller.signal.aborted) return
      const result = await scanObjectBankPhoto({ canvas, consentApproved: true, signal: controller.signal })
      if (current !== generation.current) return
      if (!result.ok) setNotice('AI-förslag är inte tillgängliga nu. Du kan lägga till plagget manuellt.')
      else {
        setSuggestions(result.result.items)
        setNotice(result.result.items.length ? 'Kontrollera förslagen. Välj ett namn och ange plaggtyp själv.' : 'Inga föremål identifierades. Ange namnet själv.')
      }
    } catch {
      if (current === generation.current) setNotice('Bilden kunde inte analyseras. Ange plagget manuellt.')
    } finally {
      if (current === generation.current) setBusy(false)
      if (operation.current === controller) operation.current = null
    }
  }

  function submit(event) {
    event.preventDefault()
    if (busy || !name.trim() || (image && !localConsent)) return
    if (onAdd({ name: name.trim().slice(0, 60), type, color, image })) {
      generation.current += 1
      setName(''); setImage(''); setLocalConsent(false); setRemoteConsent(false); setSuggestions([]); setNotice('Plagget är sparat lokalt.')
    }
  }

  return <form className="wardrobe-form" onSubmit={submit} aria-label="Lägg till plagg">
    <h4>Lägg till plagg</h4>
    <p>Fotografera bara plagget. Undvik personer och privata uppgifter. Bilden förminskas och metadata som GPS tas bort innan den kan sparas.</p>
    <label>Ta bild med kameran<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choosePhoto} disabled={busy} /></label>
    <label>Fotografera eller välj bild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={busy} /></label>
    {image && <>
      <img className="wardrobe-photo-preview" src={image} alt="Förhandsvisning av nytt plagg" />
      <label><input type="checkbox" checked={localConsent} onChange={(e) => setLocalConsent(e.target.checked)} />Jag godkänner att bilden sparas i den här webbläsaren.</label>
      <button type="button" disabled={busy} onClick={() => { setImage(''); setLocalConsent(false); setRemoteConsent(false); setSuggestions([]) }}>Ta bort osparad bild</button>
      <details><summary>Frivilliga AI-förslag</summary>
        <p>Bara denna bild skickas till appens befintliga AI-analys. Inloggning, kvoter och serverns gränser gäller. Förslag kan vara fel och identifierar föremål, inte passform. Ingen automatisk analys sker.</p>
        <label><input type="checkbox" checked={remoteConsent} disabled={busy} onChange={(e) => setRemoteConsent(e.target.checked)} />Jag godkänner att denna bild skickas för AI-analys.</label>
        <button type="button" disabled={busy || !remoteConsent} onClick={recognize}>Analysera vald bild</button>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setName(suggestion.slice(0, 60))}>Använd namnet: {suggestion}</button>)}
      </details>
    </>}
    <label>Plaggets namn<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
    <label>Plaggtyp<select value={type} onChange={(e) => setType(e.target.value)}>{garmentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Färg på dockan<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
    <button type="submit" disabled={busy || !name.trim() || Boolean(image && !localConsent)}>Spara plagg</button>
    <p role="status">{busy ? 'Bearbetar bilden…' : notice}</p>
  </form>
}
