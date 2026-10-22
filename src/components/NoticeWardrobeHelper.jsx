import { useEffect, useMemo, useState } from 'react'
import { readWardrobe, updateWardrobe, garmentTypes, wardrobeChangedEvent, markWardrobeWorn, removeWardrobeGarment } from '../services/wardrobeStorage.js'

const clothingTypes = garmentTypes

function dateLabel(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' }).format(new Date(value))
  } catch {
    return value
  }
}

function NoticeWardrobeHelper({ onClose, onMessage }) {
  const [wardrobe, setWardrobe] = useState(readWardrobe)
  const [name, setName] = useState('')
  const [type, setType] = useState('Tröja')
  useEffect(() => {
    const refresh = () => setWardrobe(readWardrobe())
    window.addEventListener(wardrobeChangedEvent, refresh)
    return () => window.removeEventListener(wardrobeChangedEvent, refresh)
  }, [])

  const lastWornIds = useMemo(() => {
    const latest = wardrobe.worn[0]
    return new Set(latest?.garmentIds || [])
  }, [wardrobe.worn])

  const suggested = useMemo(() => {
    const visibleTypes = ['Tröja', 'Skjorta', 'Jacka']
    const preferred = wardrobe.garments.find((garment) => visibleTypes.includes(garment.type) && !lastWornIds.has(garment.id))
    return preferred || wardrobe.garments.find((garment) => !lastWornIds.has(garment.id)) || null
  }, [wardrobe.garments, lastWornIds])

  function update(action, message = '') {
    try { setWardrobe(action()); if (message) onMessage?.(message) }
    catch { onMessage?.('Garderoben kunde inte sparas. Frigör lokal lagring och försök igen.') }
  }

  function addGarment() {
    const cleanName = name.trim()
    if (!cleanName) {
      onMessage?.('Skriv namnet på plagget först.')
      return
    }
    const garment = { id: `garment-${crypto.randomUUID()}`, name: cleanName.slice(0, 60), type, createdAt: new Date().toISOString() }
    update(() => updateWardrobe((s) => ({ ...s, garments: [...s.garments, garment] })), `${cleanName} är tillagt i garderoben.`)
    setName('')
  }

  function markWorn(garmentId) {
    update(() => markWardrobeWorn([garmentId]), 'Sparat som använt idag.')
  }

  function removeGarment(garmentId) {
    update(() => removeWardrobeGarment(garmentId), 'Plagget är borttaget.')
  }

  const latest = wardrobe.worn[0]
  const latestNames = latest?.garmentIds
    ?.map((id) => wardrobe.garments.find((garment) => garment.id === id)?.name)
    .filter(Boolean) || []

  return (
    <div className="notice-room-panel" aria-labelledby="wardrobe-heading">
      <div className="notice-actions">
        <h3 id="wardrobe-heading">Garderob – klädhjälp</h3>
        <button type="button" onClick={onClose}>Stäng</button>
      </div>
      <p>Spara plagg och vad du använder. Då kan Viktkollen föreslå ett synligt plagg att byta nästa gång.</p>

      <div className="notice-form-grid">
        <label>Plagg<input value={name} placeholder="t.ex. blå tröja" onChange={(event) => setName(event.target.value)} /></label>
        <label>Typ<select value={type} onChange={(event) => setType(event.target.value)}>{clothingTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="notice-actions"><button className="primary-button" type="button" onClick={addGarment}>Lägg till plagg</button></div>

      {suggested && <p className="notice-confirmation"><strong>Förslag idag:</strong> {suggested.name}. Byt gärna det synliga plagget först, medan byxor kan vara samma om du vill.</p>}
      {!suggested && wardrobe.garments.length === 0 && <p className="estimate-note">Lägg till några plagg så kan garderoben börja ge förslag.</p>}

      {latest && <p><strong>Senast sparat ({dateLabel(latest.date)}):</strong> {latestNames.length ? latestNames.join(', ') : 'inga plagg kvar i posten'}</p>}

      {wardrobe.garments.length > 0 && <ul className="notice-reminder-list">
        {wardrobe.garments.map((garment) => (
          <li key={garment.id}>
            <strong>{garment.name}</strong>
            <span>{garment.type}{lastWornIds.has(garment.id) ? ' · använd senast' : ''}</span>
            <div className="notice-actions">
              <button type="button" onClick={() => markWorn(garment.id)}>Jag har den idag</button>
              <button type="button" onClick={() => removeGarment(garment.id)}>Ta bort</button>
            </div>
          </li>
        ))}
      </ul>}

      <p className="estimate-note">I Smart kamera → Kläder & stil kan du lägga till bilder och kombinera outfits. Garderoben sparar bara sådant du själv lägger in eller bekräftar.</p>
    </div>
  )
}

export default NoticeWardrobeHelper
