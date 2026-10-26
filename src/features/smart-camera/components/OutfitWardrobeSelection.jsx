import { useEffect, useState } from 'react'
import { garmentTypes, isWardrobePhoto, markWardrobeWorn, readWardrobe, removeWardrobeGarment, updateWardrobe, wardrobeChangedEvent } from '../../../services/wardrobeStorage.js'
import WardrobeGarmentForm from './WardrobeGarmentForm.jsx'
import WardrobeMannequin from './WardrobeMannequin.jsx'
import './wardrobe.css'

export default function OutfitWardrobeSelection() {
  const [wardrobe, setWardrobe] = useState(readWardrobe)
  const [query, setQuery] = useState('')
  const [outfitName, setOutfitName] = useState('')
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [editing, setEditing] = useState(null)
  useEffect(() => {
    const refresh = () => setWardrobe(readWardrobe())
    window.addEventListener(wardrobeChangedEvent, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener(wardrobeChangedEvent, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const selected = wardrobe.selectedGarmentIds.map((id) => wardrobe.garments.find((garment) => garment.id === id)).filter(Boolean)
  const garments = wardrobe.garments.filter((garment) => `${garment.name} ${garment.type}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  function save(change) {
    try { setWardrobe(updateWardrobe(change)); setNotice(''); return true } catch {
      setNotice('Kunde inte spara lokalt. Lagringen kan vara full eller blockerad. Ta bort bilder och försök igen.'); return false
    }
  }

  function toggleGarment(id) {
    save((current) => ({ ...current, selectedGarmentIds: current.selectedGarmentIds.includes(id)
      ? current.selectedGarmentIds.filter((selectedId) => selectedId !== id)
      : [...current.selectedGarmentIds, id] }))
  }

  return (
    <section aria-label="Din garderob" className="digital-wardrobe">
      <h3>Din garderob</h3>
      <p>Plagg, bilder och outfits sparas bara i den här webbläsarprofilen, utan molnsynk eller krypterad förvaring. Andra som använder samma profil kan se dem. Rensar du webbläsardata försvinner garderoben.</p>
      <WardrobeGarmentForm onAdd={(garment) => {
        if (wardrobe.garments.length >= 100) { setNotice('Garderoben rymmer högst 100 plagg. Ta bort ett först.'); return false }
        return save((current) => ({ ...current, garments: [...current.garments, { ...garment, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] }))
      }} />
      <label>Sök plagg<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="wardrobe-layout"><div>
      {wardrobe.garments.length ? (
        <fieldset>
          <legend>Välj ett eller flera plagg</legend>
          <ul className="wardrobe-grid">
            {garments.map((garment) => (
              <li key={garment.id}>
                {isWardrobePhoto(garment.image) ? <img className="wardrobe-thumbnail" src={garment.image} alt={garment.name} /> : <span className="wardrobe-placeholder" aria-hidden="true">👕</span>}
                <label>
                  <input
                    type="checkbox"
                    checked={wardrobe.selectedGarmentIds.includes(garment.id)}
                    onChange={() => toggleGarment(garment.id)}
                  />
                  {garment.name}{typeof garment.type === 'string' && garment.type ? ` · ${garment.type}` : ''}
                </label>
                {editing?.id === garment.id ? <form aria-label={`Redigera ${garment.name}`} onSubmit={(event) => {
                  event.preventDefault()
                  if (!editing.name.trim() || !garmentTypes.includes(editing.type) || !/^#[0-9a-f]{6}$/i.test(editing.color)) return
                  if (save((current) => ({ ...current, garments: current.garments.map((item) => item.id === editing.id
                    ? { ...item, name: editing.name.trim().slice(0, 60), type: editing.type, color: editing.color } : item) }))) {
                    setEditing(null); setNotice('Plaggets uppgifter har sparats.')
                  }
                }}>
                  <label>Nytt namn<input required maxLength={60} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
                  <label>Ny plaggtyp<select value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value })}>{garmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                  <label>Ny färg<input type="color" value={editing.color} onChange={(event) => setEditing({ ...editing, color: event.target.value })} /></label>
                  <button type="submit">Spara ändringar</button>
                  <button type="button" onClick={() => setEditing(null)}>Avbryt redigering</button>
                </form> : <button type="button" onClick={() => setEditing({ id: garment.id, name: garment.name,
                  type: garmentTypes.includes(garment.type) ? garment.type : garmentTypes[0], color: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' })}>Redigera {garment.name}</button>}
                {deleting === garment.id ? <div>
                  <p>Radera {garment.name}, bilden och dess kopplingar till outfits och historik?</p>
                  <button type="button" onClick={() => {
                    try { setWardrobe(removeWardrobeGarment(garment.id)); setDeleting(null); setNotice('Plagget och bilden har raderats.') } catch { setNotice('Kunde inte radera plagget.') }
                  }}>Bekräfta radering</button>
                  <button type="button" onClick={() => setDeleting(null)}>Avbryt</button>
                </div> : <button type="button" onClick={() => setDeleting(garment.id)}>Ta bort {garment.name}</button>}
              </li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <p>Du har inga sparade kläder. Lägg till ett plagg ovan eller i Garderob – klädhjälp.</p>
      )}
      <p aria-live="polite" data-testid="wardrobe-selection">
        <strong>Valda plagg:</strong> {selected.length ? selected.map((garment) => garment.name).join(', ') : 'Inga plagg valda.'}
      </p>
      <button type="button" disabled={!selected.length} onClick={() => save((current) => ({ ...current, selectedGarmentIds: [] }))}>Avmarkera alla</button>
      <button type="button" disabled={!selected.length} onClick={() => {
        try { setWardrobe(markWardrobeWorn(selected.map((garment) => garment.id))); setNotice('Valda plagg har markerats som använda idag.') } catch { setNotice('Kunde inte spara användningen.') }
      }}>Jag har dessa idag</button>
      <p>Urvalet sparas. Historiken ändras först när du väljer ”Jag har dessa idag”.</p>
      </div><WardrobeMannequin garments={selected} /></div>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (!outfitName.trim() || !selected.length) return
        if (wardrobe.outfits.length >= 30) { setNotice('Du kan spara högst 30 outfits.'); return }
        if (save((current) => ({ ...current, outfits: [...current.outfits, { id: crypto.randomUUID(), name: outfitName.trim(), garmentIds: selected.map((garment) => garment.id) }] }))) setOutfitName('')
      }}>
        <label>Outfitens namn<input value={outfitName} onChange={(event) => setOutfitName(event.target.value)} maxLength={60} /></label>
        <button disabled={!outfitName.trim() || !selected.length}>Spara outfit</button>
      </form>
      <h4>Sparade outfits</h4>
      {!wardrobe.outfits.length && <p>Inga outfits sparade ännu.</p>}
      <ul className="wardrobe-outfits">{wardrobe.outfits.map((outfit) => <li key={outfit.id}>
        <strong>{outfit.name}</strong><p>{outfit.garmentIds.map((id) => wardrobe.garments.find((garment) => garment.id === id)?.name).filter(Boolean).join(', ') || 'Inga plagg kvar.'}</p>
        <button type="button" onClick={() => save((current) => ({ ...current, selectedGarmentIds: outfit.garmentIds.filter((id) => current.garments.some((garment) => garment.id === id)) }))}>Välj {outfit.name}</button>
        <button type="button" onClick={() => save((current) => ({ ...current, outfits: current.outfits.filter((item) => item.id !== outfit.id) }))}>Radera outfit {outfit.name}</button>
      </li>)}</ul>
      <p role="status">{notice}</p>
    </section>
  )
}
