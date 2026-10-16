import { useMemo, useState } from 'react'

const STORAGE_KEY = 'viktkollen-smart-camera-object-bank-v1'
const PRESETS = [
  ['Nycklar', 'Vardag'], ['Mobil', 'Vardag'], ['Plånbok', 'Vardag'], ['Glasögon', 'Vardag'],
  ['Hörlurar', 'Elektronik'], ['Laddare', 'Elektronik'], ['Powerbank', 'Elektronik'], ['Dator', 'Elektronik'],
  ['Pass', 'Resa'], ['ID-kort', 'Resa'], ['Biljett', 'Resa'], ['Resväska', 'Resa'],
  ['Vattenflaska', 'Träning'], ['Träningsskor', 'Träning'], ['Träningskläder', 'Träning'],
  ['Lunchlåda', 'Jobb & skola'], ['Passerkort', 'Jobb & skola'], ['Anteckningsbok', 'Jobb & skola'],
  ['Tandborste', 'Hygien'], ['Deodorant', 'Hygien'], ['Hårborste', 'Hygien'],
  ['Paraply', 'Hem & övrigt'], ['Väska', 'Hem & övrigt'], ['Solglasögon', 'Hem & övrigt'],
].map(([name, category]) => ({ id: 'preset-' + name.toLocaleLowerCase('sv').replace(/[^a-zåäö0-9]+/g, '-'), name, category, custom: false }))

const CATEGORIES = ['Alla', 'Vardag', 'Elektronik', 'Resa', 'Träning', 'Jobb & skola', 'Hygien', 'Hem & övrigt']
const normalize = (value) => value.trim().toLocaleLowerCase('sv')
const loadCustom = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.name === 'string' && typeof item.category === 'string' && item.custom === true).slice(0, 200) : []
  } catch {
    return []
  }
}

export default function SmartCameraObjectBank({ onBack }) {
  const [customItems, setCustomItems] = useState(loadCustom)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Alla')
  const [name, setName] = useState('')
  const [newCategory, setNewCategory] = useState('Vardag')
  const [notice, setNotice] = useState('')
  const allItems = useMemo(() => [...PRESETS, ...customItems], [customItems])
  const visible = useMemo(() => allItems.filter((item) => (category === 'Alla' || item.category === category) && normalize(item.name).includes(normalize(search))), [allItems, category, search])

  function persist(next) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setCustomItems(next)
      setNotice('')
    } catch {
      setNotice('Kunde inte spara på den här enheten. Kontrollera webbläsarens lagringsinställningar.')
    }
  }

  function add(event) {
    event.preventDefault()
    const clean = name.trim().replace(/\\s+/g, ' ')
    if (!clean) return
    if (clean.length > 60) { setNotice('Namnet får vara högst 60 tecken.'); return }
    if (allItems.some((item) => normalize(item.name) === normalize(clean))) { setNotice('Föremålet finns redan i banken.'); return }
    if (customItems.length >= 200) { setNotice('Du kan lägga till högst 200 egna föremål.'); return }
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + String(customItems.length)
    persist([...customItems, { id: 'custom-' + id, name: clean, category: newCategory, custom: true }])
    setName('')
  }

  return (
    <section aria-label="Föremålsbank" style={{ color: '#fff', padding: '8px 0 24px' }}>
      <button type="button" className="secondary-button" onClick={onBack}>← Smart kamera</button>
      <h2 style={{ marginBottom: 4 }}>Föremålsbank</h2>
      <p style={{ color: '#b8c9e8' }}>Hitta vanliga föremål eller lägg till dina egna. Ingen kamera eller AI behövs.</p>
      <label style={{ display: 'grid', gap: 6, margin: '16px 0 12px' }}>Sök föremål
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="T.ex. nycklar, laddare, pass" style={{ padding: 12, borderRadius: 12, width: '100%', boxSizing: 'border-box' }} />
      </label>
      <label style={{ display: 'grid', gap: 6, marginBottom: 18 }}>Kategori
        <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ padding: 12, borderRadius: 12 }}>
          {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <div aria-live="polite" style={{ marginBottom: 10, color: '#c5d5ee' }}>{visible.length} föremål</div>
      <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0 }}>
        {visible.map((item) => (
          <li key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px', border: '1px solid #28395b', background: '#0b152b', borderRadius: 14 }}>
            <span><strong>{item.name}</strong><small style={{ display: 'block', color: '#a7bbd9' }}>{item.category}{item.custom ? ' · Eget föremål' : ''}</small></span>
            {item.custom && <button type="button" className="secondary-button" aria-label={'Ta bort ' + item.name} onClick={() => persist(customItems.filter((entry) => entry.id !== item.id))}>Ta bort</button>}
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p>Inga föremål matchar din sökning.</p>}
      <form onSubmit={add} style={{ marginTop: 24, display: 'grid', gap: 10 }}>
        <h3 style={{ marginBottom: 0 }}>Lägg till eget föremål</h3>
        <label style={{ display: 'grid', gap: 5 }}>Namn
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={61} placeholder="T.ex. husnyckel" style={{ padding: 12, borderRadius: 12 }} />
        </label>
        <label style={{ display: 'grid', gap: 5 }}>Kategori
          <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} style={{ padding: 12, borderRadius: 12 }}>
            {CATEGORIES.filter((value) => value !== 'Alla').map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <button type="submit" className="primary-button" disabled={!name.trim()}>Lägg till i banken</button>
        {notice && <p role="alert">{notice}</p>}
      </form>
      <p className="smart-camera-note">Egna föremål sparas lokalt i den här webbläsaren. De synkas inte mellan enheter. Checklistor kopplas på i nästa sprint.</p>
    </section>
  )
}
