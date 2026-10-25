import { useEffect, useRef, useState } from 'react'
import { garmentTypes } from '../../../services/wardrobeStorage.js'
import { createWardrobePhoto, wardrobePhotoCanvas } from '../../../services/wardrobePhoto.js'
import { scanObjectBankPhoto } from '../../../services/objectBankScan.js'
import { validateWardrobeReview } from '../../../services/wardrobeReview.js'
import { isWardrobeOffline } from '../../../services/supabaseClient.js'

const rejectionMessages = {
  person: 'Bilden avvisades eftersom en person eller kroppsdel syns. Fotografera plagget utan människor eller händer.',
  multiple: 'Fotografera ett plagg åt gången. Ett par skor går bra.',
  not_clothing: 'Fotografera ett klädesplagg eller ett par skor.',
  uncertain: 'Bilden kunde inte godkännas säkert. Ta en tydligare bild av hela plagget.',
}

export default function WardrobeGarmentForm({ onAdd }) {
  const [name, setName] = useState('')
  const [type, setType] = useState(garmentTypes[0])
  const [color, setColor] = useState('#446fa4')
  const [image, setImage] = useState('')
  const [approvedImage, setApprovedImage] = useState('')
  const [localConsent, setLocalConsent] = useState(false)
  const [remoteConsent, setRemoteConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const cameraInput = useRef(null)
  const operation = useRef(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1; operation.current?.abort() }, [])

  function discardPhoto() {
    generation.current += 1
    operation.current?.abort()
    operation.current = null
    setImage(''); setApprovedImage(''); setBusy(false)
  }

  async function recognize(photo, current) {
    if (isWardrobeOffline || !remoteConsent || operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true); setNotice('')
    try {
      const canvas = await wardrobePhotoCanvas(photo)
      if (controller.signal.aborted) return
      const response = await scanObjectBankPhoto({ canvas, consentApproved: true, signal: controller.signal, mode: 'wardrobe' })
      if (current !== generation.current) return
      if (!response.ok) {
        setImage(''); setApprovedImage('')
        setNotice('AI-granskningen är inte tillgänglig. Bilden sparas inte. Du kan registrera plagget utan bild eller försöka igen.')
        return
      }
      const result = validateWardrobeReview(response.result)
      if (result.verdict !== 'garment') {
        setImage(''); setApprovedImage('')
        setNotice(rejectionMessages[result.reason])
        return
      }
      setApprovedImage(photo)
      setName(result.name); setType(result.category); setColor(result.colorHex)
      setNotice(`AI föreslår ${result.name}, ${result.colorName}. Kontrollera och rätta uppgifterna före sparning.`)
    } catch {
      if (current === generation.current) {
        setImage(''); setApprovedImage('')
        setNotice('Bilden kunde inte granskas och sparas inte. Du kan registrera plagget utan bild.')
      }
    } finally {
      if (current === generation.current) setBusy(false)
      if (operation.current === controller) operation.current = null
    }
  }

  async function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || operation.current || busy) return
    const current = ++generation.current
    setBusy(true); setImage(''); setApprovedImage(''); setName(''); setNotice('')
    try {
      const result = await createWardrobePhoto(file)
      if (current !== generation.current) return
      setImage(result)
      if (remoteConsent && !isWardrobeOffline) await recognize(result, current)
      else setNotice('Bilden måste AI-granskas innan den får sparas.')
    } catch {
      if (current === generation.current) setNotice('Bilden kunde inte läsas. Välj JPG, PNG eller WebP, högst 8 MB.')
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }

  const canSave = !busy && Boolean(name.trim()) && (!image || (image === approvedImage && localConsent && remoteConsent))
  function save(nextPhoto) {
    if (!canSave) return
    if (onAdd({ name: name.trim().slice(0, 60), type, color, image })) {
      generation.current += 1
      setName(''); setImage(''); setApprovedImage('')
      setNotice('Plagget är sparat lokalt.')
      // Keep this in the user's click; browsers may block delayed camera opening.
      if (nextPhoto) cameraInput.current?.click()
    }
  }

  return <form className="wardrobe-form" onSubmit={(event) => { event.preventDefault(); save(false) }} aria-label="Lägg till plagg">
    <h4>Lägg till plagg</h4>
    <p>Lägg ett plagg plant på en enfärgad säng eller häng det på en galge. Få med hela plagget i bra ljus. Undvik människor, händer och privata uppgifter.</p>
    <p>Bilden förminskas och metadata som GPS tas bort. AI-granskning krävs för att spara en bild. AI kan göra fel.</p>
    <label><input type="checkbox" checked={localConsent} disabled={busy} onChange={(e) => setLocalConsent(e.target.checked)} />Jag godkänner att godkända plaggbilder sparas i den här webbläsaren.</label>
    <label><input type="checkbox" checked={remoteConsent} disabled={busy || isWardrobeOffline} onChange={(e) => setRemoteConsent(e.target.checked)} />Jag godkänner att bilder jag väljer i detta formulär skickas för AI-analys.</label>
    <label>Ta bild med kameran<input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choosePhoto} disabled={busy} /></label>
    <label>Fotografera eller välj bild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={busy} /></label>
    {image && <>
      <img className="wardrobe-photo-preview" src={image} alt="Förhandsvisning av nytt plagg" />
      <button type="button" disabled={busy} onClick={discardPhoto}>Ta bort osparad bild</button>
      {!approvedImage && <button type="button" disabled={busy || !remoteConsent || isWardrobeOffline} onClick={() => recognize(image, generation.current)}>Granska vald bild</button>}
    </>}
    {isWardrobeOffline && <p>Offline-Preview: AI är avstängd. Registrera plagg utan bild; bilder kan inte godkännas här.</p>}
    <label>Plaggets namn<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
    <label>Plaggtyp<select value={type} onChange={(e) => setType(e.target.value)}>{garmentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Färg på dockan<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
    <button type="submit" disabled={!canSave}>Spara plagg</button>
    <button type="button" disabled={!canSave} onClick={() => save(true)}>Spara och fota nästa</button>
    <p role="status">{busy ? 'Granskar bilden…' : notice}</p>
  </form>
}
