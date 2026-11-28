import { describe, expect, it } from 'vitest'
import { bodySpec, buildFigureParts, clothingGroups, dominantOpaqueColorFromPixels, groupBounds, projectPoint, widthNear, wrapDegrees } from './wardrobe3dFit.js'

const layers = [
  { slot: 'top', type: 'Tröja', color: '#2255aa' },
  { slot: 'bottom', type: 'Byxor', color: '#223344' },
  { slot: 'outer', type: 'Jacka', color: '#334455' },
  { slot: 'shoes', type: 'Skor', color: '#222222' },
]
const dress = [
  { slot: 'dress', type: 'Klänning', color: '#884488' },
  { slot: 'shoes', type: 'Skor', color: '#111111' },
]

function part(sex, garments, id) {
  return buildFigureParts(sex, garments).find((item) => item.id === id)
}

function vertex(mesh, score) {
  let best = null
  let bestScore = -Infinity
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const point = {
      x: mesh.positions[index],
      y: mesh.positions[index + 1],
      z: mesh.positions[index + 2],
      nx: mesh.normals[index],
      ny: mesh.normals[index + 1],
      nz: mesh.normals[index + 2],
      u: mesh.uvs[(index / 3) * 2],
      v: mesh.uvs[(index / 3) * 2 + 1],
    }
    const value = score(point)
    if (value > bestScore) {
      bestScore = value
      best = point
    }
  }
  return best
}

describe('wardrobe 3D fit', () => {
  it('reads the fill colour from the garment photo', () => {
    const paint = (rgb, count) => {
      const data = new Uint8ClampedArray(count * 4)
      for (let i = 0; i < count; i += 1) data.set([rgb[0], rgb[1], rgb[2], rgb[3] ?? 255], i * 4)
      return data
    }
    const beige = new Uint8ClampedArray(8 * 4)
    beige.set(paint([196, 165, 116], 6))
    beige.set(paint([31, 78, 137], 1), 6 * 4)
    beige.set(paint([255, 255, 255], 1), 7 * 4)
    const fill = dominantOpaqueColorFromPixels(beige)
    expect(fill[0]).toBeGreaterThan(0.6)
    expect(fill[0]).toBeGreaterThan(fill[2])
    expect(Math.max(...dominantOpaqueColorFromPixels(paint([18, 18, 20], 4)))).toBeLessThan(0.15)
    const blue = dominantOpaqueColorFromPixels(paint([31, 78, 137], 4))
    expect(blue[2]).toBeGreaterThan(blue[0])
    expect(dominantOpaqueColorFromPixels(paint([255, 255, 255, 0], 3))).toBeNull()
  })

  it('turns both bodies through a full circle and back to the front', () => {
    expect(wrapDegrees(360)).toBe(0)
    expect(wrapDegrees(-45)).toBe(315)
    expect(wrapDegrees(45 * 8)).toBe(0)
    for (const sex of ['woman', 'man']) {
      const front = projectPoint(0, 110, 16, 0)
      const fullTurn = projectPoint(0, 110, 16, Math.PI * 2)
      const right = projectPoint(0, 110, 16, Math.PI / 2)
      const left = projectPoint(0, 110, 16, -Math.PI / 2)
      const back = projectPoint(0, 110, 16, Math.PI)
      expect(front.ndcX).toBeCloseTo(0, 5)
      expect(fullTurn.ndcX).toBeCloseTo(front.ndcX, 5)
      expect(fullTurn.depth).toBeCloseTo(front.depth, 5)
      expect(right.ndcX).toBeGreaterThan(0.05)
      expect(left.ndcX).toBeLessThan(-0.05)
      expect(back.depth).toBeGreaterThan(front.depth)
      const meshes = buildFigureParts(sex, sex === 'woman' ? layers : layers)
      for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]) {
        for (const mesh of meshes) {
          for (let index = 0; index < mesh.positions.length; index += 3) {
            const projected = projectPoint(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2], yaw)
            expect(Math.abs(projected.ndcX)).toBeLessThan(1.08)
            expect(Math.abs(projected.ndcY)).toBeLessThan(1.08)
            expect(Number.isFinite(projected.depth)).toBe(true)
          }
        }
      }
    }
  })

  it('gives the two dolls different proportions', () => {
    const woman = bodySpec('woman')
    const man = bodySpec('man')
    const womanShoulder = woman.torso.find((station) => station.y === woman.shoulderY)
    const manShoulder = man.torso.find((station) => station.y === man.shoulderY)
    const womanWaist = woman.torso.find((station) => station.y === woman.waistY)
    const manWaist = man.torso.find((station) => station.y === man.waistY)
    const womanHip = woman.torso.find((station) => station.y === woman.hipY)
    const manHip = man.torso.find((station) => station.y === man.hipY)
    expect(manShoulder.rx).toBeGreaterThan(womanShoulder.rx + 2)
    expect(womanHip.rx / womanWaist.rx).toBeGreaterThan(manHip.rx / manWaist.rx)
    expect(manShoulder.rx).toBeGreaterThan(manHip.rx)
    expect(womanHip.rx).toBeGreaterThan(womanWaist.rx * 1.3)
  })

  it('fits a sweater outside the torso, with sleeves and the photo upright', () => {
    const groups = clothingGroups('woman', layers)
    const torso = groups.find((item) => item.id === 'top-torso')
    const body = clothingGroups('woman', []).length
    expect(body).toBe(0)
    expect(widthNear(torso, 120)).toBeGreaterThan(bodySpec('woman').torso.find((station) => station.y === 120).rx + 0.8)
    expect(widthNear(torso, 120)).toBeLessThan(widthNear(torso, bodySpec('woman').shoulderY))
    expect(groupBounds(torso).minY).toBeGreaterThan(90)
    expect(groupBounds(torso).maxY).toBeLessThan(160)
    expect(groups.filter((item) => item.id.startsWith('top-sleeve'))).toHaveLength(2)
    const worn = buildFigureParts('woman', layers)
    expect(worn.some((item) => item.id.startsWith('body-arm'))).toBe(false)
    expect(worn.some((item) => item.id.startsWith('body-leg'))).toBe(false)
    expect(worn.some((item) => item.id.startsWith('top-sleeve'))).toBe(true)
    expect(groupBounds(groups.find((item) => item.id === 'top-sleeve-l')).minY).toBeLessThan(100)
    const mesh = part('woman', layers, 'top-torso')
    const front = vertex(mesh, (point) => point.z)
    const high = vertex(mesh, (point) => point.y)
    const low = vertex(mesh, (point) => -point.y)
    expect(front.u).toBeGreaterThan(0.42)
    expect(front.u).toBeLessThan(0.58)
    expect(front.nz).toBeGreaterThan(0.45)
    expect(high.v).toBeGreaterThan(low.v)
  })

  it('fits a jacket looser and longer than the sweater', () => {
    const groups = clothingGroups('woman', layers)
    const sweater = groups.find((item) => item.id === 'top-torso')
    const jacket = groups.find((item) => item.id === 'outer-torso')
    expect(widthNear(jacket, 120)).toBeGreaterThan(widthNear(sweater, 120) + 1)
    expect(groupBounds(jacket).minY).toBeLessThan(groupBounds(sweater).minY - 8)
    expect(groups.filter((item) => item.id.startsWith('outer-sleeve'))).toHaveLength(2)
    expect(clothingGroups('woman', [{ slot: 'outer', type: 'Väst', color: '#445566' }]).some((item) => item.id.startsWith('outer-sleeve'))).toBe(false)
  })

  it('fits trousers as two tapered legs and a dress as one flared skirt', () => {
    const pants = clothingGroups('woman', layers)
    const left = pants.find((item) => item.id === 'bottom-leg-l')
    const right = pants.find((item) => item.id === 'bottom-leg-r')
    const ringAt = (group, y) => group.rings.reduce((best, ring) => Math.abs(ring.center.y - y) < Math.abs(best.center.y - y) ? ring : best)
    const leftKnee = ringAt(left, 52)
    const rightKnee = ringAt(right, 52)
    expect(Math.max(...leftKnee.map((point) => point.x))).toBeLessThan(-1)
    expect(Math.min(...rightKnee.map((point) => point.x))).toBeGreaterThan(1)
    expect(widthNear(left, 52)).toBeLessThan(widthNear(left, 100))
    expect(groupBounds(left).minY).toBeLessThan(12)
    const skirt = clothingGroups('woman', dress).find((item) => item.id === 'dress-body')
    const bounds = groupBounds(skirt)
    expect(bounds.minY).toBeLessThan(bodySpec('woman').kneeY)
    expect(bounds.maxY).toBeGreaterThan(bodySpec('woman').shoulderY)
    expect(widthNear(skirt, bounds.minY)).toBeGreaterThan(widthNear(skirt, bodySpec('woman').waistY) * 1.25)
    expect(Math.abs((groupBounds(skirt).minX + groupBounds(skirt).maxX) / 2)).toBeLessThan(1)
    expect(clothingGroups('woman', [...dress, { slot: 'bottom', type: 'Byxor', color: '#112233' }]).some((item) => item.slot === 'bottom')).toBe(false)
  })

  it('places a separate shoe on each foot, pointing forward', () => {
    for (const sex of ['woman', 'man']) {
      const groups = clothingGroups(sex, layers)
      const left = groupBounds(groups.find((item) => item.id === 'shoe-l'))
      const right = groupBounds(groups.find((item) => item.id === 'shoe-r'))
      expect(left.maxX).toBeLessThan(0)
      expect(right.minX).toBeGreaterThan(0)
      expect(left.maxZ).toBeGreaterThan(18)
      expect(right.maxZ).toBeGreaterThan(18)
      expect(left.minY).toBeLessThan(2)
      expect(left.maxY).toBeGreaterThan(6)
      expect(left.minZ).toBeLessThan(0)
    }
    const bare = buildFigureParts('woman', [])
    expect(bare.some((item) => item.id === 'body-foot-l')).toBe(true)
    expect(bare.some((item) => item.id.startsWith('shoe-'))).toBe(false)
  })

  it('keeps the saved photo on the surface while the body turns', () => {
    const mesh = part('man', layers, 'top-torso')
    const front = vertex(mesh, (point) => point.z - Math.abs(point.x) * 0.2)
    const side = vertex(mesh, (point) => point.x)
    const turned = projectPoint(front.x, front.y, front.z, Math.PI / 2)
    const turnedBack = projectPoint(front.x, front.y, front.z, Math.PI * 2)
    expect(side.u).toBeGreaterThan(0.8)
    expect(front.u).toBeLessThan(side.u)
    expect(turned.ndcX).toBeGreaterThan(0.02)
    expect(turnedBack.ndcX).toBeCloseTo(projectPoint(front.x, front.y, front.z, 0).ndcX, 4)
    const leftLeg = part('woman', layers, 'bottom-leg-l')
    const rightLeg = part('woman', layers, 'bottom-leg-r')
    expect(vertex(leftLeg, (point) => -point.u).u).toBeLessThan(0.5)
    expect(vertex(rightLeg, (point) => point.u).u).toBeGreaterThan(0.5)
  })
})
