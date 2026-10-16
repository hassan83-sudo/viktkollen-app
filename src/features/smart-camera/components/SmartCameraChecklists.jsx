import { useMemo, useState } from 'react'
import { PRESETS, loadCustom } from './SmartCameraObjectBank.jsx'

const KEY = 'viktkollen-smart-camera-checklists-v1'
const load = () => {
  try {
    const data = JSON.parse(window.localStorage.getItem(KEY) || '[]')
    return Array.isArray(data) ? data.filter((list) => list && typeof list.title === 'string' && Array.isArray(list.items)).slice(0, 50) : []
  } catch { return [] }
}
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)

export default function SmartCameraChecklists({ onBack, onOpenBank }) {
  const [lists, setLists] = useState(load)
  const [selectedId, setSelectedId] = useState(null)
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState('')
  const [bankCategory, setBankCategory] = useState('Alla')
  const [error, setError] = useState('')
  const bank = useMemo(() => [...PRESETS, ...loadCustom()], [])
  const active = lists.find((list) => list.id === selectedId)
  const categories = useMemo(() => ['Alla', ...new Set(bank.map((item) => item.category))], [bank])
  const results = useMemo(() => bank.filter((item) => (bankCategory === 'Alla' || item.category === bankCategory) && item.name.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv'))).slice(0, 100), [bank, query, bankCategory])

  function save(next) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
      setLists(next)
      setError('')
      return true
    } catch {
      setError('Kunde inte spara checklistorna på den här enheten.')
      return false
    }
  }
  function update(changed) { save(lists.map((list) => list.id === changed.id ? changed : list)) }
  function create(event) {
    event.preventDefault()
    const clean = title.trim()
    if (!clean || lists.length >= 50) return
    const list = { id: uid(), title: clean.slice(0, 60), items: [] }
    if (save([...lists, list])) { setSelectedId(list.id); setTitle('') }
  }
  function addItem(name) {
    if (!active || !name.trim()) return
    const clean = name.trim().slice(0, 60)
    if (active.items.some((item) => item.name.toLocaleLowerCase('sv') === clean.toLocaleLowerCase('sv'))) { setError('Finns redan på listan.'); return }
    if (active.items.length >= 150) { setError('Högst 150 punkter per lista.'); return }
    update({ ...active, items: [...active.items, { id: uid(), name: clean, done: false }] })
    setManual('')
    setQuery('')
  }
  function reset() { if (active) update({ ...active, items: active.items.map((item) => ({ ...item, done: false })) }) }

  return (
    <section aria-label="Mina checklistor" style={{ color: '#fff', padding: '8px 0 28px' }}>
      <button type="button" className="secondary-button" onClick={onBack}>← Smart kamera</button>
      <h2>Checklistor</h2>
      <p style={{ color: '#b9cae5' }}>Spara listor och bocka av manuellt. Ingen AI eller kamera behövs.</p>
      {error && <p role="alert" style={{ color: '#ffb7c6' }}>{error}</p>}
      {active ? (
        <>
          <button type="button" className="secondary-button" onClick={() => setSelectedId(null)}>← Alla listor</button>
          <h3>{active.title}</h3>
          <p>{active.items.filter((item) => item.done).length} av {active.items.length} klara</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" className="secondary-button" onClick={reset}>Börja om / avmarkera alla</button>
            <button type="button" className="secondary-button" onClick={() => { if (save([...lists, { ...active, id: uid(), title: (active.title + ' (kopia)').slice(0, 60), items: active.items.map((item) => ({ ...item, id: uid(), done: false })) }])) setSelectedId(null) }} disabled={lists.length >= 50}>Kopiera lista</button>
          </div>
          <ul style={{ padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {active.items.map((item) => (
              <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0c1931', border: '1px solid #29416b', borderRadius: 12, padding: 12 }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={item.done} onChange={() => update({ ...active, items: active.items.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) })} />
                  <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.name}</span>
                </label>
                <button type="button" className="secondary-button" aria-label={'Ta bort ' + item.name} onClick={() => update({ ...active, items: active.items.filter((entry) => entry.id !== item.id) })}>Ta bort</button>
              </li>
            ))}
          </ul>
          <h3>Lägg till från föremålsbanken</h3>
          <input aria-label="Sök i föremålsbanken" placeholder="Sök bland 623 föremål" value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 12 }} />
          <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>Välj kategori<select value={bankCategory} onChange={(event) => setBankCategory(event.target.value)} style={{ padding: 12, borderRadius: 12 }}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
          <p style={{ color: '#b9cae5' }}>Tryck på + för att lägga till ett föremål i listan. Visar högst 100 åt gången – använd sökning eller kategori för fler.</p>
          {results.length > 0 && <ul style={{ padding: 0, listStyle: 'none', maxHeight: 260, overflowY: 'auto' }}>{results.map((item) => <li key={item.id} style={{ padding: 5 }}><button type="button" className="secondary-button" onClick={() => addItem(item.name)}>+ {item.name} · {item.category}</button></li>)}</ul>}
          <form onSubmit={(event) => { event.preventDefault(); addItem(manual) }} style={{ display: 'grid', gap: 9, marginTop: 16 }}>
            <label>Egen punkt <input value={manual} maxLength={60} onChange={(event) => setManual(event.target.value)} placeholder="Skriv en egen sak" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 12 }} /></label>
            <button type="submit" className="primary-button" disabled={!manual.trim()}>Lägg till punkt</button>
          </form>
          <button type="button" className="secondary-button" onClick={onOpenBank} style={{ marginTop: 14 }}>Öppna föremålsbanken för att skapa egna föremål</button>
        </>
      ) : (
        <>
          <form onSubmit={create} style={{ display: 'grid', gap: 10, margin: '20px 0' }}>
            <label>Namn på ny lista<input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="T.ex. Packning till semestern" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 12 }} /></label>
            <button className="primary-button" type="submit" disabled={!title.trim() || lists.length >= 50}>Skapa lista</button>
          </form>
          {lists.length === 0 && <p>Du har inga checklistor ännu.</p>}
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
            {lists.map((list) => <li key={list.id} style={{ display: 'flex', gap: 8, padding: 12, background: '#0c1931', border: '1px solid #29416b', borderRadius: 12 }}>
              <button type="button" onClick={() => setSelectedId(list.id)} style={{ flex: 1, background: 'none', border: 0, color: '#fff', textAlign: 'left', cursor: 'pointer' }}><strong>{list.title}</strong><small style={{ display: 'block', color: '#aabfdb' }}>{list.items.filter((item) => item.done).length}/{list.items.length} klara</small></button>
              <button type="button" className="secondary-button" onClick={() => { if (window.confirm('Ta bort checklistan?')) save(lists.filter((entry) => entry.id !== list.id)) }}>Ta bort</button>
            </li>)}
          </ul>
        </>
      )}
      <p className="smart-camera-note">Listorna sparas lokalt i denna webbläsare och synkas inte mellan enheter.</p>
    </section>
  )
}
