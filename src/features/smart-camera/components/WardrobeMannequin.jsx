import { useCallback, useEffect, useState } from 'react'
import { garmentSlot, isWardrobePhoto } from '../../../services/wardrobeStorage.js'
import { cutoutLightBackground, cutoutShoePair, splitShoePair } from './wardrobeCutout.js'

const priority = { outer: 0, top: 1, dress: 1, bottom: 2, shoes: 3, accessory: 4 }
const MANNEQUINS = {
  woman: { src: '/wardrobe-mannequin-woman-v2.webp', width: 604, height: 1133, alt: 'Kvinnlig skyltdocka utan kläder och skor' },
  man: { src: '/wardrobe-mannequin-man-v2.webp', width: 604, height: 1133, alt: 'Manlig skyltdocka utan kläder och skor' },
}
// Only remove near-white background connected to the image border.
// Dark, patterned or ambiguous backgrounds are deliberately kept, and cutouts
// with holes or loose fragments are rejected (see wardrobeCutout.js).
function cropToDataUrl(canvas, box) {
  const cropped = document.createElement('canvas')
  cropped.width = box.maxX - box.minX + 1
  cropped.height = box.maxY - box.minY + 1
  cropped.getContext('2d').drawImage(canvas, box.minX, box.minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped.toDataURL('image/png')
}

// Returns { image, shoes } where image is the whole cut-out garment and, for a
// pair of shoes, shoes is [left, right] when the pair splits reliably (else null).
async function isolateLightBackground(src, { splitShoes = false } = {}) {
  const image = new Image()
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = src })
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const box = cutoutLightBackground(frame.data, canvas.width, canvas.height)
  let wholeImage = null
  if (box) {
    ctx.putImageData(frame, 0, 0)
    wholeImage = cropToDataUrl(canvas, box)
    const pair = splitShoes ? splitShoePair(box.parts) : null
    if (pair) return { image: wholeImage, shoes: pair.map((part) => cropToDataUrl(canvas, part)) }
  }
  if (splitShoes) {
    // White or light shoes are removed together with a light background by the
    // general cutout. Try the shoe cutout, which keeps what differs from the
    // background and fills each shoe's inside.
    const shoeCanvas = document.createElement('canvas')
    shoeCanvas.width = canvas.width
    shoeCanvas.height = canvas.height
    const shoeCtx = shoeCanvas.getContext('2d')
    const shoes = shoeCtx ? cutoutShoePair(original.data, canvas.width, canvas.height) : null
    if (shoes) {
      shoeCtx.putImageData(original, 0, 0)
      return { image: wholeImage, shoes: shoes.parts.map((part) => cropToDataUrl(shoeCanvas, part)) }
    }
  }
  return wholeImage ? { image: wholeImage, shoes: null } : null
}

function OutfitGarment({ garment, onCutout }) {
  const [cutout, setCutout] = useState(null)
  useEffect(() => {
    let active = true
    setCutout(null)
    const done = (result) => { if (active) { setCutout(result?.image || null); onCutout?.(garment.id, result) } }
    const splitShoes = garmentSlot(garment.type) === 'shoes'
    if (isWardrobePhoto(garment.image)) isolateLightBackground(garment.image, { splitShoes }).then(done).catch(() => done(null))
    else onCutout?.(garment.id, null)
    return () => { active = false }
  }, [garment.id, garment.image, garment.type, onCutout])
  return <li className={`wardrobe-outfit-piece wardrobe-outfit-${['shoes', 'bottom'].includes(garmentSlot(garment.type)) ? garmentSlot(garment.type) : 'top'}`}>
    {isWardrobePhoto(garment.image)
      ? <img src={cutout || garment.image} alt={`${garment.name}, ${garment.type}`} />
      : <div className="wardrobe-outfit-stack-color" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' }} aria-hidden="true" />}
    <span className="wardrobe-outfit-piece-label">{garment.name} · {garment.type}</span>
  </li>
}

export default function WardrobeMannequin({ garments }) {
  const [body, setBody] = useState('woman')
  const mannequin = MANNEQUINS[body]
  const [cutouts, setCutouts] = useState({})
  const onCutout = useCallback((id, result) => setCutouts((current) => current[id] === result ? current : { ...current, [id]: result }), [])
  const ordered = [...garments].sort((a, b) => (priority[garmentSlot(a.type)] ?? 5) - (priority[garmentSlot(b.type)] ?? 5))
  // Dress comes before top in the DOM so a top chosen together with it is drawn over it.
  const layers = ['dress', 'top', 'bottom'].map((slot) => {
    const garment = [...ordered].reverse().find((item) => garmentSlot(item.type) === slot && cutouts[item.id]?.image)
    return garment ? { slot, garment, image: cutouts[garment.id].image } : null
  }).filter(Boolean)
  // Shoes are drawn only when the pair split into a left and a right shoe;
  // otherwise they stay in the Valda plagg list instead of sitting between the feet.
  const shoes = [...ordered].reverse().find((item) => garmentSlot(item.type) === 'shoes' && cutouts[item.id]?.shoes)
  if (shoes) {
    const [left, right] = cutouts[shoes.id].shoes
    layers.push({ slot: 'shoe-left', garment: shoes, image: left }, { slot: 'shoe-right', garment: shoes, image: right })
  }
  return <section className="wardrobe-mannequin" aria-label="Vald outfit">
    <h4>Din outfit</h4>
    <div className="wardrobe-body-choice" role="group" aria-label="Välj docka">
      <button type="button" aria-pressed={body === 'woman'} onClick={() => setBody('woman')}>Kvinna</button>
      <button type="button" aria-pressed={body === 'man'} onClick={() => setBody('man')}>Man</button>
    </div>
    <div className={`wardrobe-doll wardrobe-doll-${body}`}>
      <img
        className="wardrobe-doll-photo"
        src={mannequin.src}
        width={mannequin.width}
        height={mannequin.height}
        decoding="async"
        alt={mannequin.alt}
      />
      {layers.map(({ slot, garment, image }) => <div key={slot} className={`wardrobe-doll-layer wardrobe-doll-layer-${slot}`}><img src={image} alt={`${garment.name} på dockan (ungefärlig förhandsvisning)`} /></div>)}
    </div>
    <p className="wardrobe-doll-note">Valda plagg med ljus bakgrund kan visas ungefärligt på dockan. Passformen är inte exakt. Plagg utan frilagd bild visas under Valda plagg. Dina sparade kläder ändras inte.</p>
    {!ordered.length && <p>Välj plagg i garderoben för att skapa en outfit.</p>}
    {!!ordered.length && <details><summary>Valda plagg</summary><ul className="wardrobe-outfit-stack-list">{ordered.map((garment) => <OutfitGarment key={garment.id} garment={garment} onCutout={onCutout} />)}</ul></details>}
  </section>
}

