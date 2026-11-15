import { useEffect, useState } from 'react'
import { garmentSlot, isWardrobePhoto } from '../../../services/wardrobeStorage.js'

const priority = { outer: 0, top: 1, dress: 1, bottom: 2, shoes: 3, accessory: 4 }
const isLight = (r, g, b) => Math.min(r, g, b) >= 224 && Math.max(r, g, b) - Math.min(r, g, b) <= 24

// Only remove near-white background connected to the image border.
// Dark, patterned or ambiguous backgrounds are deliberately kept.
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
  const { width: w, height: h } = canvas
  const frame = ctx.getImageData(0, 0, w, h)
  const data = frame.data
  const total = w * h
  let border = 0, light = 0
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) {
    const p = (y * w + x) * 4; border++; if (isLight(data[p], data[p + 1], data[p + 2])) light++
  }
  for (let y = 1; y < h - 1; y++) for (const x of [0, w - 1]) {
    const p = (y * w + x) * 4; border++; if (isLight(data[p], data[p + 1], data[p + 2])) light++
  }
  if (light / border < 0.85) return null
  const seen = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0, tail = 0
  const enqueue = (i) => {
    if (i < 0 || i >= total || seen[i]) return
    const p = i * 4
    if (!isLight(data[p], data[p + 1], data[p + 2])) return
    seen[i] = 1; queue[tail++] = i
  }
  for (let x = 0; x < w; x++) { enqueue(x); enqueue((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { enqueue(y * w); enqueue(y * w + w - 1) }
  while (head < tail) {
    const i = queue[head++], x = i % w
    if (x > 0) enqueue(i - 1)
    if (x + 1 < w) enqueue(i + 1)
    if (i >= w) enqueue(i - w)
    if (i + w < total) enqueue(i + w)
  }
  if (tail < total * 0.03 || tail > total * 0.92) return null
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let i = 0; i < total; i++) {
    const p = i * 4
    if (seen[i]) data[p + 3] = 0
    else if (data[p + 3] > 0) {
      const x = i % w, y = (i / w) | 0
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  ctx.putImageData(frame, 0, 0)
  const cropped = document.createElement('canvas')
  cropped.width = maxX - minX + 1
  cropped.height = maxY - minY + 1
  cropped.getContext('2d').drawImage(canvas, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped.toDataURL('image/png')
}

function OutfitGarment({ garment }) {
  const [cutout, setCutout] = useState(null)
  useEffect(() => {
    let active = true
    setCutout(null)
    if (isWardrobePhoto(garment.image)) isolateLightBackground(garment.image)
      .then((result) => { if (active) setCutout(result) })
      .catch(() => {})
    return () => { active = false }
  }, [garment.image])
  return <li className={`wardrobe-outfit-piece wardrobe-outfit-${['shoes', 'bottom'].includes(garmentSlot(garment.type)) ? garmentSlot(garment.type) : 'top'}`}>
    {isWardrobePhoto(garment.image)
      ? <img src={cutout || garment.image} alt={`${garment.name}, ${garment.type}`} />
      : <div className="wardrobe-outfit-stack-color" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' }} aria-hidden="true" />}
    <span className="wardrobe-outfit-piece-label">{garment.name} · {garment.type}</span>
  </li>
}

export default function WardrobeMannequin({ garments }) {
  const [body, setBody] = useState('woman')
  const ordered = [...garments].sort((a, b) => (priority[garmentSlot(a.type)] ?? 5) - (priority[garmentSlot(b.type)] ?? 5))
  const layers = {
    top: [...ordered].reverse().find((garment) => ['top', 'outer', 'dress'].includes(garmentSlot(garment.type))),
    bottom: [...ordered].reverse().find((garment) => garmentSlot(garment.type) === 'bottom'),
    shoes: [...ordered].reverse().find((garment) => garmentSlot(garment.type) === 'shoes'),
  }
  return <section className="wardrobe-mannequin" aria-label="Vald outfit">
    <h4>Din outfit</h4>
    <div className="wardrobe-body-choice" role="group" aria-label="Välj docka">
      <button type="button" aria-pressed={body === 'woman'} onClick={() => setBody('woman')}>Kvinna</button>
      <button type="button" aria-pressed={body === 'man'} onClick={() => setBody('man')}>Man</button>
    </div>
    <div className={`wardrobe-doll wardrobe-doll-${body}`} role="img" aria-label={ordered.length ? `Docka med ${ordered.map((g) => g.name).join(', ')}` : 'Docka utan kläder'}>
      <svg className="wardrobe-doll-body" viewBox="0 0 220 460" aria-hidden="true">
        <defs><linearGradient id="wardrobe-doll-shade" x1="0" x2="1"><stop stopColor="#8791a7"/><stop offset=".5" stopColor="#e4e7ef"/><stop offset="1" stopColor="#8994ac"/></linearGradient></defs>
        <ellipse cx="110" cy="39" rx="23" ry="32" fill="url(#wardrobe-doll-shade)"/>
        <path d="M100 66 L120 66 L124 85 L96 85 Z" fill="url(#wardrobe-doll-shade)"/>
        <path d="M95 82 Q74 83 64 94 L45 195 Q42 212 54 216 Q64 220 69 202 L85 135 L83 220 Q80 249 91 260 L129 260 Q140 249 137 220 L135 135 L151 202 Q156 220 166 216 Q178 212 175 195 L156 94 Q146 83 125 82 Z" fill="url(#wardrobe-doll-shade)"/>
        <path d={body === 'woman' ? 'M91 255 L110 255 L107 345 L101 424 Q100 441 88 441 L83 433 L83 345 Z M110 255 L129 255 L137 345 L137 433 L132 441 Q120 441 119 424 L113 345 Z' : 'M87 255 L110 255 L107 345 L101 424 Q100 441 88 441 L83 433 L83 345 Z M110 255 L133 255 L137 345 L137 433 L132 441 Q120 441 119 424 L113 345 Z'} fill="url(#wardrobe-doll-shade)"/>
      </svg>
      {Object.entries(layers).map(([slot, garment]) => garment && <DollGarment key={slot + garment.id} garment={garment} slot={slot} />)}
    </div>
    <p className="wardrobe-doll-note">Förhandsvisning framifrån. Passformen är ungefärlig och fungerar bäst med plagg fotograferade rakt framifrån mot ljus bakgrund.</p>
    {!ordered.length && <p>Välj kläder ovan för att prova dem på dockan.</p>}
    {!!ordered.length && <details><summary>Valda plagg</summary><ul className="wardrobe-outfit-stack-list">{ordered.map((garment) => <OutfitGarment key={garment.id} garment={garment} />)}</ul></details>}
  </section>
}

function DollGarment({ garment, slot }) {
  const [cutout, setCutout] = useState(null)
  useEffect(() => {
    let active = true
    setCutout(null)
    if (isWardrobePhoto(garment.image)) isolateLightBackground(garment.image)
      .then((result) => { if (active) setCutout(result) })
      .catch(() => {})
    return () => { active = false }
  }, [garment.image])
  return <div className={`wardrobe-doll-layer wardrobe-doll-layer-${slot}`}>
    {isWardrobePhoto(garment.image)
      ? <img src={cutout || garment.image} alt="" />
      : <div className="wardrobe-doll-layer-color" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' }} />}
  </div>
}
