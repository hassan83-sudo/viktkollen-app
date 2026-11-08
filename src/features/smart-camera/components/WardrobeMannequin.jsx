import { useId } from 'react'
import { garmentSlot, isWardrobePhoto } from '../../../services/wardrobeStorage.js'

// Silhouette-based illustration: the photo is clipped to a clothing shape.
// This does not remove the background from the original photograph or predict fit.
const shapes = {
  top: { box: [57, 67, 106, 105], path: 'M86 69 L96 78 Q110 86 124 78 L134 69 L153 83 L165 125 L145 133 L134 108 L136 166 L84 166 L86 108 L75 133 L55 125 L67 83 Z' },
  bottom: { box: [79, 161, 62, 147], path: 'M82 161 L138 161 L142 212 L134 307 L112 307 L110 221 L108 221 L106 307 L84 307 L78 212 Z' },
  dress: { box: [54, 69, 112, 209], path: 'M86 69 L96 78 Q110 86 124 78 L134 69 L153 83 L165 125 L145 133 L134 109 L146 205 L165 278 L55 278 L74 205 L86 109 L75 133 L55 125 L67 83 Z' },
  outer: { box: [50, 67, 120, 117], path: 'M84 69 L97 77 L110 91 L123 77 L136 69 L156 84 L171 151 L149 158 L136 111 L141 181 L112 181 L110 95 L108 181 L79 181 L84 111 L71 158 L49 151 L64 84 Z' },
  shoes: { box: [72, 290, 86, 27], path: 'M83 290 L106 290 L107 311 L70 315 Q66 309 75 302 Z M114 290 L137 290 L145 302 Q154 309 150 315 L113 311 Z' },
  accessory: { box: [151, 117, 48, 53], path: 'M162 118 Q176 109 188 122 L199 158 Q198 168 187 170 L158 170 Q148 168 150 158 Z' },
}
const order = ['bottom', 'shoes', 'dress', 'top', 'outer', 'accessory']

export default function WardrobeMannequin({ garments }) {
  const prefix = useId().replace(/:/g, '')
  const layers = new Map(garments.map((garment) => [garmentSlot(garment.type), garment]))
  return <figure className="wardrobe-mannequin">
    <svg viewBox="0 0 220 325" role="img" aria-label="Schematisk 2D-docka med dina valda plagg i kroppsformade områden">
      <circle cx="110" cy="37" r="27" fill="#c3cbd4" />
      <path d="M85 72 L135 72 L165 165 L147 172 L135 130 L140 205 L135 310 L114 310 L110 220 L106 310 L85 310 L80 205 L85 130 L73 172 L55 165 Z" fill="#d9dfe5" />
      <defs>{order.map((slot) => <clipPath id={prefix + '-' + slot} key={slot}><path d={shapes[slot].path} /></clipPath>)}</defs>
      {order.map((slot) => {
        const garment = layers.get(slot)
        if (!garment) return null
        const shape = shapes[slot]
        const [x, y, width, height] = shape.box
        const fill = /^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4'
        return <g key={slot}>
          <title>{garment.name}</title>
          <path d={shape.path} fill={fill} stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round" />
          {isWardrobePhoto(garment.image) && <image href={garment.image} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${prefix}-${slot})`} />}
        </g>
      })}
    </svg>
    <figcaption>Illustrerad 2D-docka: bilder beskärs efter plaggets form. Fotobakgrunden kan fortfarande synas i formen. Ingen AI, storleksbedömning eller verklig provning används.</figcaption>
  </figure>
}
