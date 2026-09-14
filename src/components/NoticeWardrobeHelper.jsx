import { useMemo, useState } from 'react'

const STORAGE_KEY = 'viktkollen.notice.wardrobe.v1'
const clothingTypes = ['Tröja', 'Skjorta', 'Byxor', 'Jeans', 'Jacka', 'Skor', 'Annat']

function readWardrobe() {
  if (typeof window === 'undefined') return { garments: [], worn: [] }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      garments: Array.isArray(parsed.garments) ? parsed.garments : [],
      worn: Array.isArray(parsed.worn) ? parsed.worn : [],
    }
  } catch {
    return { garments: [], worn: [] }
  }
}

function saveWardrobe(state) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  return state
}

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

  const lastWornIds = useMemo(() => {
    const latest = wardrobe.worn[0]
    return new Set(latest?.garmentIds || [])
  }, [wardrobe.worn])

  const suggested = useMemo(() => {
    const visibleTypes = ['Tröja', 'Skjorta', 'Jacka']
    const preferred = wardrobe.garments.find((garment) => visibleTypes.includes(garment.type) && !lastWornIds.has(garment.id))
    return preferred || wardrobe.garments.find((garment) => !lastWornIds.has(garment.id)) || null
  }, [wardrobe.garments, lastWornIds])

  function update(next, message = '') {
    setWardrobe(saveWardrobe(next))
    if (message) onMessage?.(message)
  }

  function addGarment() {
    const cleanName = name.trim()
    if (!cleanName) {
      onMessage?.('Skriv namnet på plagget först.')
      return
    }
    const garment = { id: `garment-${Date.now()}`, name: cleanName, type, createdAt: new Date().toISOString() }
    update({ ...wardrobe, garments: [...wardrobe.garments, garment] }, `${cleanName} är tillagt i garderoben.`)
    setName('')
  }

  function markWorn(garmentId) {
    const today = new Date().toISOString().slice(0, 10)
    const existing = wardrobe.worn.find((entry) => entry.date === today)
    const garmentIds = Array.from(new Set([...(existing?.garmentIds || []), garmentId]))
    const nextEntry = { date: today, garmentIds, updatedAt: new Date().toISOString() }
    const worn = [nextEntry, ...wardrobe.worn.filter((entry) => entry.date !== today)].slice(0, 30)
    update({ ...wardrobe, worn }, 'Sparat som använt idag.')
  }

  function removeGarment(garmentId) {
    update({
      garments: wardrobe.garments.filter((garment) => garment.id !== garmentId),
      worn: wardrobe.worn.map((entry) => ({ ...entry, garmentIds: entry.garmentIds.filter((id) => id !== garmentId) })),
    }, 'Plagget är borttaget.')
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

      <p className="estimate-note">AI Ögat kan senare fylla på detta automatiskt från godkända garderobsbilder. Den här delen sparar bara sådant användaren själv lägger in eller bekräftar.</p>
    </div>
  )
}

export default NoticeWardrobeHelper
