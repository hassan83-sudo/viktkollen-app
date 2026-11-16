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

  // 3. Holes: background removed between the garment's top and bottom in a column
  //    means the fill leaked into the garment (light stripes, prints or fabric).
  let enclosed = 0
  for (let x = 0; x < w; x++) {
    let top = -1
    let bottom = -1
    for (let y = 0; y < h; y++) {
      if (keep[label[y * w + x]]) { if (top < 0) top = y; bottom = y }
    }
    for (let y = top + 1; top >= 0 && y < bottom; y++) {
      if (background[y * w + x]) enclosed++
    }
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
