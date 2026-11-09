import { useEffect, useState } from 'react'
import { isWardrobePhoto } from '../../../services/wardrobeStorage.js'

const priority = { 'Jacka': 0, 'Tröja': 1, 'Skjorta': 1, 'Klänning': 1, 'Byxor': 2, 'Jeans': 2, 'Skor': 3, 'Accessoar': 4, 'Annat': 5 }
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
  return <li className={`wardrobe-outfit-piece wardrobe-outfit-${garment.type === 'Skor' ? 'shoes' : ['Byxor', 'Jeans'].includes(garment.type) ? 'bottom' : 'top'}`}>
    {isWardrobePhoto(garment.image)
      ? <img src={cutout || garment.image} alt={`${garment.name}, ${garment.type}`} />
      : <div className="wardrobe-outfit-stack-color" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4' }} aria-hidden="true" />}
    <span className="wardrobe-outfit-piece-label">{garment.name} · {garment.type}</span>
  </li>
}

export default function WardrobeMannequin({ garments }) {
  const ordered = [...garments].sort((a, b) => (priority[a.type] ?? 5) - (priority[b.type] ?? 5))
  return <section className="wardrobe-mannequin wardrobe-outfit-stack" aria-label="Vald outfit">
    <h4>Din outfit</h4>
    {!ordered.length ? <p>Välj kläder ovan för att se dem här.</p> : (
      <ul className="wardrobe-outfit-stack-list">{ordered.map((garment) => <OutfitGarment key={garment.id} garment={garment} />)}</ul>
    )}
  </section>
}
