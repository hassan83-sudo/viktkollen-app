import { useCallback, useEffect, useRef, useState } from 'react'
import { garmentSlot, isWardrobePhoto } from '../../../services/wardrobeStorage.js'
import { cutoutLightBackground, cutoutShoePair, splitShoePair } from './wardrobeCutout.js'
import { dominantOpaqueColor, mountWardrobe3D, opaqueUvRect, wrapDegrees } from './wardrobe3dFit.js'

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
  const identity = `${garment.id}:${garment.image}`
  const [source, setSource] = useState(identity)
  if (source !== identity) {
    setSource(identity)
    setCutout(null)
  }
  useEffect(() => {
    let active = true
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


function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image'))
    image.src = src
  })
}

function imageToCanvas(image) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

let textureSerial = 0

async function textureFromSrc(src, splitShoes) {
  let isolated
  try { isolated = await isolateLightBackground(src, { splitShoes }) } catch { isolated = null }
  const main = imageToCanvas(await loadImage(isolated?.image || src))
  const texture = { source: main, bounds: opaqueUvRect(main), fill: dominantOpaqueColor(main), token: ++textureSerial }
  if (!splitShoes) return texture
  if (isolated?.shoes?.length === 2) {
    const pair = []
    for (const url of isolated.shoes) {
      const canvas = imageToCanvas(await loadImage(url))
      pair.push({ source: canvas, bounds: opaqueUvRect(canvas), fill: dominantOpaqueColor(canvas), token: ++textureSerial })
    }
    return { ...texture, left: pair[0], right: pair[1] }
  }
  return { ...texture, left: texture, right: texture }
}

function fittedGarments(garments) {
  const slots = {}
  for (const garment of garments) {
    const slot = garmentSlot(garment.type)
    if (!slot || slot === 'accessory') continue
    slots[slot] = {
      slot,
      type: garment.type,
      color: garment.color,
      image: isWardrobePhoto(garment.image) ? garment.image : '',
    }
  }
  return slots
}

function slotKey(slots) {
  return ['outer', 'top', 'dress', 'bottom', 'shoes'].map((slot) => {
    const item = slots[slot]
    const image = item?.image || ''
    let hash = 0
    for (let i = 0; i < image.length; i += 64) hash = (Math.imul(hash, 33) + image.charCodeAt(i)) >>> 0
    return `${slot}:${item?.type || ''}:${item?.color || ''}:${image.length}:${hash}`
  }).join('|')
}

function Wardrobe3DPreview({ body, garments }) {
  const [angle, setAngle] = useState(0)
  const [photos, setPhotos] = useState({})
  const [failed, setFailed] = useState(false)
  const nextSlots = fittedGarments(garments)
  const nextKey = slotKey(nextSlots)
  const [slots, setSlots] = useState(nextSlots)
  const [photoKey, setPhotoKey] = useState(nextKey)
  if (nextKey !== photoKey) {
    setPhotoKey(nextKey)
    setSlots(nextSlots)
  }
  const canvasRef = useRef(null)
  const viewRef = useRef(null)
  const drag = useRef(null)
  const turn = (delta) => setAngle((current) => wrapDegrees(current + delta))

  useEffect(() => {
    const renderer = mountWardrobe3D(canvasRef.current)
    if (!renderer) {
      setFailed(true)
      return undefined
    }
    viewRef.current = renderer
    return () => {
      renderer.dispose()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true
    const selected = Object.entries(slots).filter(([, item]) => isWardrobePhoto(item.image))
    Promise.all(selected.map(async ([slot, item]) => {
      try { return [slot, await textureFromSrc(item.image, slot === 'shoes')] } catch { return null }
    })).then((results) => {
      if (active) setPhotos(Object.fromEntries(results.filter(Boolean)))
    })
    return () => { active = false }
  }, [photoKey, slots])

  useEffect(() => {
    const gpuPhotos = {
      top: photos.top || null,
      bottom: photos.bottom || null,
      dress: photos.dress || null,
      outer: photos.outer || null,
      'shoes-left': photos.shoes?.left || null,
      'shoes-right': photos.shoes?.right || null,
    }
    const fitted = Object.values(slots)
    viewRef.current?.render({
      sex: body,
      garments: fitted,
      photos: gpuPhotos,
      yaw: angle * Math.PI / 180,
      key: `${body}|${photoKey}|${Object.entries(gpuPhotos).map(([, photo]) => photo?.token || 0).join(',')}`,
    })
  }, [angle, body, photos, photoKey, slots])

  const label = `Tredimensionell provdocka, ${body === 'woman' ? 'kvinna' : 'man'}, vridning ${Math.round(angle)} grader`
  return <div className="wardrobe-3d-preview">
    <div className="wardrobe-3d-stage">
      <canvas
        ref={canvasRef}
        width="520"
        height="880"
        role="img"
        tabIndex={0}
        aria-label={label}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, angle }
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          setAngle(wrapDegrees(drag.current.angle + (event.clientX - drag.current.x) * 0.7))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); turn(event.shiftKey ? -45 : -15) }
          if (event.key === 'ArrowRight') { event.preventDefault(); turn(event.shiftKey ? 45 : 15) }
        }}
      />
    </div>
    <div className="wardrobe-body-choice">
      <button type="button" onClick={() => turn(-45)} aria-label="Rotera dockan åt vänster">Vänster</button>
      <button type="button" onClick={() => turn(45)} aria-label="Rotera dockan åt höger">Höger</button>
    </div>
    <p className="wardrobe-doll-note">Vridning {Math.round(angle)}°. Dra på dockan, använd pilarna eller knapparna för ett helt varv. Tröja, jacka, byxor, klänning och skor följer kroppen. Den sparade bilden sitter på plagget, även från sidan. Baksidan använder samma bild.</p>
    {failed && <p className="wardrobe-doll-note">3D-vyn kunde inte startas i den här webbläsaren.</p>}
  </div>
}

export default function WardrobeMannequin({ garments }) {
  const [body, setBody] = useState('woman')
  const [preview3D, setPreview3D] = useState(true)
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
    <button type="button" className="wardrobe-3d-toggle" onClick={() => setPreview3D((value) => !value)} aria-pressed={preview3D}>{preview3D ? 'Visa originaldocka' : 'Visa 3D-docka'}</button>
    {preview3D ? <Wardrobe3DPreview body={body} garments={garments} /> : <div className={`wardrobe-doll wardrobe-doll-${body}`}>
      <img
        className="wardrobe-doll-photo"
        src={mannequin.src}
        width={mannequin.width}
        height={mannequin.height}
        decoding="async"
        alt={mannequin.alt}
      />
      {layers.map(({ slot, garment, image }) => <div key={slot} className={`wardrobe-doll-layer wardrobe-doll-layer-${slot}`}><img src={image} alt={`${garment.name} på dockan (ungefärlig förhandsvisning)`} /></div>)}
    </div>}
    {!preview3D && <p className="wardrobe-doll-note">Valda plagg med ljus bakgrund kan visas ungefärligt på originaldockan. Plagg utan frilagd bild visas under Valda plagg.</p>}
    <p className="wardrobe-doll-note">Dina sparade kläder ändras inte.</p>
    {!ordered.length && <p>Välj plagg i garderoben för att skapa en outfit.</p>}
    {!!ordered.length && <details><summary>Valda plagg</summary><ul className="wardrobe-outfit-stack-list">{ordered.map((garment) => <OutfitGarment key={garment.id} garment={garment} onCutout={onCutout} />)}</ul></details>}
  </section>
}

