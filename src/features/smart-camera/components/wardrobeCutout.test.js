import { describe, expect, it } from 'vitest'
import { cutoutLightBackground, cutoutShoePair, splitShoePair } from './wardrobeCutout.js'

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

  it('avvisar ett mörkt plagg med ljust tryck som läcker ut till sidan och blir ett hål', () => {
    // A light print inside the torso, joined to the side seam by a thin light line.
    const data = image(100, 100, (x, y) => {
      if (!tee(x, y)) return null
      return inRect(x, y, 40, 52, 62, 72) || inRect(x, y, 30, 61, 40, 62) ? WHITE : NAVY
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

describe('cutoutShoePair (vita skor mot ljus bakgrund)', () => {
  const BG = [250, 250, 250]
  const UPPER = [247, 247, 247]
  const OUTLINE = [196, 198, 202]
  // A white side-view shoe: light upper inside a grey outline, grey sole below.
  const shoe = (x, y, x0, x1) => {
    if (!inRect(x, y, x0, 20, x1, 52)) return null
    if (y >= 46) return [230, 230, 232]
    if (x === x0 || x === x1 || y === 20) return OUTLINE
    return UPPER
  }
  const pairImage = (x0a, x1a, x0b, x1b, paint = shoe) => image(160, 70, (x, y) => paint(x, y, x0a, x1a) || paint(x, y, x0b, x1b) || BG)

  it('frilägger vita skor som står isär och delar dem i vänster och höger', () => {
    const data = pairImage(10, 70, 90, 150)
    const result = cutoutShoePair(data, 160, 70)
    expect(result.parts.map(({ minX, maxX }) => [minX, maxX])).toEqual([[10, 70], [90, 150]])
    expect(alphaAt(data, 160, 40, 30)).toBe(255) // white upper is kept
    expect(alphaAt(data, 160, 80, 30)).toBe(0) // background between the shoes is removed
    expect(alphaAt(data, 160, 2, 2)).toBe(0)
  })

  it('delar vita skor som nuddar varandra vid tårna', () => {
    // Real shoes get lower towards the toe; here the toes of both shoes meet.
    const sloped = (x, y, x0, x1, toeRight) => {
      const along = toeRight ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0)
      const top = 20 + Math.round(along * 22)
      if (!inRect(x, y, x0, top, x1, 52)) return null
      if (y >= 46) return [230, 230, 232]
      if (x === x0 || x === x1 || y === top) return OUTLINE
      return UPPER
    }
    const data = image(160, 70, (x, y) => sloped(x, y, 10, 79, true) || sloped(x, y, 80, 150, false) || BG)
    const result = cutoutShoePair(data, 160, 70)
    expect(result).not.toBeNull()
    expect(result.parts).toHaveLength(2)
  })

  it('frilägger skor framifrån som nuddar varandra och står i en mjuk skugga', () => {
    // Product photo seen from the front: two tall shoes side by side whose
    // soles touch, on a light background with a soft grey floor shadow.
    const W = 120
    const H = 140
    const shadow = (x, y) => {
      const s = Math.max(0, 26 - Math.hypot((x - 57) * 0.6, y - 112) * 0.5)
      return [245 - s, 246 - s, 248 - s].map(Math.round)
    }
    const front = (x, y, cx) => {
      const r = ((x - cx) / 22) ** 2 + ((y - 70) / 45) ** 2
      if (r > 1) return null
      return r > 0.9 ? [150, 140, 130] : [225, 220, 210]
    }
    const data = image(W, H, (x, y) => front(x, y, 38) || front(x, y, 76) || shadow(x, y))
    const result = cutoutShoePair(data, W, H)
    expect(result).not.toBeNull()
    const [left, right] = result.parts
    expect(left.maxX).toBeLessThan(right.minX)
    expect(left.maxY).toBeLessThanOrEqual(116) // the shadow below is not part of the shoe
    expect(alphaAt(data, W, 38, 70)).toBe(255)
    expect(alphaAt(data, W, 76, 70)).toBe(255)
    expect(alphaAt(data, W, 57, 125)).toBe(0) // darkest part of the shadow is removed
  })

  it('ritar inget när skorna inte syns mot bakgrunden', () => {
    const faint = (x, y, x0, x1) => (inRect(x, y, x0, 20, x1, 52) ? [248, 248, 248] : null)
    expect(cutoutShoePair(pairImage(10, 70, 90, 150, faint), 160, 70)).toBeNull()
  })

  it('ritar inget för en enda sko', () => {
    expect(cutoutShoePair(image(160, 70, (x, y) => shoe(x, y, 40, 120) || BG), 160, 70)).toBeNull()
  })

  it('ritar inget för skor som överlappar varandra', () => {
    const dark = (x, y, x0, x1) => (inRect(x, y, x0, 20, x1, 52) ? [40, 30, 25] : null)
    expect(cutoutShoePair(pairImage(10, 90, 60, 150, dark), 160, 70)).toBeNull()
  })

  it('ritar inget på en mönstrad bakgrund', () => {
    const data = image(160, 70, (x, y) => shoe(x, y, 10, 70) || shoe(x, y, 90, 150) || ((x + y) % 2 ? [250, 250, 250] : [30, 30, 30]))
    expect(cutoutShoePair(data, 160, 70)).toBeNull()
  })
})

describe('cutoutLightBackground (klänningar och konkava former)', () => {
  it('godkänner en klänning med smal midja och vid kjol', () => {
    const dress = (x, y) => {
      if (inRect(x, y, 35, 10, 65, 40)) return [150, 30, 45] // bodice
      if (inRect(x, y, 25, 10, 75, 18)) return [150, 30, 45] // shoulders and sleeves
      if (y > 40 && y <= 90) {
        const half = 15 + (y - 40) * 0.6 // skirt widens towards the hem
        if (x >= 50 - half && x <= 50 + half) return [150, 30, 45]
      }
      return null
    }
    expect(cutoutLightBackground(image(100, 100, dress), 100, 100)).not.toBeNull()
  })
})
