// Pure pixel logic for cutting a garment out of a light photo background.
// Kept free of DOM/canvas so it can be unit tested with synthetic pixels.

export const isLight = (r, g, b) => Math.min(r, g, b) >= 224 && Math.max(r, g, b) - Math.min(r, g, b) <= 24

// Quality limits. A cutout that fails any of them is not shown on the mannequin;
// the original photo is shown in the garment list instead.
const MIN_BACKGROUND_SHARE = 0.03
const MAX_BACKGROUND_SHARE = 0.92
const SIGNIFICANT_PART_SHARE = 0.02 // parts smaller than this are specks
const MAX_SIGNIFICANT_PARTS = 2 // one garment, or a pair of shoes
const MAX_SPECK_SHARE = 0.05 // more loose fragments than this means a torn cutout
const MAX_ENCLOSED_BACKGROUND_SHARE = 0.04 // background removed from inside the garment

/**
 * Removes near-white background connected to the image border, in place.
 * Returns the bounding box of the kept garment, or null when the background is
 * not clearly light or when the result would be broken (holes or fragments).
 * Dark, patterned or ambiguous backgrounds are deliberately kept (null).
 */
export function cutoutLightBackground(data, w, h) {
  const total = w * h
  if (!total) return null
  let border = 0
  let light = 0
  const countBorder = (i) => {
    const p = i * 4
    border++
    if (isLight(data[p], data[p + 1], data[p + 2])) light++
  }
  for (let x = 0; x < w; x++) { countBorder(x); if (h > 1) countBorder((h - 1) * w + x) }
  for (let y = 1; y < h - 1; y++) { countBorder(y * w); if (w > 1) countBorder(y * w + w - 1) }
  if (light / border < 0.85) return null

  // 1. Flood fill the light background from the border.
  //    Plain loops (no closures that mutate shared counters) keep this deterministic.
  const background = new Uint8Array(total)
  const queue = new Int32Array(total)
  const neighbours = new Int32Array(4)
  let tail = 0
  for (let i = 0; i < total; i++) {
    const x = i % w
    const y = (i / w) | 0
    if (x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1) continue
    const p = i * 4
    if (!background[i] && isLight(data[p], data[p + 1], data[p + 2])) { background[i] = 1; queue[tail] = i; tail += 1 }
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head]
    const x = i % w
    let count = 0
    if (x > 0) { neighbours[count] = i - 1; count += 1 }
    if (x + 1 < w) { neighbours[count] = i + 1; count += 1 }
    if (i >= w) { neighbours[count] = i - w; count += 1 }
    if (i + w < total) { neighbours[count] = i + w; count += 1 }
    for (let k = 0; k < count; k++) {
      const n = neighbours[k]
      const p = n * 4
      if (!background[n] && isLight(data[p], data[p + 1], data[p + 2])) { background[n] = 1; queue[tail] = n; tail += 1 }
    }
  }
  if (tail < total * MIN_BACKGROUND_SHARE || tail > total * MAX_BACKGROUND_SHARE) return null

  // 2. Label the remaining garment pixels into connected parts.
  const label = new Int32Array(total) // 0 = background, >0 = part id
  const sizes = [0]
  let foreground = 0
  for (let start = 0; start < total; start++) {
    if (background[start] || label[start] || data[start * 4 + 3] === 0) continue
    const id = sizes.length
    label[start] = id
    queue[0] = start
    let end = 1
    for (let head = 0; head < end; head++) {
      const i = queue[head]
      const x = i % w
      let count = 0
      if (x > 0) { neighbours[count] = i - 1; count += 1 }
      if (x + 1 < w) { neighbours[count] = i + 1; count += 1 }
      if (i >= w) { neighbours[count] = i - w; count += 1 }
      if (i + w < total) { neighbours[count] = i + w; count += 1 }
      for (let k = 0; k < count; k++) {
        const n = neighbours[k]
        if (!background[n] && !label[n] && data[n * 4 + 3] !== 0) { label[n] = id; queue[end] = n; end += 1 }
      }
    }
    sizes.push(end)
    foreground += end
  }
  if (!foreground) return null
  const keep = new Uint8Array(sizes.length)
  let kept = 0
  let parts = 0
  for (let id = 1; id < sizes.length; id++) {
    if (sizes[id] >= foreground * SIGNIFICANT_PART_SHARE) { keep[id] = 1; kept += sizes[id]; parts++ }
  }
  if (!parts || parts > MAX_SIGNIFICANT_PARTS) return null
  if ((foreground - kept) / foreground > MAX_SPECK_SHARE) return null

  // 3. Holes: background removed with garment both above and below it (same
  //    column) and both left and right of it (same row) means the fill leaked
  //    into the garment (light prints or fabric). Concave outlines such as a
  //    waist above a wide skirt, the gap between trouser legs or the area under
  //    a sleeve are open on one side and are not counted.
  const colTop = new Int32Array(w).fill(-1)
  const colBottom = new Int32Array(w).fill(-1)
  const rowLeft = new Int32Array(h).fill(-1)
  const rowRight = new Int32Array(h).fill(-1)
  for (let i = 0; i < total; i++) {
    if (!keep[label[i]]) continue
    const x = i % w
    const y = (i / w) | 0
    if (colTop[x] < 0) colTop[x] = y
    colBottom[x] = y
    if (rowLeft[y] < 0) rowLeft[y] = x
    rowRight[y] = x
  }
  let enclosed = 0
  for (let i = 0; i < total; i++) {
    if (!background[i]) continue
    const x = i % w
    const y = (i / w) | 0
    if (y > colTop[x] && y < colBottom[x] && x > rowLeft[y] && x < rowRight[y]) enclosed++
  }
  if (enclosed / kept > MAX_ENCLOSED_BACKGROUND_SHARE) return null

  // 4. Make background and loose specks transparent; measure the kept garment
  //    and each kept part (a pair of shoes has two parts).
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  const partBoxes = new Map()
  for (let i = 0; i < total; i++) {
    const id = label[i]
    if (!keep[id]) { data[i * 4 + 3] = 0; continue }
    const x = i % w
    const y = (i / w) | 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    const part = partBoxes.get(id)
    if (!part) partBoxes.set(id, { maxX: x, maxY: y, minX: x, minY: y, size: sizes[id] })
    else {
      if (x < part.minX) part.minX = x
      if (x > part.maxX) part.maxX = x
      if (y > part.maxY) part.maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  const partList = [...partBoxes.values()].sort((a, b) => a.minX - b.minX)
  return { maxX, maxY, minX, minY, parts: partList }
}

const MIN_SHOE_SIZE_RATIO = 0.5 // the smaller shoe must be at least half the larger
const MIN_SHOE_HEIGHT_RATIO = 0.6

/**
 * Returns [left, right] part boxes when a cut-out pair of shoes can be split
 * reliably into two shoes side by side, otherwise null (the pair is then not
 * drawn on the mannequin).
 */
export function splitShoePair(parts) {
  if (!Array.isArray(parts) || parts.length !== 2) return null
  const [left, right] = [...parts].sort((a, b) => a.minX - b.minX)
  if (left.maxX >= right.minX) return null
  const sizeRatio = Math.min(left.size, right.size) / Math.max(left.size, right.size)
  const leftHeight = left.maxY - left.minY + 1
  const rightHeight = right.maxY - right.minY + 1
  const heightRatio = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight)
  if (sizeRatio < MIN_SHOE_SIZE_RATIO || heightRatio < MIN_SHOE_HEIGHT_RATIO) return null
  return [left, right]
}

// --- Shoes on a light or plain background (white sneakers included) ---
// The general cutout removes every light pixel connected to the border, which
// also removes white shoes. Shoes instead keep every pixel that differs from the
// measured background colour (sole, outline, laces, shadow), close small gaps and
// fill each shoe's inside, so a white upper inside a visible outline is kept.

const SHOE_BORDER_MAX_SPREAD = 28 // border must be one plain colour
const SHOE_MIN_DIFF = 14
const SHOE_CLOSE_RADIUS = 2
const SHOE_MIN_SOLIDITY = 0.45 // shoe area / its bounding box
const SHOE_MIN_ASPECT = 0.35 // shoes seen from the front are tall and narrow
const SHOE_MAX_ASPECT = 4.5
const SHOE_MIN_SHARE = 0.01 // a shoe must cover at least 1% of the picture
const SHOE_MAX_SHARE = 0.6
const SHOE_SPLIT_MAX_VALLEY = 0.45 // touching shoes (toe to toe) split at a column this thin
// Shoes seen from the front touch along the soles. They are still split when the
// thin column is clearly lower than both shoes and starts well below both tops.
const SHOE_SPLIT_MAX_TOUCHING_VALLEY = 0.65
const SHOE_SPLIT_MIN_TOP_GAP = 0.15 // share of the pair's height
const SHOE_SHADOW_MAX_STEP = 6 // a soft shadow changes at most this much per pixel
const SHOE_SHADOW_MAX_DIFF = 60

function median(values) {
  const sorted = Float64Array.from(values).sort()
  return sorted[sorted.length >> 1]
}

function grow(mask, w, h, radius, value) {
  // Square dilation (value 1) or erosion (value 0), done as two 1-D passes.
  const total = w * h
  const tmp = new Uint8Array(total)
  const out = new Uint8Array(total)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = value === 1 ? 0 : 1
      for (let d = -radius; d <= radius; d++) {
        const xx = x + d
        const v = xx < 0 || xx >= w ? 0 : mask[y * w + xx]
        if (value === 1 && v) { hit = 1; break }
        if (value === 0 && !v) { hit = 0; break }
      }
      tmp[y * w + x] = hit
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = value === 1 ? 0 : 1
      for (let d = -radius; d <= radius; d++) {
        const yy = y + d
        const v = yy < 0 || yy >= h ? 0 : tmp[yy * w + x]
        if (value === 1 && v) { hit = 1; break }
        if (value === 0 && !v) { hit = 0; break }
      }
      out[y * w + x] = hit
    }
  }
  return out
}

function fillHoles(mask, w, h) {
  // Everything not reachable from the border through empty pixels is inside.
  const total = w * h
  const outside = new Uint8Array(total)
  const queue = new Int32Array(total)
  let end = 0
  for (let i = 0; i < total; i++) {
    const x = i % w
    const y = (i / w) | 0
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && !mask[i]) { outside[i] = 1; queue[end] = i; end += 1 }
  }
  const neighbours = new Int32Array(4)
  for (let head = 0; head < end; head++) {
    const i = queue[head]
    const x = i % w
    let count = 0
    if (x > 0) { neighbours[count] = i - 1; count += 1 }
    if (x + 1 < w) { neighbours[count] = i + 1; count += 1 }
    if (i >= w) { neighbours[count] = i - w; count += 1 }
    if (i + w < total) { neighbours[count] = i + w; count += 1 }
    for (let k = 0; k < count; k++) {
      const n = neighbours[k]
      if (!outside[n] && !mask[n]) { outside[n] = 1; queue[end] = n; end += 1 }
    }
  }
  const filled = new Uint8Array(total)
  for (let i = 0; i < total; i++) filled[i] = outside[i] ? 0 : 1
  return filled
}

function components(mask, w, h) {
  const total = w * h
  const label = new Int32Array(total)
  const queue = new Int32Array(total)
  const neighbours = new Int32Array(4)
  const boxes = []
  for (let start = 0; start < total; start++) {
    if (!mask[start] || label[start]) continue
    const id = boxes.length + 1
    const box = { id, minX: w, minY: h, maxX: -1, maxY: -1, size: 0 }
    label[start] = id
    queue[0] = start
    let end = 1
    for (let head = 0; head < end; head++) {
      const i = queue[head]
      const x = i % w
      const y = (i / w) | 0
      box.size += 1
      if (x < box.minX) box.minX = x
      if (x > box.maxX) box.maxX = x
      if (y < box.minY) box.minY = y
      if (y > box.maxY) box.maxY = y
      let count = 0
      if (x > 0) { neighbours[count] = i - 1; count += 1 }
      if (x + 1 < w) { neighbours[count] = i + 1; count += 1 }
      if (i >= w) { neighbours[count] = i - w; count += 1 }
      if (i + w < total) { neighbours[count] = i + w; count += 1 }
      for (let k = 0; k < count; k++) {
        const n = neighbours[k]
        if (mask[n] && !label[n]) { label[n] = id; queue[end] = n; end += 1 }
      }
    }
    boxes.push(box)
  }
  return { boxes, label }
}

function boxOf(mask, w, minX, maxX, minY, maxY, keepLabel, label) {
  const box = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1, size: 0 }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * w + x
      if (!mask[i] || (keepLabel && label[i] !== keepLabel)) continue
      box.size += 1
      if (x < box.minX) box.minX = x
      if (x > box.maxX) box.maxX = x
      if (y < box.minY) box.minY = y
      if (y > box.maxY) box.maxY = y
    }
  }
  return box.size ? box : null
}

function smoothBackground(data, w, h, bg) {
  // Background reachable from the border through small steps only. Product
  // photos often have a soft grey shadow under and beside the shoes; it darkens
  // gradually, while a shoe's outline is a sharp edge, so the shadow is found
  // here and not mistaken for shoe.
  const total = w * h
  const seen = new Uint8Array(total)
  const queue = new Int32Array(total)
  const near = (i) => {
    const p = i * 4
    return data[p + 3] !== 0 && Math.max(Math.abs(data[p] - bg[0]), Math.abs(data[p + 1] - bg[1]), Math.abs(data[p + 2] - bg[2])) <= SHOE_SHADOW_MAX_DIFF
  }
  const step = (i, j) => Math.max(
    Math.abs(data[i * 4] - data[j * 4]),
    Math.abs(data[i * 4 + 1] - data[j * 4 + 1]),
    Math.abs(data[i * 4 + 2] - data[j * 4 + 2]),
  )
  let end = 0
  for (let i = 0; i < total; i++) {
    const x = i % w
    const y = (i / w) | 0
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && near(i)) { seen[i] = 1; queue[end] = i; end += 1 }
  }
  const neighbours = new Int32Array(4)
  for (let head = 0; head < end; head++) {
    const i = queue[head]
    const x = i % w
    let count = 0
    if (x > 0) { neighbours[count] = i - 1; count += 1 }
    if (x + 1 < w) { neighbours[count] = i + 1; count += 1 }
    if (i >= w) { neighbours[count] = i - w; count += 1 }
    if (i + w < total) { neighbours[count] = i + w; count += 1 }
    for (let k = 0; k < count; k++) {
      const n = neighbours[k]
      if (!seen[n] && step(i, n) <= SHOE_SHADOW_MAX_STEP && near(n)) { seen[n] = 1; queue[end] = n; end += 1 }
    }
  }
  return seen
}

function plausibleShoe(box, total) {
  const bw = box.maxX - box.minX + 1
  const bh = box.maxY - box.minY + 1
  const aspect = bw / bh
  return box.size >= total * SHOE_MIN_SHARE && box.size <= total * SHOE_MAX_SHARE &&
    box.size / (bw * bh) >= SHOE_MIN_SOLIDITY && aspect >= SHOE_MIN_ASPECT && aspect <= SHOE_MAX_ASPECT
}

/**
 * Cuts a pair of shoes out of a plain background, in place. Returns
 * { parts: [left, right] } with each shoe's box, or null when the picture
 * cannot be split into two clean, solid shoes. Nothing is drawn on the
 * mannequin for null, so no background boxes ever cover the doll.
 */
export function cutoutShoePair(data, w, h) {
  const total = w * h
  if (w < 8 || h < 8) return null
  const rs = []
  const gs = []
  const bs = []
  for (let i = 0; i < total; i++) {
    const x = i % w
    const y = (i / w) | 0
    if (x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1) continue
    rs.push(data[i * 4]); gs.push(data[i * 4 + 1]); bs.push(data[i * 4 + 2])
  }
  const bg = [median(rs), median(gs), median(bs)]
  // The border must be one plain colour: most border pixels close to the median.
  let plain = 0
  for (let k = 0; k < rs.length; k++) {
    const d = Math.max(Math.abs(rs[k] - bg[0]), Math.abs(gs[k] - bg[1]), Math.abs(bs[k] - bg[2]))
    if (d <= SHOE_BORDER_MAX_SPREAD) plain++
  }
  if (plain / rs.length < 0.9) return null

  const shadow = smoothBackground(data, w, h, bg)
  const diff = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    const p = i * 4
    const d = Math.max(Math.abs(data[p] - bg[0]), Math.abs(data[p + 1] - bg[1]), Math.abs(data[p + 2] - bg[2]))
    diff[i] = data[p + 3] !== 0 && d > SHOE_MIN_DIFF && !shadow[i] ? 1 : 0
  }
  // Close small gaps in the outline, then fill each shoe's inside.
  const closed = grow(grow(diff, w, h, SHOE_CLOSE_RADIUS, 1), w, h, SHOE_CLOSE_RADIUS, 0)
  const mask = fillHoles(closed, w, h)

  const { boxes, label } = components(mask, w, h)
  const big = boxes.filter((box) => box.size >= total * SHOE_MIN_SHARE).sort((a, b) => b.size - a.size)
  let pair = null
  if (big.length >= 2) {
    pair = [big[0], big[1]].sort((a, b) => a.minX - b.minX)
  } else if (big.length === 1) {
    // Two touching shoes: split at the thinnest column in the middle part.
    const one = big[0]
    const widthOne = one.maxX - one.minX + 1
    const columns = new Int32Array(widthOne)
    const tops = new Int32Array(widthOne).fill(h)
    for (let y = one.minY; y <= one.maxY; y++) {
      for (let x = one.minX; x <= one.maxX; x++) {
        if (label[y * w + x] !== one.id) continue
        columns[x - one.minX] += 1
        if (y < tops[x - one.minX]) tops[x - one.minX] = y
      }
    }
    let peak = 0
    for (let k = 0; k < widthOne; k++) if (columns[k] > peak) peak = columns[k]
    let cut = -1
    let low = Infinity
    for (let k = Math.floor(widthOne * 0.35); k <= Math.ceil(widthOne * 0.65) && k < widthOne; k++) {
      if (columns[k] < low) { low = columns[k]; cut = k }
    }
    let touching = false
    if (cut > 0 && low <= peak * SHOE_SPLIT_MAX_TOUCHING_VALLEY) {
      // Two shoes side by side: a column clearly lower than the shoes on both
      // sides, whose top lies well below the tops of both shoes.
      let leftPeak = 0
      let rightPeak = 0
      let leftTop = h
      let rightTop = h
      for (let k = 0; k < cut; k++) { leftPeak = Math.max(leftPeak, columns[k]); leftTop = Math.min(leftTop, tops[k]) }
      for (let k = cut + 1; k < widthOne; k++) { rightPeak = Math.max(rightPeak, columns[k]); rightTop = Math.min(rightTop, tops[k]) }
      const gap = (one.maxY - one.minY + 1) * SHOE_SPLIT_MIN_TOP_GAP
      touching = low <= Math.min(leftPeak, rightPeak) * SHOE_SPLIT_MAX_TOUCHING_VALLEY &&
        tops[cut] - leftTop >= gap && tops[cut] - rightTop >= gap
    }
    if (cut > 0 && (low <= peak * SHOE_SPLIT_MAX_VALLEY || touching)) {
      const left = boxOf(mask, w, one.minX, one.minX + cut - 1, one.minY, one.maxY, one.id, label)
      const right = boxOf(mask, w, one.minX + cut + 1, one.maxX, one.minY, one.maxY, one.id, label)
      if (left && right) pair = [left, right]
      for (let y = one.minY; y <= one.maxY; y++) label[y * w + one.minX + cut] = 0
    }
  }
  if (!pair || !pair.every((box) => plausibleShoe(box, total))) return null
  const split = splitShoePair(pair)
  if (!split) return null

  // Keep only the two shoes; everything else becomes transparent.
  for (let i = 0; i < total; i++) {
    const x = i % w
    const y = (i / w) | 0
    const inShoe = mask[i] && label[i] !== 0 && split.some((box) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY)
    if (!inShoe) data[i * 4 + 3] = 0
  }
  return { parts: split }
}
