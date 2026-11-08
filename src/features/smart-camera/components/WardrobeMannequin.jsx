import { isWardrobePhoto } from '../../../services/wardrobeStorage.js'

const priority = {
  'Jacka': 0, 'Tröja': 1, 'Skjorta': 1, 'Klänning': 1,
  'Byxor': 2, 'Jeans': 2, 'Skor': 3, 'Accessoar': 4, 'Annat': 5,
}

export default function WardrobeMannequin({ garments }) {
  const ordered = [...garments].sort((a, b) => (priority[a.type] ?? 5) - (priority[b.type] ?? 5))
  return <section className="wardrobe-mannequin wardrobe-outfit-stack" aria-label="Vald outfit">
    <h4>Din outfit</h4>
    {!ordered.length ? <p>Välj kläder ovan för att se dem här.</p> : (
      <ul className="wardrobe-outfit-stack-list">
        {ordered.map((garment) => <li key={garment.id}>
          {isWardrobePhoto(garment.image)
            ? <img src={garment.image} alt={garment.name} />
            : <div className="wardrobe-outfit-stack-color" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' }} aria-hidden="true" />}
          <span>{garment.name} · {garment.type}</span>
        </li>)}
      </ul>
    )}
  </section>
}
