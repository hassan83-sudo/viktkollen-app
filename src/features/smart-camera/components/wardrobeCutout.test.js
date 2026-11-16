import { describe, expect, it } from 'vitest'
import { cutoutLightBackground, splitShoePair } from './wardrobeCutout.js'

const WHITE = [250, 250, 250]
const NAVY = [35, 45, 90]

// Builds an RGBA buffer from a painter: (x, y) => [r, g, b] or null for background.
function image(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rgb = paint(x, y) || WHITE
      data.set([...rgb, 255], (y * w + x) * 4)
    }
  }
  return data
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1
// Simple T-shirt: torso plus two sleeves.
const tee = (x, y) => inRect(x, y, 30, 20, 70, 90) || inRect(x, y, 10, 20, 30, 45) || inRect(x, y, 70, 20, 90, 45)

function alphaAt(data, w, x, y) {
  return data[(y * w + x) * 4 + 3]
}

describe('cutoutLightBackground', () => {
  it('frilägger ett helt mörkt plagg och returnerar dess yttermått', () => {
    const data = image(100, 100, (x, y) => (tee(x, y) ? NAVY : null))
    expect(cutoutLightBackground(data, 100, 100)).toMatchObject({ minX: 10, minY: 20, maxX: 90, maxY: 90 })
    expect(alphaAt(data, 100, 0, 0)).toBe(0)
    expect(alphaAt(data, 100, 50, 50)).toBe(255)
  })

  it('godkänner ett par skor som två separata delar', () => {
    const data = image(120, 60, (x, y) => (inRect(x, y, 10, 20, 50, 40) || inRect(x, y, 70, 20, 110, 40) ? [60, 40, 30] : null))
    const box = cutoutLightBackground(data, 120, 60)
    expect(box).toMatchObject({ minX: 10, minY: 20, maxX: 110, maxY: 40 })
    expect(box.parts.map(({ minX, maxX }) => [minX, maxX])).toEqual([[10, 50], [70, 110]])
  })

  it('avvisar en randig tröja vars ljusa ränder skulle klippas bort som hål', () => {
    const data = image(100, 100, (x, y) => {
      if (!tee(x, y)) return null
      return (y - 20) % 12 < 4 ? WHITE : NAVY
    })
    expect(cutoutLightBackground(data, 100, 100)).toBeNull()
  })

  it('avvisar ett mörkt plagg med ljust parti som når sidan och blir ett hål', () => {
    // A light panel inside the torso that touches the side seam, so the fill leaks in.
    const data = image(100, 100, (x, y) => {
      if (!tee(x, y)) return null
      return inRect(x, y, 30, 55, 58, 68) ? WHITE : NAVY
    })
    expect(cutoutLightBackground(data, 100, 100)).toBeNull()
  })

  it('avvisar ett plagg som faller sönder i många bitar', () => {
    const data = image(100, 100, (x, y) => (tee(x, y) && x % 10 < 6 ? NAVY : null))
    expect(cutoutLightBackground(data, 100, 100)).toBeNull()
  })

  it('avvisar ett vitt plagg på vit bakgrund', () => {
    const data = image(100, 100, (x, y) => (tee(x, y) ? [246, 246, 246] : null))
    expect(cutoutLightBackground(data, 100, 100)).toBeNull()
  })

  it('lämnar mörk eller mönstrad bakgrund orörd', () => {
    const data = image(100, 100, (x, y) => (tee(x, y) ? NAVY : [40, 90, 40]))
    expect(cutoutLightBackground(data, 100, 100)).toBeNull()
  })

  it('tar bort lösa prickar så att de inte förstorar plaggets yttermått', () => {
    const data = image(100, 100, (x, y) => (tee(x, y) || (x === 95 && y === 5) ? NAVY : null))
    expect(cutoutLightBackground(data, 100, 100)).toMatchObject({ minX: 10, minY: 20, maxX: 90, maxY: 90 })
    expect(alphaAt(data, 100, 95, 5)).toBe(0)
  })
})

describe('splitShoePair', () => {
  const part = (minX, maxX, minY = 20, maxY = 40, size = (maxX - minX + 1) * (maxY - minY + 1)) => ({ minX, maxX, minY, maxY, size })

  it('delar ett par i vänster och höger sko', () => {
    const left = part(10, 50)
    const right = part(70, 110)
    expect(splitShoePair([right, left])).toEqual([left, right])
  })

  it('delar skor ur en riktig friläggning', () => {
    const data = image(120, 60, (x, y) => (inRect(x, y, 10, 20, 50, 40) || inRect(x, y, 70, 20, 110, 40) ? [60, 40, 30] : null))
    const pair = splitShoePair(cutoutLightBackground(data, 120, 60).parts)
    expect(pair.map(({ minX }) => minX)).toEqual([10, 70])
  })

  it('avvisar skor som går ihop till en enda del', () => {
    expect(splitShoePair([part(10, 110)])).toBeNull()
  })

  it('avvisar delar som överlappar i sidled', () => {
    expect(splitShoePair([part(10, 60), part(55, 110)])).toBeNull()
  })

  it('avvisar ett par där den ena delen är mycket mindre', () => {
    expect(splitShoePair([part(10, 50), part(70, 80)])).toBeNull()
  })

  it('avvisar ett par med mycket olika höjd', () => {
    expect(splitShoePair([part(10, 50, 0, 60), part(70, 110, 30, 40, 41 * 61)])).toBeNull()
  })

  it('avvisar saknade delar', () => {
    expect(splitShoePair(undefined)).toBeNull()
    expect(splitShoePair([])).toBeNull()
  })
})
