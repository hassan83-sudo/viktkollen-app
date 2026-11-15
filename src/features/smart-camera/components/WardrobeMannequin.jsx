import { useCallback, useEffect, useState } from 'react'
import { garmentSlot, isWardrobePhoto } from '../../../services/wardrobeStorage.js'
import { cutoutLightBackground } from './wardrobeCutout.js'

const priority = { outer: 0, top: 1, dress: 1, bottom: 2, shoes: 3, accessory: 4 }
// Only remove near-white background connected to the image border.
// Dark, patterned or ambiguous backgrounds are deliberately kept, and cutouts
// with holes or loose fragments are rejected (see wardrobeCutout.js).
async function isolateLightBackground(src) {
  const image = new Image()
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = src })
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const box = cutoutLightBackground(frame.data, canvas.width, canvas.height)
  if (!box) return null
  ctx.putImageData(frame, 0, 0)
  const cropped = document.createElement('canvas')
  cropped.width = box.maxX - box.minX + 1
  cropped.height = box.maxY - box.minY + 1
  cropped.getContext('2d').drawImage(canvas, box.minX, box.minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped.toDataURL('image/png')
}

function OutfitGarment({ garment, onCutout }) {
  const [cutout, setCutout] = useState(null)
  useEffect(() => {
    let active = true
    setCutout(null)
    const done = (result) => { if (active) { setCutout(result); onCutout?.(garment.id, result) } }
    if (isWardrobePhoto(garment.image)) isolateLightBackground(garment.image).then(done).catch(() => done(null))
    else onCutout?.(garment.id, null)
    return () => { active = false }
  }, [garment.id, garment.image, onCutout])
  return <li className={`wardrobe-outfit-piece wardrobe-outfit-${['shoes', 'bottom'].includes(garmentSlot(garment.type)) ? garmentSlot(garment.type) : 'top'}`}>
    {isWardrobePhoto(garment.image)
      ? <img src={cutout || garment.image} alt={`${garment.name}, ${garment.type}`} />
      : <div className="wardrobe-outfit-stack-color" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' }} aria-hidden="true" />}
    <span className="wardrobe-outfit-piece-label">{garment.name} · {garment.type}</span>
  </li>
}

export default function WardrobeMannequin({ garments }) {
  const [cutouts, setCutouts] = useState({})
  const onCutout = useCallback((id, result) => setCutouts((current) => current[id] === result ? current : { ...current, [id]: result }), [])
  const ordered = [...garments].sort((a, b) => (priority[garmentSlot(a.type)] ?? 5) - (priority[garmentSlot(b.type)] ?? 5))
  const layers = ['top', 'bottom', 'shoes'].map((slot) => {
    const garment = [...ordered].reverse().find((item) => garmentSlot(item.type) === slot && cutouts[item.id])
    return garment ? { slot, garment, image: cutouts[garment.id] } : null
  }).filter(Boolean)
  return <section className="wardrobe-mannequin" aria-label="Vald outfit">
    <h4>Din outfit</h4>
    <div className="wardrobe-doll">
      <img
        className="wardrobe-doll-photo"
        src="/wardrobe-mannequin.webp"
        width="253"
        height="566"
        decoding="async"
        alt="Skyltdocka i vit t-shirt, svarta byxor och vita sneakers"
      />
      {layers.map(({ slot, garment, image }) => <div key={slot} className={`wardrobe-doll-layer wardrobe-doll-layer-${slot}`}><img src={image} alt={`${garment.name} på dockan (ungefärlig förhandsvisning)`} /></div>)}
    </div>
    <p className="wardrobe-doll-note">Valda plagg med ljus bakgrund kan visas ungefärligt på dockan. Passformen är inte exakt. Plagg utan frilagd bild visas under Valda plagg. Dina sparade kläder ändras inte.</p>
    {!ordered.length && <p>Välj plagg i garderoben för att skapa en outfit.</p>}
    {!!ordered.length && <details><summary>Valda plagg</summary><ul className="wardrobe-outfit-stack-list">{ordered.map((garment) => <OutfitGarment key={garment.id} garment={garment} onCutout={onCutout} />)}</ul></details>}
  </section>
}

