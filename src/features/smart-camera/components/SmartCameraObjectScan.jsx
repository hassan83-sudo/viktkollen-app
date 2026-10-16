import { useRef, useState } from 'react'
import SmartCameraLiveView from './SmartCameraLiveView.jsx'
import { OBJECT_BANK_STORAGE_KEY, PRESETS, loadCustom } from './SmartCameraObjectBank.jsx'
import { scanObjectBankPhoto } from '../../../services/objectBankScan.js'

const normalize = (value) => value.trim().toLocaleLowerCase('sv')
const createId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)

export default function SmartCameraObjectScan({ onBack, onCameraActive, onOpenBank }) {
  const camera = useRef(null)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [selected, setSelected] = useState([])
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('Hem & övrigt')

  function capture() {
    const frame = camera.current?.captureFrame?.()
    if (!frame) { setMessage('Starta kameran och försök igen.'); return }
    setPending(frame)
    setSuggestions([])
    setSelected([])
    setMessage('')
  }

  async function approve() {
    const frame = pending
    if (!frame || busy) return
    setPending(null)
    setBusy(true)
    setMessage('')
    const response = await scanObjectBankPhoto({ canvas: frame, consentApproved: true })
    setBusy(false)
    if (!response.ok) { setMessage('Analysen kunde inte genomföras. Du kan alltid lägga till föremål manuellt i banken.'); return }
    const names = response.result.items.filter((item) => typeof item === 'string').slice(0, 12)
    setSuggestions(names)
    setSelected(names)
    if (!names.length) setMessage('Inga tydliga föremål identifierades. Försök med bättre ljus.')
  }

  function saveSuggestions() {
    const existing = loadCustom()
    const existingNames = new Set([...PRESETS, ...existing].map((item) => normalize(item.name)))
    const additions = selected.filter((name) => !existingNames.has(normalize(name))).slice(0, Math.max(0, 200 - existing.length)).map((name) => ({
      id: 'custom-' + createId(), name: name.slice(0, 60), category, custom: true,
    }))
    if (!additions.length) { setMessage('De valda föremålen finns redan i banken, eller så är gränsen för egna föremål nådd.'); return }
    try {
      window.localStorage.setItem(OBJECT_BANK_STORAGE_KEY, JSON.stringify([...existing, ...additions]))
      setSuggestions([])
      setSelected([])
      setMessage(additions.length + ' föremål sparade i banken.')
    } catch {
      setMessage('Kunde inte spara. Kontrollera lagringsinställningarna.')
    }
  }

  return (
    <section style={{ color: '#fff', padding: '8px 0 26px' }} aria-label="Identifiera föremål">
      <button type="button" className="secondary-button" onClick={onBack}>← Smart kamera</button>
      <h2>Identifiera föremål</h2>
      <p>Visa föremålen för kameran och ta en stillbild. AI föreslår namn, men du bestämmer vad som sparas.</p>
      <SmartCameraLiveView ref={camera} enabled facingMode="environment" onActiveChange={onCameraActive} />
      {!pending && <button type="button" className="primary-button" disabled={busy} onClick={capture}>{busy ? 'Analyserar…' : 'Ta bild för förslag'}</button>}
      {pending && <div style={{ padding: 14, border: '1px solid #405b92', borderRadius: 14, marginTop: 12 }}>
        <strong>Godkänn bildanalys</strong>
        <p>Om du fortsätter skickas en enda stillbild till AI för att identifiera synliga föremål. Ingen video skickas. Bilden sparas inte i föremålsbanken. Undvik personer, privata dokument och känsliga uppgifter i bilden. AI-analysen kan förbruka din AI-kvot.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary-button" onClick={approve}>Skicka bilden för analys</button>
          <button type="button" className="secondary-button" onClick={() => setPending(null)}>Avbryt</button>
        </div>
      </div>}
      {suggestions.length > 0 && <div style={{ marginTop: 18 }}>
        <h3>AI:s förslag – välj vad som ska sparas</h3>
        <p>Förslagen kan vara felaktiga. Kontrollera namnen innan du sparar.</p>
        {suggestions.map((name) => {
          const exists = [...PRESETS, ...loadCustom()].some((item) => normalize(item.name) === normalize(name))
          return <label key={name} style={{ display: 'flex', gap: 10, padding: 10, borderBottom: '1px solid #34415c' }}>
            <input type="checkbox" checked={selected.includes(name)} disabled={exists} onChange={(event) => setSelected((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name))} />
            <span>{name}{exists ? ' · Finns redan i banken' : ''}</span>
          </label>
        })}
        <label style={{ display: 'grid', gap: 6, margin: '16px 0' }}>Kategori för nya föremål
          <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ padding: 12, borderRadius: 10 }}>
            {['Vardag', 'Elektronik', 'Resa', 'Träning', 'Jobb & skola', 'Hygien', 'Hem & övrigt', 'Kläder & accessoarer', 'Kök & mat', 'Barn & familj', 'Fritid & hobby'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button" disabled={!selected.length} onClick={saveSuggestions}>Spara valda föremål</button>
      </div>}
      {message && <p role="status" style={{ marginTop: 12 }}>{message}</p>}
      <button type="button" className="secondary-button" style={{ marginTop: 16 }} onClick={onOpenBank}>Öppna föremålsbanken</button>
    </section>
  )
}
