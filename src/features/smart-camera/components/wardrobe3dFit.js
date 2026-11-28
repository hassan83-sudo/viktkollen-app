// Lofted body and garment shells for the wardrobe preview.
// A garment is the same cross-section as the body, eased outward, with the
// saved photo wrapped on that surface. Rotating the body rotates the cloth.

export const VIEW = { camZ: 520, focal: 700, centerY: 90, halfH: 124, near: 160, far: 980 }

export function wrapDegrees(angle) {
  const wrapped = angle % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

export function parseGarmentColor(hex, fallback) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return fallback
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function projectPoint(x, y, z, yaw, aspect = 520 / 880) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const xr = x * c + z * s
  const zr = -x * s + z * c
  const dist = VIEW.camZ - zr
  const scale = VIEW.focal / dist
  const halfW = VIEW.halfH * aspect
  return {
    ndcX: (xr * scale) / halfW,
    ndcY: ((y - VIEW.centerY) * scale) / VIEW.halfH,
    depth: dist,
  }
}

const MANNEQUIN = [0.86, 0.88, 0.93]
const COLORS = {
  top: [0.38, 0.5, 0.64],
  bottom: [0.2, 0.28, 0.4],
  dress: [0.53, 0.4, 0.64],
  outer: [0.27, 0.34, 0.41],
  shoes: [0.2, 0.22, 0.26],
}

export function bodySpec(sex) {
  const woman = sex !== 'man'
  if (woman) {
    return {
      sex: 'woman',
      hipY: 100,
      waistY: 120,
      shoulderY: 145,
      kneeY: 52,
      torso: [
        { y: 92, rx: 15.0, rz: 10.4 },
        { y: 100, rx: 16.2, rz: 11.0 },
        { y: 112, rx: 12.4, rz: 8.4 },
        { y: 120, rx: 10.5, rz: 7.3 },
        { y: 130, rx: 13.4, rz: 9.6 },
        { y: 138, rx: 14.8, rz: 10.6 },
        { y: 145, rx: 17.4, rz: 9.2 },
        { y: 148, rx: 11.2, rz: 7.0 },
        { y: 151, rx: 5.8, rz: 5.2 },
      ],
      neck: [
        { y: 151, rx: 4.3, rz: 4.5 },
        { y: 158, rx: 4.2, rz: 4.4 },
      ],
      head: [
        { y: 158, rx: 6.6, rz: 7.6 },
        { y: 165, rx: 8.6, rz: 9.5 },
        { y: 172, rx: 8.3, rz: 9.2 },
        { y: 177, rx: 4.8, rz: 5.6 },
      ],
      arm: [
        { y: 143, x: 16.6, rx: 4.7, rz: 4.5 },
        { y: 128, x: 19.4, rx: 4.0, rz: 3.9 },
        { y: 112, x: 21.6, rx: 3.5, rz: 3.4 },
        { y: 96, x: 23.0, rx: 3.0, rz: 2.9 },
        { y: 84, x: 23.6, rx: 2.6, rz: 2.5 },
      ],
      hand: [
        { y: 82, x: 23.8, rx: 2.8, rz: 1.6 },
        { y: 74, x: 24.0, rx: 2.2, rz: 1.2 },
      ],
      leg: [
        { y: 100, x: 7.5, rx: 8.5, rz: 8.8 },
        { y: 84, x: 8.1, rx: 7.3, rz: 7.6 },
        { y: 68, x: 8.5, rx: 6.0, rz: 6.3 },
        { y: 52, x: 8.7, rx: 4.9, rz: 5.3 },
        { y: 34, x: 8.7, rx: 4.5, rz: 4.8 },
        { y: 16, x: 8.5, rx: 3.3, rz: 3.5 },
        { y: 7, x: 8.5, rx: 2.9, rz: 3.1 },
      ],
    }
  }
  return {
    sex: 'man',
    hipY: 98,
    waistY: 122,
    shoulderY: 146,
    kneeY: 52,
    torso: [
      { y: 90, rx: 15.2, rz: 10.8 },
      { y: 98, rx: 15.8, rz: 11.2 },
      { y: 112, rx: 14.6, rz: 10.0 },
      { y: 122, rx: 14.0, rz: 9.6 },
      { y: 132, rx: 16.8, rz: 11.4 },
      { y: 140, rx: 19.2, rz: 11.6 },
      { y: 146, rx: 21.2, rz: 11.4 },
      { y: 149, rx: 13.4, rz: 8.2 },
      { y: 152, rx: 6.6, rz: 6.2 },
    ],
    neck: [
      { y: 152, rx: 5.6, rz: 5.8 },
      { y: 159, rx: 5.4, rz: 5.6 },
    ],
    head: [
      { y: 159, rx: 7.2, rz: 8.2 },
      { y: 166, rx: 9.2, rz: 10.0 },
      { y: 173, rx: 8.8, rz: 9.6 },
      { y: 178, rx: 5.0, rz: 5.8 },
    ],
    arm: [
      { y: 144, x: 20.4, rx: 6.0, rz: 5.6 },
      { y: 128, x: 23.2, rx: 5.1, rz: 4.8 },
      { y: 112, x: 25.0, rx: 4.3, rz: 4.1 },
      { y: 96, x: 26.0, rx: 3.7, rz: 3.5 },
      { y: 82, x: 26.4, rx: 3.3, rz: 3.1 },
    ],
    hand: [
      { y: 80, x: 26.6, rx: 3.4, rz: 1.8 },
      { y: 71, x: 26.8, rx: 2.6, rz: 1.3 },
    ],
    leg: [
      { y: 98, x: 8.2, rx: 8.8, rz: 9.2 },
      { y: 82, x: 8.8, rx: 7.6, rz: 8.0 },
      { y: 66, x: 9.2, rx: 6.4, rz: 6.8 },
      { y: 52, x: 9.4, rx: 5.4, rz: 5.8 },
      { y: 34, x: 9.5, rx: 5.0, rz: 5.3 },
      { y: 16, x: 9.4, rx: 3.8, rz: 4.0 },
      { y: 7, x: 9.4, rx: 3.3, rz: 3.5 },
    ],
  }
}

function sleeveCut(type) {
  if (['Linne', 'BH', 'Sport-BH', 'Bikini'].includes(type)) return 'none'
  if (['T-shirt', 'Pikétröja', 'Blus'].includes(type)) return 'short'
  return 'long'
}

function outerCut(type) {
  return type === 'Väst' ? 'vest' : 'jacket'
}

function bottomCut(type) {
  if (type === 'Kjol') return 'skirt'
  if (['Shorts', 'Badbyxor', 'Kalsonger', 'Boxershorts', 'Trosor'].includes(type)) return 'shorts'
  if (['Leggings', 'Strumpbyxor'].includes(type)) return 'leggings'
  return 'pants'
}

function dressCut(type) {
  if (['Jumpsuit', 'Overall'].includes(type)) return 'jumpsuit'
  if (type === 'Baddräkt') return 'swimsuit'
  return 'dress'
}

function makeRingXZ(cx, y, cz, rx, rz, segments) {
  const ring = []
  for (let j = 0; j <= segments; j += 1) {
    const phi = Math.PI + (j / segments) * Math.PI * 2
    ring.push({
      x: cx + Math.sin(phi) * rx,
      y,
      z: cz + Math.cos(phi) * rz,
      angle: phi,
    })
  }
  ring.center = { x: cx, y, z: cz }
  return ring
}

function loftY(stations, segments, ease = 1, pad = 0, side = 1) {
  return stations.map((station) => makeRingXZ(
    (station.x || 0) * side,
    station.y,
    station.z || 0,
    Math.max(0.8, station.rx * ease + pad),
    Math.max(0.8, station.rz * ease + pad),
    segments,
  ))
}

function group(id, slot, rings, extra) {
  return { id, slot, rings, texture: extra.texture ?? null, color: extra.color, uvKind: extra.uvKind || 'none', side: extra.side || 0 }
}

function bodyGroups(spec) {
  const skin = { color: MANNEQUIN, uvKind: 'none', texture: null }
  return [
    group('body-head', null, loftY(spec.head, 24), skin),
    group('body-neck', null, loftY(spec.neck, 16), skin),
    group('body-torso', null, loftY(spec.torso, 32), skin),
    group('body-arm-l', null, loftY(spec.arm, 16, 1, 0, -1), skin),
    group('body-arm-r', null, loftY(spec.arm, 16, 1, 0, 1), skin),
    group('body-hand-l', null, loftY(spec.hand, 12, 1, 0, -1), skin),
    group('body-hand-r', null, loftY(spec.hand, 12, 1, 0, 1), skin),
    group('body-leg-l', null, loftY(spec.leg, 18, 1, 0, -1), skin),
    group('body-leg-r', null, loftY(spec.leg, 18, 1, 0, 1), skin),
  ]
}

function torsoSlice(spec, y0, y1) {
  return spec.torso.filter((station) => station.y >= y0 && station.y <= y1)
}

function neckline(spec, flare = 2.05) {
  const neck = spec.neck[0]
  const shoulder = spec.torso.find((station) => station.y === spec.shoulderY) || spec.torso[spec.torso.length - 3]
  return {
    y: shoulder.y + 1.6,
    rx: neck.rx * flare,
    rz: neck.rz * (flare - 0.25),
  }
}

function sleeveStations(spec, cut) {
  if (cut === 'none') return []
  const top = spec.arm[0]
  const widen = (station, extra) => ({ ...station, rx: station.rx + extra, rz: station.rz + extra })
  if (cut === 'cap') {
    return [
      widen(top, 1.1),
      widen({ y: top.y - 7, x: top.x + 1.4, rx: top.rx * 0.9, rz: top.rz * 0.9 }, 0),
    ]
  }
  const minY = cut === 'short' ? top.y - 18 : spec.arm[spec.arm.length - 1].y - 0.1
  const stations = spec.arm.filter((station) => station.y >= minY).map((station, index) => widen(station, index === 0 ? 1.1 : 0))
  const ready = stations.length >= 2 ? stations : spec.arm.slice(0, 2).map((station, index) => widen(station, index === 0 ? 1.1 : 0))
  ready[0] = { ...ready[0], x: ready[0].x * 0.72, rx: ready[0].rx + 2.8, rz: ready[0].rz + 1.4 }
  return ready
}

function pushSleeves(groups, spec, slot, texture, color, cut, ease, pad) {
  const stations = sleeveStations(spec, cut, ease, pad)
  if (stations.length < 2) return
  for (const side of [-1, 1]) {
    groups.push(group(`${slot}-sleeve-${side < 0 ? 'l' : 'r'}`, slot, loftY(stations, 14, ease, pad, side), {
      texture,
      color,
      uvKind: 'sleeve',
      side,
    }))
  }
}

function topGroups(spec, garment) {
  const cut = sleeveCut(garment.type)
  const ease = 1.16
  const pad = 1.1
  const color = parseGarmentColor(garment.color, COLORS.top)
  const stations = [
    ...torsoSlice(spec, spec.hipY, spec.shoulderY),
    neckline(spec, 2.2),
  ]
  const groups = [group('top-torso', 'top', loftY(stations, 32, ease, pad), { texture: 'top', color, uvKind: 'wrap' })]
  pushSleeves(groups, spec, 'top', 'top', color, cut, ease + 0.02, pad)
  return groups
}

function outerGroups(spec, garment) {
  const cut = outerCut(garment.type)
  const ease = cut === 'vest' ? 1.2 : 1.3
  const pad = cut === 'vest' ? 1.2 : 1.7
  const color = parseGarmentColor(garment.color, COLORS.outer)
  const hip = spec.torso.find((station) => station.y === spec.hipY) || spec.torso[1]
  const stations = [
    { y: spec.hipY - (cut === 'vest' ? 2 : 18), rx: hip.rx * (cut === 'vest' ? 1.02 : 1.1), rz: hip.rz * 1.04 },
    ...torsoSlice(spec, spec.hipY, spec.shoulderY),
    neckline(spec, 2.45),
  ]
  const groups = [group('outer-torso', 'outer', loftY(stations, 32, ease, pad), { texture: 'outer', color, uvKind: 'wrap' })]
  if (cut !== 'vest') pushSleeves(groups, spec, 'outer', 'outer', color, 'long', ease, pad + 0.15)
  return groups
}

function legWear(spec, garment, ease, pad, y0) {
  const color = parseGarmentColor(garment.color, COLORS.bottom)
  const waist = spec.torso.find((station) => station.y === spec.waistY) || spec.torso[3]
  const hip = spec.torso.find((station) => station.y === spec.hipY) || spec.torso[1]
  const groups = [group('bottom-pelvis', 'bottom', loftY([
    { y: spec.hipY - 2, rx: hip.rx, rz: hip.rz },
    { y: spec.waistY, rx: waist.rx, rz: waist.rz },
  ], 28, ease, pad), { texture: 'bottom', color, uvKind: 'wrap' })]
  const legs = spec.leg.filter((station) => station.y >= y0 && station.y <= spec.hipY + 1)
  for (const side of [-1, 1]) {
    groups.push(group(`bottom-leg-${side < 0 ? 'l' : 'r'}`, 'bottom', loftY(legs, 16, ease, pad, side), {
      texture: 'bottom',
      color,
      uvKind: 'leg',
      side,
    }))
  }
  return groups
}

function skirtStations(spec, hemY, flare) {
  const waist = spec.torso.find((station) => station.y === spec.waistY)
  const hip = spec.torso.find((station) => station.y === spec.hipY)
  const steps = 9
  const stations = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const y = waist.y + (hemY - waist.y) * t
    const throughHip = Math.min(1, Math.max(0, (waist.y - y) / (waist.y - hip.y)))
    const baseRx = waist.rx + (hip.rx - waist.rx) * throughHip
    const baseRz = waist.rz + (hip.rz - waist.rz) * throughHip
    const belowHip = y >= hip.y ? 0 : (hip.y - y) / (hip.y - hemY)
    const flareT = belowHip * belowHip * (3 - 2 * belowHip)
    stations.push({
      y,
      rx: baseRx * (1 + (flare - 1) * flareT),
      rz: baseRz * (1 + (flare - 1) * 0.5 * flareT),
    })
  }
  return stations
}

function bottomGroups(spec, garment) {
  const cut = bottomCut(garment.type)
  if (cut === 'skirt') {
    const color = parseGarmentColor(garment.color, COLORS.bottom)
    return [group('bottom-skirt', 'bottom', loftY(skirtStations(spec, spec.kneeY + 6, 1.48), 32, 1.04, 0.2), {
      texture: 'bottom',
      color,
      uvKind: 'wrap',
    })]
  }
  if (cut === 'shorts') return legWear(spec, garment, 1.12, 0.7, spec.kneeY + 16)
  if (cut === 'leggings') return legWear(spec, garment, 1.06, 0.35, spec.leg[spec.leg.length - 1].y)
  return legWear(spec, garment, 1.14, 0.85, spec.leg[spec.leg.length - 1].y)
}

function dressGroups(spec, garment) {
  const cut = dressCut(garment.type)
  const color = parseGarmentColor(garment.color, COLORS.dress)
  if (cut === 'jumpsuit') {
    const ease = 1.06
    const pad = 0.3
    const groups = [group('dress-torso', 'dress', loftY([
      ...torsoSlice(spec, spec.hipY, spec.shoulderY),
      neckline(spec, 2.1),
    ], 32, ease, pad), { texture: 'dress', color, uvKind: 'wrap' })]
    pushSleeves(groups, spec, 'dress', 'dress', color, 'long', ease, pad)
    groups.push(...legWear(spec, { ...garment, color: garment.color }, ease, pad, spec.leg[spec.leg.length - 1].y)
      .map((item) => ({ ...item, texture: 'dress', slot: 'dress', color })))
    return groups
  }
  if (cut === 'swimsuit') {
    return [group('dress-torso', 'dress', loftY([
      ...torsoSlice(spec, spec.hipY - 4, spec.shoulderY),
      neckline(spec, 2.3),
    ], 32, 1.04, 0.15), { texture: 'dress', color, uvKind: 'wrap' })]
  }
  const bodice = torsoSlice(spec, spec.waistY, spec.shoulderY)
  const skirt = skirtStations(spec, spec.kneeY - 14, 1.62)
  const stations = [...skirt.filter((station) => station.y < spec.waistY), ...bodice, neckline(spec, 2.15)]
  stations.sort((a, b) => a.y - b.y)
  const groups = [group('dress-body', 'dress', loftY(stations, 32, 1.05, 0.25), { texture: 'dress', color, uvKind: 'wrap' })]
  pushSleeves(groups, spec, 'dress', 'dress', color, 'cap', 1.06, 0.3)
  return groups
}

function shoeRing(station, segments) {
  const ring = []
  for (let j = 0; j <= segments; j += 1) {
    const phi = Math.PI + (j / segments) * Math.PI * 2
    const down = Math.max(0, -Math.cos(phi))
    const ry = station.ry * (1 - 0.55 * down)
    const y = Math.max(0.35, station.y + Math.cos(phi) * ry - down * station.ry * 0.2)
    ring.push({
      x: station.x + Math.sin(phi) * station.rx,
      y,
      z: station.z,
      angle: phi,
      along: station.along,
    })
  }
  ring.center = { x: station.x, y: station.y, z: station.z }
  return ring
}

function shoeStations(spec, side) {
  const ankle = spec.leg[spec.leg.length - 1]
  const x = ankle.x * side
  const len = spec.sex === 'woman' ? 24 : 27
  const w = spec.sex === 'woman' ? 4.5 : 5.1
  const shape = [
    { t: 0, z: -4.2, y: 3.3, rx: w * 0.74, ry: 3.5 },
    { t: 0.16, z: 0.4, y: 4.6, rx: w * 0.9, ry: 5.0 },
    { t: 0.38, z: 6.5, y: 3.8, rx: w, ry: 4.2 },
    { t: 0.68, z: 14, y: 2.8, rx: w * 0.96, ry: 3.0 },
    { t: 1, z: len, y: 1.7, rx: w * 0.42, ry: 1.35 },
  ]
  return shape.map((station) => ({ ...station, x, along: station.t }))
}

function footStations(spec, side) {
  const ankle = spec.leg[spec.leg.length - 1]
  const x = ankle.x * side
  return [
    { t: 0, z: -2.2, y: 2.4, rx: 3.1, ry: 2.2, x, along: 0 },
    { t: 0.45, z: 6, y: 2.5, rx: 3.5, ry: 2.5, x, along: 0.45 },
    { t: 1, z: 16, y: 1.4, rx: 2.2, ry: 1.2, x, along: 1 },
  ]
}

function shoeGroups(spec, garment) {
  const color = parseGarmentColor(garment.color, COLORS.shoes)
  return [-1, 1].map((side) => group(`shoe-${side < 0 ? 'l' : 'r'}`, 'shoes', shoeStations(spec, side).map((station) => shoeRing(station, 18)), {
    texture: side < 0 ? 'shoes-left' : 'shoes-right',
    color,
    uvKind: 'shoe',
    side,
  }))
}

function footGroups(spec) {
  return [-1, 1].map((side) => group(`body-foot-${side < 0 ? 'l' : 'r'}`, null, footStations(spec, side).map((station) => shoeRing(station, 14)), {
    color: MANNEQUIN,
    uvKind: 'none',
    texture: null,
    side,
  }))
}

export function clothingGroups(sex, garments) {
  const spec = bodySpec(sex)
  const bySlot = {}
  for (const garment of garments || []) {
    if (!garment?.slot || garment.slot === 'accessory') continue
    bySlot[garment.slot] = garment
  }
  const groups = []
  if (bySlot.bottom && !bySlot.dress) groups.push(...bottomGroups(spec, bySlot.bottom))
  if (bySlot.dress) groups.push(...dressGroups(spec, bySlot.dress))
  if (bySlot.top) groups.push(...topGroups(spec, bySlot.top))
  if (bySlot.outer) groups.push(...outerGroups(spec, bySlot.outer))
  if (bySlot.shoes) groups.push(...shoeGroups(spec, bySlot.shoes))
  return groups
}

function coveredLimbs(garments) {
  const bySlot = {}
  for (const garment of garments || []) if (garment?.slot) bySlot[garment.slot] = garment
  const arms = (bySlot.top && sleeveCut(bySlot.top.type) === 'long')
    || (bySlot.outer && outerCut(bySlot.outer.type) === 'jacket')
    || (bySlot.dress && dressCut(bySlot.dress.type) === 'jumpsuit')
  const legs = (bySlot.bottom && bottomCut(bySlot.bottom.type) !== 'skirt')
    || (bySlot.dress && dressCut(bySlot.dress.type) === 'jumpsuit')
  return { arms, legs }
}

export function figureGroups(sex, garments) {
  const spec = bodySpec(sex)
  const clothes = clothingGroups(sex, garments)
  const covered = coveredLimbs(garments)
  const body = bodyGroups(spec).filter((item) => {
    if (covered.arms && item.id.startsWith('body-arm')) return false
    if (covered.legs && item.id.startsWith('body-leg')) return false
    return true
  })
  const feet = clothes.some((item) => item.slot === 'shoes') ? [] : footGroups(spec)
  return [...body, ...feet, ...clothes]
}

export function widthNear(group, y) {
  let best = group.rings[0]
  let err = Infinity
  for (const ring of group.rings) {
    const ry = ring.center?.y ?? ring[0].y
    const delta = Math.abs(ry - y)
    if (delta < err) {
      err = delta
      best = ring
    }
  }
  const xs = best.map((point) => point.x)
  return (Math.max(...xs) - Math.min(...xs)) / 2
}

export function groupBounds(group) {
  const points = group.rings.flat()
  return {
    id: group.id,
    slot: group.slot,
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  }
}

function garmentV(rings, point) {
  let minY = Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    minY = Math.min(minY, ring.center.y)
    maxY = Math.max(maxY, ring.center.y)
  }
  if (maxY === minY) return 0
  return (point.y - minY) / (maxY - minY)
}

function uvFor(kind, side, point, rings) {
  if (kind === 'shoe') return [point.u, point.v]
  const v = garmentV(rings, point)
  if (kind === 'sleeve') {
    const edge = side < 0 ? 0.28 : 0.72
    return [Math.min(0.9, Math.max(0.1, edge + Math.sin(point.angle) * 0.08)), 0.18 + v * 0.64]
  }
  const across = 0.5 + 0.46 * Math.sin(point.angle)
  if (kind === 'leg') return [side < 0 ? across * 0.5 : 0.5 + across * 0.5, v]
  if (kind === 'wrap') return [across, v]
  return [0.5, v]
}

function bakeShoeUv(rings) {
  const points = rings.flat()
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  for (const ring of rings) {
    for (const point of ring) {
      point.u = (point.x - minX) / spanX
      point.v = (point.y - minY) / spanY
    }
  }
}

function addLoft(mesh, rings, uvKind, side) {
  if (uvKind === 'shoe') bakeShoeUv(rings)
  const ids = rings.map((ring) => ring.map((point) => mesh.add(point, uvFor(uvKind, side, point, rings))))
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < rings[i].length - 1; j += 1) {
      const p00 = rings[i][j]
      const p01 = rings[i][j + 1]
      const p10 = rings[i + 1][j]
      const p11 = rings[i + 1][j + 1]
      const mid = {
        x: (p00.x + p01.x + p10.x + p11.x) / 4,
        y: (p00.y + p01.y + p10.y + p11.y) / 4,
        z: (p00.z + p01.z + p10.z + p11.z) / 4,
      }
      const center = {
        x: (rings[i].center.x + rings[i + 1].center.x) / 2,
        y: (rings[i].center.y + rings[i + 1].center.y) / 2,
        z: (rings[i].center.z + rings[i + 1].center.z) / 2,
      }
      const nx = (p10.y - p00.y) * (p01.z - p00.z) - (p10.z - p00.z) * (p01.y - p00.y)
      const ny = (p10.z - p00.z) * (p01.x - p00.x) - (p10.x - p00.x) * (p01.z - p00.z)
      const nz = (p10.x - p00.x) * (p01.y - p00.y) - (p10.y - p00.y) * (p01.x - p00.x)
      const outward = nx * (mid.x - center.x) + ny * (mid.y - center.y) + nz * (mid.z - center.z)
      const a = ids[i][j]
      const b = ids[i][j + 1]
      const c = ids[i + 1][j]
      const d = ids[i + 1][j + 1]
      if (outward >= 0) {
        mesh.tri(a, c, b)
        mesh.tri(b, c, d)
      } else {
        mesh.tri(a, b, c)
        mesh.tri(b, d, c)
      }
    }
  }
  return ids
}

function createMesh() {
  const pos = []
  const uv = []
  const idx = []
  return {
    add(point, tex) {
      const index = pos.length / 3
      pos.push(point.x, point.y, point.z)
      uv.push(tex[0], tex[1])
      return index
    },
    tri(a, b, c) { idx.push(a, b, c) },
    finish() {
      const nrm = new Array(pos.length).fill(0)
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t]
        const b = idx[t + 1]
        const c = idx[t + 2]
        const ax = pos[a * 3]
        const ay = pos[a * 3 + 1]
        const az = pos[a * 3 + 2]
        const bx = pos[b * 3]
        const by = pos[b * 3 + 1]
        const bz = pos[b * 3 + 2]
        const cx = pos[c * 3]
        const cy = pos[c * 3 + 1]
        const cz = pos[c * 3 + 2]
        const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
        const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
        const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        for (const vertex of [a, b, c]) {
          nrm[vertex * 3] += nx
          nrm[vertex * 3 + 1] += ny
          nrm[vertex * 3 + 2] += nz
        }
      }
      for (let i = 0; i < nrm.length; i += 3) {
        const len = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1
        nrm[i] /= len
        nrm[i + 1] /= len
        nrm[i + 2] /= len
      }
      return {
        positions: new Float32Array(pos),
        normals: new Float32Array(nrm),
        uvs: new Float32Array(uv),
        indices: new Uint16Array(idx),
      }
    },
  }
}

export function buildFigureParts(sex, garments) {
  return figureGroups(sex, garments).map((item) => {
    const mesh = createMesh()
    addLoft(mesh, item.rings, item.uvKind, item.side)
    return {
      id: item.id,
      slot: item.slot,
      texture: item.texture,
      color: item.color,
      ...mesh.finish(),
    }
  })
}

export function opaqueUvRect(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { u0: 0, v0: 0, u1: 1, v1: 1 }
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let any = false
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        any = true
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (!any) return { u0: 0, v0: 0, u1: 1, v1: 1 }
  const padX = (maxX - minX) * 0.03
  const padY = (maxY - minY) * 0.03
  return {
    u0: Math.max(0, (minX - padX) / width),
    v0: Math.max(0, (minY - padY) / height),
    u1: Math.min(1, (maxX + 1 + padX) / width),
    v1: Math.min(1, (maxY + 1 + padY) / height),
  }
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform float uYaw;
uniform float uCamZ;
uniform float uFocal;
uniform float uCenterY;
uniform float uHalfH;
uniform float uAspect;
uniform float uNear;
uniform float uFar;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  float c = cos(uYaw);
  float s = sin(uYaw);
  float x = aPos.x * c + aPos.z * s;
  float y = aPos.y;
  float z = -aPos.x * s + aPos.z * c;
  float nx = aNormal.x * c + aNormal.z * s;
  float nz = -aNormal.x * s + aNormal.z * c;
  float dist = uCamZ - z;
  float scale = uFocal / dist;
  float halfW = uHalfH * uAspect;
  float ndcZ = ((dist - uNear) / (uFar - uNear)) * 2.0 - 1.0;
  gl_Position = vec4(x * scale / halfW, (y - uCenterY) * scale / uHalfH, ndcZ, 1.0);
  vNormal = normalize(vec3(nx, aNormal.y, nz));
  vUv = aUv;
}
`

const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec4 uUvRect;
uniform float uUseTexture;
uniform sampler2D uTex;
void main() {
  vec2 uv = vec2(mix(uUvRect.x, uUvRect.z, vUv.x), mix(uUvRect.w, uUvRect.y, vUv.y));
  vec3 color = uColor;
  if (uUseTexture > 0.5) {
    vec4 tex = texture2D(uTex, uv);
    // Trouser shells are solid cloth: transparent photo pixels must not expose the body.
    if (uUseTexture > 1.5) {
      color = mix(uColor, tex.rgb, smoothstep(0.12, 0.95, tex.a));
    } else {
      if (tex.a < 0.12) discard;
      color = tex.rgb;
    }
  }
  float lambert = dot(normalize(vNormal), normalize(vec3(-0.18, 0.52, 0.82)));
  float light = 0.34 + 0.66 * clamp(lambert, 0.0, 1.0);
  gl_FragColor = vec4(color * light, 1.0);
}
`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(log || 'shader compile failed')
  }
  return shader
}

export function mountWardrobe3D(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
  if (!gl) return null
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  const loc = {
    pos: gl.getAttribLocation(program, 'aPos'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    uv: gl.getAttribLocation(program, 'aUv'),
    yaw: gl.getUniformLocation(program, 'uYaw'),
    camZ: gl.getUniformLocation(program, 'uCamZ'),
    focal: gl.getUniformLocation(program, 'uFocal'),
    centerY: gl.getUniformLocation(program, 'uCenterY'),
    halfH: gl.getUniformLocation(program, 'uHalfH'),
    aspect: gl.getUniformLocation(program, 'uAspect'),
    near: gl.getUniformLocation(program, 'uNear'),
    far: gl.getUniformLocation(program, 'uFar'),
    color: gl.getUniformLocation(program, 'uColor'),
    uvRect: gl.getUniformLocation(program, 'uUvRect'),
    useTexture: gl.getUniformLocation(program, 'uUseTexture'),
  }
  gl.uniform1f(loc.camZ, VIEW.camZ)
  gl.uniform1f(loc.focal, VIEW.focal)
  gl.uniform1f(loc.centerY, VIEW.centerY)
  gl.uniform1f(loc.halfH, VIEW.halfH)
  gl.uniform1f(loc.near, VIEW.near)
  gl.uniform1f(loc.far, VIEW.far)
  const buffers = []
  const textures = new Map()
  let builtKey = ''
  let last = null
  let drawing = false
  let observer = null

  function releaseBuffers() {
    for (const buffer of buffers) {
      gl.deleteBuffer(buffer.pos)
      gl.deleteBuffer(buffer.nrm)
      gl.deleteBuffer(buffer.uv)
      gl.deleteBuffer(buffer.idx)
    }
    buffers.length = 0
  }

  function uploadTexture(name, source) {
    const existing = textures.get(name)
    if (existing) gl.deleteTexture(existing)
    if (!source) {
      textures.delete(name)
      return
    }
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    textures.set(name, tex)
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(2, Math.round(canvas.clientWidth * dpr))
    const height = Math.max(2, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  const api = {
    render(state) {
      last = state
      if (drawing) return
      drawing = true
      try {
      const { sex, garments, photos, yaw, key } = state
      resize()
      if (key !== builtKey) {
        releaseBuffers()
        const parts = buildFigureParts(sex, garments)
        for (const part of parts) {
          const pos = gl.createBuffer()
          const nrm = gl.createBuffer()
          const uv = gl.createBuffer()
          const idx = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, pos)
          gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW)
          gl.bindBuffer(gl.ARRAY_BUFFER, nrm)
          gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW)
          gl.bindBuffer(gl.ARRAY_BUFFER, uv)
          gl.bufferData(gl.ARRAY_BUFFER, part.uvs, gl.STATIC_DRAW)
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx)
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW)
          buffers.push({
            pos, nrm, uv, idx,
            count: part.indices.length,
            color: part.color,
            texture: part.texture,
            solidCloth: part.slot === 'bottom' && (part.id === 'bottom-pelvis' || part.id.startsWith('bottom-leg-')),
          })
        }
        for (const name of ['top', 'bottom', 'dress', 'outer', 'shoes-left', 'shoes-right']) uploadTexture(name, photos?.[name]?.source || null)
        builtKey = key
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0.07, 0.1, 0.18, 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.enable(gl.CULL_FACE)
      gl.cullFace(gl.BACK)
      gl.useProgram(program)
      gl.uniform1f(loc.yaw, yaw)
      gl.uniform1f(loc.aspect, canvas.width / canvas.height)
      for (const buffer of buffers) {
        const photo = buffer.texture ? photos?.[buffer.texture] : null
        const tex = buffer.texture ? textures.get(buffer.texture) : null
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.pos)
        gl.enableVertexAttribArray(loc.pos)
        gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.nrm)
        gl.enableVertexAttribArray(loc.normal)
        gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.uv)
        gl.enableVertexAttribArray(loc.uv)
        gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.idx)
        gl.uniform3fv(loc.color, buffer.color)
        const rect = photo?.bounds || { u0: 0, v0: 0, u1: 1, v1: 1 }
        gl.uniform4f(loc.uvRect, rect.u0, rect.v0, rect.u1, rect.v1)
        if (tex) {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.uniform1f(loc.useTexture, buffer.solidCloth ? 2 : 1)
        } else {
          gl.uniform1f(loc.useTexture, 0)
        }
        gl.drawElements(gl.TRIANGLES, buffer.count, gl.UNSIGNED_SHORT, 0)
      }
      } finally {
        drawing = false
      }
    },
    dispose() {
      observer?.disconnect()
      releaseBuffers()
      for (const tex of textures.values()) gl.deleteTexture(tex)
      textures.clear()
      gl.deleteProgram(program)
    },
  }
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => { if (last) api.render(last) })
    observer.observe(canvas)
  }
  return api
}
