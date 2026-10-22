import { garmentSlot, isWardrobePhoto } from '../../../services/wardrobeStorage.js'

const regions = { top: [65, 76, 90, 90], bottom: [70, 165, 80, 120], dress: [54, 78, 112, 180], outer: [50, 80, 120, 100], shoes: [67, 286, 86, 25], accessory: [165, 120, 40, 48] }

export default function WardrobeMannequin({ garments }) {
  const layers = new Map(garments.map((garment) => [garmentSlot(garment.type), garment]))
  return <figure className="wardrobe-mannequin">
    <svg viewBox="0 0 220 325" role="img" aria-label="Schematisk 2D-docka med dina valda plagg">
      <circle cx="110" cy="37" r="27" fill="#c3cbd4" />
      <path d="M85 72 L135 72 L165 165 L147 172 L135 130 L140 205 L135 310 L114 310 L110 220 L106 310 L85 310 L80 205 L85 130 L73 172 L55 165 Z" fill="#d9dfe5" />
      {Object.entries(regions).map(([slot, [x, y, width, height]]) => {
        const garment = layers.get(slot)
        if (!garment) return null
        return <g key={slot}><title>{garment.name}</title>
          <rect x={x} y={y} width={width} height={height} rx="8" fill={/^#[0-9a-f]{6}$/i.test(garment.color || '') ? garment.color : '#446fa4'} />
          {isWardrobePhoto(garment.image) && <image href={garment.image} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid meet" />}
        </g>
      })}
    </svg>
    <figcaption>Schematisk 2D-vy, inte en provning. Bildernas bakgrund finns kvar. Passform, storlek och kroppsmått bedöms inte. Senast valda plagget visas överst inom varje plaggtyp.</figcaption>
  </figure>
}
