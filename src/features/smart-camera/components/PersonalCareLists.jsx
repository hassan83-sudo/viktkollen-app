import { useState } from 'react'

const STORAGE_KEY = 'viktkollen-personal-care-lists-v1'
const LEGACY_KEY = 'viktkollen-smart-camera-care-notes-v1'

const suggestions = {
  'Mat & dryck': ['Favoritsoppa', 'Te', 'Favoritfrukt', 'En enkel middag'],
  'Film & serier': ['En favoritfilm', 'En rolig serie', 'En dokumentär'],
  'Musik & poddar': ['Min lugna spellista', 'En favoritpodd', 'En ljudbok'],
  'Saker jag vill göra': ['En kort promenad', 'Läsa en bok', 'Ringa en vän', 'Vila en stund'],
  'Det här brukar hjälpa mig': ['Lägga fram vatten', 'Ta en varm dusch', 'Använda min värmekudde'],
}

function loadLists() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(saved)) return saved
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '{}')
    const entries = [
      ['Mat & dryck', old?.food],
      ['Saker jag vill göra', old?.activities],
      ['Det här brukar hjälpa mig', old?.comfort],
    ].filter(([, text]) => typeof text === 'string' && text.trim())
    return entries.length
      ? [{ id: 'previous-notes', title: 'Tidigare anteckningar', entries: entries.map(([category, text], id) => ({ id, category, text })) }]
      : []
  } catch {
    return []
  }
}

export default function PersonalCareLists() {
  const [lists, setLists] = useState(loadLists)
  const [selected, setSelected] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Mat & dryck')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const active = lists.find((list) => list.id === selected)
  const heading = category === 'Egen rubrik' ? custom.trim() : category

  function save(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setLists(next)
      setError('')
      return true
    } catch {
      setError('Det gick inte att spara i den här webbläsaren.')
      return false
    }
  }

  function create(event) {
    event.preventDefault()
    if (!title.trim()) return
    const id = crypto.randomUUID()
    if (save([...lists, { id, title: title.trim(), entries: [] }])) {
      setSelected(id)
      setTitle('')
    }
  }

  function add(text) {
    const clean = text.trim()
    if (!active || !clean || !heading) return
    if (active.entries.some((entry) => entry.category === heading && entry.text === clean)) {
      setError('Punkten finns redan på listan.')
      return
    }
    const entry = { id: crypto.randomUUID(), category: heading, text: clean }
    if (save(lists.map((list) => list.id === selected ? { ...list, entries: [...list.entries, entry] } : list))) setNote('')
  }

  return (
    <section aria-label="Mina egenvårdslistor">
      <h4>Mina egenvårdslistor</h4>
      {error && <p role="alert">{error}</p>}
      {active ? (
        <>
          <button type="button" className="secondary-button" onClick={() => { setSelected(''); setNote(''); setError('') }}>Alla egenvårdslistor</button>
          <h5>{active.title}</h5>
          {[...new Set(active.entries.map((entry) => entry.category))].map((name) => (
            <section key={name} aria-label={name}>
              <strong>{name}</strong>
              <ul>
                {active.entries.filter((entry) => entry.category === name).map((entry) => (
                  <li key={entry.id} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                    {entry.text}{' '}
                    <button type="button" className="secondary-button" aria-label={`Ta bort ${entry.text}`} onClick={() => save(lists.map((list) => list.id === selected ? { ...list, entries: list.entries.filter((item) => item.id !== entry.id) } : list))}>Ta bort</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <form onSubmit={(event) => { event.preventDefault(); add(note) }} style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>Rubrik
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {[...new Set([...Object.keys(suggestions), ...active.entries.map((entry) => entry.category), 'Egen rubrik'])].map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            {category === 'Egen rubrik' && <label style={{ display: 'grid', gap: 4 }}>Egen rubrik <input value={custom} maxLength={60} onChange={(event) => setCustom(event.target.value)} /></label>}
            <label style={{ display: 'grid', gap: 4 }}>Egen punkt <textarea rows={2} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></label>
            <button type="submit" className="primary-button" disabled={!heading || !note.trim()}>Lägg till egen punkt</button>
          </form>
          {Object.hasOwn(suggestions, category) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {suggestions[category].map((text) => <button key={text} type="button" className="secondary-button" onClick={() => add(text)}>+ {text}</button>)}
            </div>
          )}
        </>
      ) : (
        <>
          <form onSubmit={create} style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>Namn på egenvårdslistan
              <input value={title} maxLength={60} placeholder="T.ex. Min sjukdag" onChange={(event) => setTitle(event.target.value)} />
            </label>
            <button type="submit" className="primary-button" disabled={!title.trim()}>Skapa egen lista</button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {lists.map((list) => (
              <li key={list.id}>
                <button type="button" className="secondary-button" onClick={() => { setSelected(list.id); setCategory('Mat & dryck') }}>{list.title}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="smart-camera-note">Egenvårdslistorna sparas i den här webbläsaren.</p>
    </section>
  )
}
