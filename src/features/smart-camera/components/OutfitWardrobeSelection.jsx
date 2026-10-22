import { useState } from 'react'
import { readWardrobe } from '../../../services/wardrobeStorage.js'

export default function OutfitWardrobeSelection() {
  const [garments] = useState(() => readWardrobe().garments.filter((garment) => (
    garment && typeof garment.id === 'string' && typeof garment.name === 'string'
  )))
  const [selectedIds, setSelectedIds] = useState([])
  const selected = garments.filter((garment) => selectedIds.includes(garment.id))

  function toggleGarment(id) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id])
  }

  return (
    <section aria-label="Din garderob">
      <h3>Din garderob</h3>
      {garments.length ? (
        <fieldset>
          <legend>Välj ett eller flera plagg</legend>
          <ul className="notice-reminder-list">
            {garments.map((garment) => (
              <li key={garment.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(garment.id)}
                    onChange={() => toggleGarment(garment.id)}
                  />
                  {garment.name}{typeof garment.type === 'string' && garment.type ? ` · ${garment.type}` : ''}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <p>Du har inga sparade kläder. Lägg till plagg i Garderob – klädhjälp för att välja dem här.</p>
      )}
      <p role="status">
        <strong>Valda plagg:</strong> {selected.length ? selected.map((garment) => garment.name).join(', ') : 'Inga plagg valda.'}
      </p>
      <p className="smart-camera-note">Urvalet gäller medan den här vyn är öppen. Inga plagg markeras som använda och inga bilder analyseras.</p>
    </section>
  )
}
