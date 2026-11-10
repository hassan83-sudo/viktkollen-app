import { useRef, useState } from 'react'
import { garmentTypes } from '../../../services/wardrobeStorage.js'
import { createWardrobePhoto } from '../../../services/wardrobePhoto.js'

export default function WardrobeGarmentForm({ onAdd }) {
  const nameInput = useRef(null)
  const [name, setName] = useState('')
  const [type, setType] = useState(garmentTypes[0])
  const [color, setColor] = useState('#446fa4')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const cameraInput = useRef(null)
  const generation = useRef(0)

  async function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    const current = ++generation.current
    setBusy(true)
    setNotice('')
    try {
      const photo = await createWardrobePhoto(file)
      if (current !== generation.current) return
      setImage(photo)
      setNotice('Bilden är klar att sparas. Ange plaggets namn.')
    } catch {
      if (current === generation.current) setNotice('Bilden kunde inte läsas. Välj JPG, PNG eller WebP, högst 8 MB.')
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }

  const canSave = !busy && Boolean(name.trim())
  function save(nextPhoto) {
    const enteredName = nameInput.current?.value?.trim() || ''
    if (busy || !enteredName) {
      nameInput.current?.focus()
      return
    }
    if (onAdd({ name: enteredName.slice(0, 60), type, color, image })) {
      generation.current += 1
      if (nameInput.current) nameInput.current.value = ''
      setName('')
      setImage('')
      setNotice('Plagget är sparat lokalt.')
      if (nextPhoto) cameraInput.current?.click()
    }
  }

  return <form className="wardrobe-form" onSubmit={(event) => { event.preventDefault(); save(false) }} aria-label="Lägg till plagg">
    <h4>Lägg till plagg</h4>
    <p>Fotografera ett plagg eller välj en bild. Ange namn, typ och färg. Ingen AI-analys används.</p>
    <p>Bilden förminskas och GPS-metadata tas bort. Plagget sparas endast i den här webbläsaren.</p>
    <label>Ta bild med kameran<input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choosePhoto} disabled={busy} /></label>
    <label>Fotografera eller välj bild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={busy} /></label>
    {image && <>
      <img className="wardrobe-photo-preview" src={image} alt="Förhandsvisning av nytt plagg" />
      <button type="button" disabled={busy} onClick={() => { generation.current += 1; setImage(''); setNotice('') }}>Ta bort osparad bild</button>
    </>}
    <label htmlFor="wardrobe-new-garment-name">Plaggets namn</label>
    <input id="wardrobe-new-garment-name" ref={nameInput} type="text" autoComplete="off" maxLength={60} required onInput={(event) => setName(event.currentTarget.value)} />
    <label>Plaggtyp<select value={type} onChange={(e) => setType(e.target.value)}>{garmentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Färg på dockan<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
    <button type="submit" disabled={!canSave}>Spara plagg</button>
    <button type="button" disabled={!canSave} onClick={() => save(true)}>Spara och fota nästa</button>
    <p role="status">{busy ? 'Läser bilden…' : notice}</p>
  </form>
}
