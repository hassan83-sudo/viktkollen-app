import { useCallback, useEffect, useRef, useState } from 'react'
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


/* Experimental 3D body preview. Garments are geometric placeholders, not photo-fitted meshes. */
function Wardrobe3DPreview({ body, garments }) {
  const [angle, setAngle] = useState(0)
  const canvasRef = useRef(null)
  const slots = Object.fromEntries(garments.map(g => [garmentSlot(g.type), g]))
  const [photos, setPhotos] = useState({})
  const photoSources = ['outer', 'top', 'dress', 'bottom'].map(slot => slots[slot]?.image || '').join('\u0001')
  useEffect(() => {
    let active = true
    const sources = photoSources.split('\u0001')
    const selected = ['outer', 'top', 'dress', 'bottom'].map((slot, index) => [slot, sources[index]])
      .filter(([, src]) => isWardrobePhoto(src))
    Promise.all(selected.map(async ([slot, src]) => {
      try {
        const image = new Image()
        image.src = src
        await image.decode()
        return [slot, image]
      } catch { return null }
    })).then(results => { if (active) setPhotos(Object.fromEntries(results.filter(Boolean))) })
    return () => { active = false }
  }, [photoSources])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    const theta = angle * Math.PI / 180
    const project = (x, y, z) => {
      const rx = x * Math.cos(theta) + z * Math.sin(theta)
      const rz = z * Math.cos(theta) - x * Math.sin(theta)
      const scale = 390 / (390 + rz)
      return [130 + rx * scale, 420 - y * scale]
    }
    const shapes = []
    const cylinder = (x, y0, y1, r0, r1, depth, color) => {
      const sides = 18
      for (let i = 0; i < sides; i++) {
        const a = i * Math.PI * 2 / sides, b = (i + 1) * Math.PI * 2 / sides
        const verts = [[x + Math.cos(a)*r0,y0,Math.sin(a)*depth],[x + Math.cos(b)*r0,y0,Math.sin(b)*depth],[x + Math.cos(b)*r1,y1,Math.sin(b)*depth],[x + Math.cos(a)*r1,y1,Math.sin(a)*depth]]
        const z = verts.reduce((s,v)=>s+v[2]*Math.cos(theta)-v[0]*Math.sin(theta),0)/4
        const shade = 0.65 + 0.35 * Math.max(0, Math.cos((a+b)/2-theta))
        shapes.push({z, verts, color, shade})
      }
    }
    const skin = '#c9a48c'
    const chosenColor = (slot, fallback) => /^#[0-9a-f]{6}$/i.test(slots[slot]?.color || '') ? slots[slot].color : fallback
    const pants = chosenColor('bottom','#344765')
    const top = chosenColor('top','#617fa2')
    const dress = slots.dress ? chosenColor('dress','#8865a3') : null
    const outer = slots.outer ? chosenColor('outer','#455769') : null
    const female = body === 'woman'
    const shoulders = female ? 43 : 51
    const waist = female ? 31 : 36
    const hips = female ? 43 : 39
    // Body segments taper between joints so clothes follow the torso and limbs.
    cylinder(0, 343, 374, 17, 17, 16, skin)
    cylinder(0, 375, 406, 18, 13, 17, skin)
    cylinder(0, 406, 418, 12, 10, 11, skin)
    cylinder(0, 303, 343, waist, shoulders, 24, outer || dress || (slots.top ? top : skin))
    cylinder(0, 261, 303, hips, waist, 25, outer || dress || (slots.top ? top : skin))
    cylinder(0, 228, 261, hips, hips, 25, dress || (slots.bottom ? pants : skin))
    if (dress) {
      // A skirt hangs from the hips rather than following separate trouser legs.
      cylinder(0, 143, 228, hips + 17, hips, 25, dress)
    }
    for (const side of [-1,1]) {
      const armX = side * (shoulders + 5)
      const sleeve = outer || (slots.top ? top : dress)
      cylinder(armX, 285, 335, 12, 15, 13, sleeve || skin)
      cylinder(armX + side*3, 228, 285, 9, 12, 11, outer || skin)
      cylinder(armX + side*3, 211, 228, 9, 9, 9, skin)
      if (!dress) {
        cylinder(side*20, 121, 228, 16, 21, 18, slots.bottom ? pants : skin)
        cylinder(side*20, 43, 121, 11, 16, 13, slots.bottom ? pants : skin)
      } else {
        cylinder(side*20, 43, 143, 11, 16, 13, skin)
      }
      cylinder(side*20, 21, 44, 15, 12, 23, slots.shoes ? chosenColor('shoes','#333842') : skin)
    }
    // Project the front of each selected garment onto the visible body silhouette.
    // This is a 2.5D photo preview; side and back views retain geometric materials.
    const patches = []
    const patch = (slot, y0, y1, halfWidth0, halfWidth1, centerX = 0) => {
      if (!photos[slot]) return
      const depth = slot === 'bottom' ? 19 : 28
      patches.push({ slot, corners: [
        [centerX-halfWidth0,y0,depth],[centerX+halfWidth0,y0,depth],
        [centerX+halfWidth1,y1,depth],[centerX-halfWidth1,y1,depth]
      ] })
    }
    if (slots.dress) patch('dress', 145, 341, hips+14, shoulders)
    else {
      if (slots.top) patch('top', 261, 341, hips, shoulders)
      if (slots.bottom) {
        patch('bottom', 43, 226, 17, 21, -20)
        patch('bottom', 43, 226, 17, 21, 20)
      }
    }
    if (slots.outer) patch('outer', 261, 341, hips+3, shoulders+3)
    shapes.sort((a,b)=>b.z-a.z)
    for (const face of shapes) {
      const points = face.verts.map(v=>project(...v))
      ctx.beginPath()
      ctx.moveTo(...points[0])
      for (const p of points.slice(1)) ctx.lineTo(...p)
      ctx.closePath()
      ctx.fillStyle = face.color
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,'+(1-face.shade)*0.48+')'
      ctx.fill()
    }
    if (Math.cos(theta) > 0.2) {
      for (const item of patches) {
        const img = photos[item.slot]
        if (!img) continue
        const points = item.corners.map(v => project(...v))
        const xs = points.map(p => p[0]), ys = points.map(p => p[1])
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        const minY = Math.min(...ys), maxY = Math.max(...ys)
        if (maxX-minX < 1 || maxY-minY < 1) continue
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(...points[0])
        for (const p of points.slice(1)) ctx.lineTo(...p)
        ctx.closePath()
        ctx.clip()
        ctx.globalAlpha = Math.min(1, Math.cos(theta) * 1.3)
        ctx.drawImage(img, minX, minY, maxX-minX, maxY-minY)
        ctx.restore()
      }
    }
  }, [angle, body, garments, photos])
  return <div className="wardrobe-3d-preview">
    <canvas ref={canvasRef} width="260" height="440" role="img" aria-label="Roterbar tredimensionell provdocka med förenklade klädformer" style={{width:'100%',maxWidth:260,height:'auto',background:'#182034',borderRadius:12}} />
    <div style={{display:'flex',gap:6,justifyContent:'center'}}>
      <button type="button" onClick={()=>setAngle(a=>a-30)} aria-label="Rotera dockan åt vänster">Vänster</button>
      <button type="button" onClick={()=>setAngle(a=>a+30)} aria-label="Rotera dockan åt höger">Höger</button>
    </div>
    <p className="wardrobe-doll-note">3D-prototyp: tröjor, ytterplagg, byxor och klänningar följer förenklade kroppsformer. Klädfoton visas på dockans framsida när de finns. Sid- och baksida är fortfarande förenklade, inte exakt 3D-passform.</p>
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
    <button type="button" onClick={() => setPreview3D(value => !value)} aria-pressed={preview3D}>{preview3D ? "Visa originaldocka" : "Visa 3D-prototyp"}</button>
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
    <p className="wardrobe-doll-note">Valda plagg med ljus bakgrund kan visas ungefärligt på dockan. Passformen är inte exakt. Plagg utan frilagd bild visas under Valda plagg. Dina sparade kläder ändras inte.</p>
    {!ordered.length && <p>Välj plagg i garderoben för att skapa en outfit.</p>}
    {!!ordered.length && <details><summary>Valda plagg</summary><ul className="wardrobe-outfit-stack-list">{ordered.map((garment) => <OutfitGarment key={garment.id} garment={garment} onCutout={onCutout} />)}</ul></details>}
  </section>
}

