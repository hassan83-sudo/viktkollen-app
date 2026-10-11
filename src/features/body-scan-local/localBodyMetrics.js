// Rena beräkningar för lokal kroppsscanning. Inga bilder sparas här –
// funktionerna tar emot landmärken/mask i minnet och returnerar endast
// enhetslösa proportioner (kvoter mot kroppslängd i bild).
//
// Proportionerna är INTE centimeter, kroppsfett eller vikt.

import { localModelVersionTag } from './localBodyScanConfig.js'

const L = Object.freeze({
  leftAnkle: 27,
  leftEar: 7,
  leftHip: 23,
  leftKnee: 25,
  leftShoulder: 11,
  leftWrist: 15,
  nose: 0,
  rightAnkle: 28,
  rightEar: 8,
  rightHip: 24,
  rightKnee: 26,
  rightShoulder: 12,
  rightWrist: 16,
})

const requiredLandmarks = [L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip, L.leftAnkle, L.rightAnkle]
const minVisibility = 0.65

export const qualityIssueMessages = Object.freeze({
  'arms-close': 'Armarna ligger för nära kroppen, så konturen kunde inte mätas.',
  'arms-side': 'Lägg händerna på huvudet i sidovyn så att konturen kan mätas.',
  'missing-landmarks': 'Hela kroppen syntes inte tydligt (axlar, höfter och fötter krävs).',
  'no-contour': 'Kroppens kontur kunde inte avgränsas tillförlitligt.',
  'no-person': 'Ingen person hittades i bilden.',
  'not-standing': 'Stå upprätt med raka ben – sittande, knästående eller böjda knän kan inte mätas.',
  'not-full-body': 'Hela kroppen, från huvud till fötter, måste synas i bild.',
  tilted: 'Kameran eller kroppen lutar för mycket. Håll mobilen rakt.',
  'wide-stance': 'Stå med fötterna ungefär höftbrett isär så att höftens kontur kan mätas.',
  'too-bright': 'Bilden är för ljus/överexponerad.',
  'too-close': 'Du står för nära kameran.',
  'too-dark': 'Bilden är för mörk. Tänd mer ljus.',
  'too-far': 'Du står för långt från kameran.',
  'wrong-orientation': 'Kroppen var inte vänd som vyn kräver (framifrån, från sidan eller bakifrån).',
})

// Alla problem blockerar: en vy räknas bara som godkänd när minst ett
// konturmått finns, annars ger den ingen information om förändring.
const blockingIssues = new Set([
  'arms-close',
  'arms-side',
  'missing-landmarks',
  'no-contour',
  'wide-stance',
  'no-person',
  'not-standing',
  'not-full-body',
  'tilted',
  'too-bright',
  'too-close',
  'too-dark',
  'too-far',
  'wrong-orientation',
])

export const contourMetricKeys = Object.freeze({
  back: ['chest', 'waist', 'hip', 'waistToHip'],
  front: ['chest', 'waist', 'hip', 'waistToHip'],
  side: ['chestDepth', 'waistDepth', 'hipDepth'],
})

export const landmarkMetricKeys = Object.freeze({
  back: ['shoulderWidth', 'hipWidth', 'shoulderToHip'],
  front: ['shoulderWidth', 'hipWidth', 'shoulderToHip'],
  side: [],
})

export const metricLabels = Object.freeze({
  chest: 'Bröstkorgens kontur',
  chestDepth: 'Bröstkorgens djup',
  hip: 'Höftens kontur',
  hipDepth: 'Höftens djup',
  hipWidth: 'Höftbredd (leder)',
  shoulderToHip: 'Axel/höft-proportion',
  shoulderWidth: 'Axelbredd (leder)',
  waist: 'Midjans kontur',
  waistDepth: 'Midjans djup',
  waistToHip: 'Midja/höft-proportion',
})

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function toPixels(landmarks, width, height) {
  return landmarks.map((point) => ({
    v: Number.isFinite(point?.visibility) ? point.visibility : 0,
    x: (Number(point?.x) || 0) * width,
    y: (Number(point?.y) || 0) * height,
  }))
}

// Silhuettens bredd längs en horisontell rad, räknat från kroppens mittlinje.
export function measureMaskRun(mask, rowNorm, centerXNorm, threshold = 0.5) {
  if (!mask?.data || !mask.width || !mask.height) return null
  const row = Math.round(rowNorm * (mask.height - 1))
  const center = Math.round(centerXNorm * (mask.width - 1))
  if (row < 0 || row >= mask.height || center < 0 || center >= mask.width) return null
  const offset = row * mask.width
  if (!(mask.data[offset + center] >= threshold)) return null
  let left = center
  while (left > 0 && mask.data[offset + left - 1] >= threshold) left -= 1
  let right = center
  while (right < mask.width - 1 && mask.data[offset + right + 1] >= threshold) right += 1
  // Når silhuetten bildkanten är bredden okänd.
  if (left === 0 || right === mask.width - 1) return null
  return (right - left + 1) / mask.width
}

function measureBand(mask, yPx, centerPx, height, width, refPx) {
  const samples = []
  for (const step of [-2, -1, 0, 1, 2]) {
    const y = (yPx + step * 0.01 * refPx) / height
    const run = measureMaskRun(mask, y, centerPx / width)
    if (run !== null) samples.push(run * width)
  }
  return samples.length >= 3 ? median(samples) : null
}

function sanitizeContour(value, refPx) {
  if (!Number.isFinite(value) || !refPx) return null
  const ratio = value / refPx
  return ratio >= 0.05 && ratio <= 0.5 ? ratio : null
}

/**
 * Beräknar kvalitet, förhållanden och proportioner för en vy.
 * @param {{view: 'front'|'side'|'back', landmarks: object[], mask?: object, imageWidth: number, imageHeight: number, luminance?: number}} input
 */
export function computeViewMetrics({ imageHeight, imageWidth, landmarks, luminance = null, mask = null, view }) {
  const issues = []
  const result = (metrics = null, conditions = null) => ({
    conditions,
    metrics,
    quality: { issues, ok: !issues.some((issue) => blockingIssues.has(issue)) },
    view,
  })

  if (!Array.isArray(landmarks) || landmarks.length < 29 || !imageWidth || !imageHeight) {
    issues.push('no-person')
    return result()
  }

  const p = toPixels(landmarks, imageWidth, imageHeight)
  if (requiredLandmarks.some((index) => p[index].v < minVisibility)) {
    issues.push('missing-landmarks')
    return result()
  }

  const shoulderMid = midpoint(p[L.leftShoulder], p[L.rightShoulder])
  const hipMid = midpoint(p[L.leftHip], p[L.rightHip])
  const ankleMid = midpoint(p[L.leftAnkle], p[L.rightAnkle])
  const kneeMid = midpoint(p[L.leftKnee], p[L.rightKnee])
  const refPx = distance(shoulderMid, ankleMid)
  const topY = Math.min(p[L.nose].y, p[L.leftEar].y, p[L.rightEar].y)
  const bottomY = Math.max(p[L.leftAnkle].y, p[L.rightAnkle].y)

  if (!refPx) {
    issues.push('no-person')
    return result()
  }

  const bodyFraction = (bottomY - topY) / imageHeight
  const roll = Math.abs(Math.atan2(ankleMid.x - shoulderMid.x, ankleMid.y - shoulderMid.y) * 180 / Math.PI)
  const conditions = {
    bodyFraction: round(bodyFraction),
    luminance: Number.isFinite(luminance) ? round(luminance, 1) : null,
    roll: round(roll, 2),
  }

  if (topY < 0.01 * imageHeight || bottomY > 0.99 * imageHeight) issues.push('not-full-body')
  if (bodyFraction < 0.45) issues.push('too-far')
  if (bodyFraction > 0.97) issues.push('too-close')
  if (roll > 8) issues.push('tilted')

  // Personen måste stå upprätt: raka knän och ben som är längre än bålen.
  // (Modellen gissar annars fram en hel pose även för sittande personer.)
  const kneeAngle = (hip, knee, ankle) => {
    const a = Math.atan2(hip.y - knee.y, hip.x - knee.x)
    const b = Math.atan2(ankle.y - knee.y, ankle.x - knee.x)
    const angle = Math.abs((a - b) * 180 / Math.PI)
    return angle > 180 ? 360 - angle : angle
  }
  const torsoLength = hipMid.y - shoulderMid.y
  const legRatio = torsoLength > 0 ? (ankleMid.y - hipMid.y) / torsoLength : 0
  const kneesStraight = kneeAngle(p[L.leftHip], p[L.leftKnee], p[L.leftAnkle]) >= 150
    && kneeAngle(p[L.rightHip], p[L.rightKnee], p[L.rightAnkle]) >= 150
  if (!kneesStraight || legRatio < 1.2) issues.push('not-standing')
  if (Number.isFinite(luminance) && luminance < 50) issues.push('too-dark')
  if (Number.isFinite(luminance) && luminance > 225) issues.push('too-bright')

  const shoulderWidth = distance(p[L.leftShoulder], p[L.rightShoulder]) / refPx
  const hipWidth = distance(p[L.leftHip], p[L.rightHip]) / refPx
  const isSide = view === 'side'
  // Framifrån syns personens vänstra axel/höft till höger i bilden, bakifrån
  // till vänster (kamerans råbild, aldrig spegelvänd). Båda paren måste stämma.
  // Verifierat mot riktiga fram- och bakvyer; näsans synlighet är opålitlig.
  const facesCamera = p[L.leftShoulder].x > p[L.rightShoulder].x && p[L.leftHip].x > p[L.rightHip].x
  const facesAway = p[L.leftShoulder].x < p[L.rightShoulder].x && p[L.leftHip].x < p[L.rightHip].x
  const orientationOk = isSide
    ? shoulderWidth <= 0.14
    : shoulderWidth >= 0.17 && (view === 'back' ? facesAway : facesCamera)
  if (!orientationOk) issues.push('wrong-orientation')

  const metrics = {}
  if (!isSide) {
    metrics.shoulderWidth = round(shoulderWidth)
    metrics.hipWidth = round(hipWidth)
    metrics.shoulderToHip = hipWidth > 0 ? round(shoulderWidth / hipWidth) : null
  }

  // Kontur från silhuettmasken.
  const torsoHeight = hipMid.y - shoulderMid.y
  const rows = {
    chest: shoulderMid.y + 0.25 * torsoHeight,
    hip: hipMid.y + 0.1 * (kneeMid.y - hipMid.y),
    waist: shoulderMid.y + 0.65 * torsoHeight,
  }
  const centerAt = (y) => {
    const t = torsoHeight ? (y - shoulderMid.y) / torsoHeight : 0
    return shoulderMid.x + t * (hipMid.x - shoulderMid.x)
  }

  let contourBlocked = false
  if (isSide) {
    const wristsUp = [L.leftWrist, L.rightWrist]
      .filter((index) => p[index].v >= minVisibility)
      .every((index) => p[index].y < shoulderMid.y)
    if (!wristsUp) {
      issues.push('arms-side')
      contourBlocked = true
    }
  } else {
    const hipHalf = Math.abs(p[L.leftHip].x - p[L.rightHip].x) / 2
    const wristsOut = [L.leftWrist, L.rightWrist]
      .filter((index) => p[index].v >= minVisibility)
      .every((index) => Math.abs(p[index].x - hipMid.x) > hipHalf + 0.09 * refPx)
    if (!wristsOut) {
      issues.push('arms-close')
      contourBlocked = true
    }
  }

  // Brett isärställda ben smälter ihop med höftens kontur.
  const ankleSpread = Math.abs(p[L.leftAnkle].x - p[L.rightAnkle].x)
  const hipJointSpread = Math.abs(p[L.leftHip].x - p[L.rightHip].x)
  if (!isSide && ankleSpread > Math.max(2.2 * hipJointSpread, 0.25 * refPx)) {
    issues.push('wide-stance')
    contourBlocked = true
  }

  // En hand nära en mätrad gör den raden opålitlig (händer smälter ihop med
  // silhuetten). Handledens position används oavsett synlighet, eftersom
  // händerna ofta är dolda bakom kroppen i bakvyn.
  const wrists = [p[L.leftWrist], p[L.rightWrist]]
  const handNearRow = (y, widthPx, centerPx) => wrists.some((wrist) =>
    Math.abs(wrist.y - y) < 0.1 * refPx
    && Math.abs(wrist.x - centerPx) < widthPx / 2 + 0.06 * refPx)

  const contour = {}
  if (!contourBlocked && mask) {
    for (const [key, y] of Object.entries(rows)) {
      const center = centerAt(y)
      const widthPx = measureBand(mask, y, center, imageHeight, imageWidth, refPx)
      contour[key] = widthPx !== null && !handNearRow(y, widthPx, center) ? sanitizeContour(widthPx, refPx) : null
    }
  }

  if (isSide) {
    metrics.chestDepth = round(contour.chest ?? null)
    metrics.waistDepth = round(contour.waist ?? null)
    metrics.hipDepth = round(contour.hip ?? null)
  } else {
    metrics.chest = round(contour.chest ?? null)
    metrics.waist = round(contour.waist ?? null)
    metrics.hip = round(contour.hip ?? null)
    metrics.waistToHip = contour.waist && contour.hip ? round(contour.waist / contour.hip) : null
  }

  if (!contourBlocked && contourMetricKeys[view]?.every((key) => metrics[key] === null)) {
    issues.push('no-contour')
  }

  return result(metrics, conditions)
}

// ---------------------------------------------------------------------------
// Jämförelse mot tidigare GODKÄNDA analysvärden (inga bilder).
// ---------------------------------------------------------------------------

// Trösklarna är försiktiga. Ledpunkternas brus mättes mot riktiga bilder
// (samma bild spegelvänd: höftleder ±12 %, axlar ±4 %), därför används
// skelettmått bara som kontroll av att förutsättningarna är lika – skelettet
// ändras inte med vikt – och endast silhuettens kontur tolkas som möjlig
// förändring.
export const comparisonThresholds = Object.freeze({
  maxBodyFractionDiff: 0.08,
  maxLuminanceDiff: 45,
  maxRollDiff: 4,
  maxSkeletonDiff: 0.06,
  possibleClear: 0.1,
  stable: 0.05,
  unreliable: 0.2,
})

export const changeLabels = Object.freeze({
  'possible-clear': 'möjlig tydligare förändring',
  'possible-small': 'möjlig liten förändring',
  stable: 'ingen tydlig förändring',
  unreliable: 'kan inte bedömas',
})

function classifyChange(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) return null
  const relative = (current - previous) / previous
  const size = Math.abs(relative)
  let level = 'stable'
  if (size > comparisonThresholds.unreliable) level = 'unreliable'
  else if (size >= comparisonThresholds.possibleClear) level = 'possible-clear'
  else if (size >= comparisonThresholds.stable) level = 'possible-small'
  return {
    direction: level === 'stable' || level === 'unreliable' ? 'none' : relative < 0 ? 'smaller' : 'larger',
    level,
  }
}

function relativeDiff(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) return null
  return Math.abs(current - previous) / previous
}

function conditionMismatch(previous = {}, current = {}) {
  const reasons = []
  if (!Number.isFinite(previous.bodyFraction) || !Number.isFinite(current.bodyFraction)
    || Math.abs(previous.bodyFraction - current.bodyFraction) > comparisonThresholds.maxBodyFractionDiff) {
    reasons.push('Avståndet till kameran skiljer sig för mycket från förra gången.')
  }
  if (!Number.isFinite(previous.roll) || !Number.isFinite(current.roll)
    || Math.abs(previous.roll - current.roll) > comparisonThresholds.maxRollDiff) {
    reasons.push('Vinkeln/hållningen skiljer sig för mycket från förra gången.')
  }
  if (Number.isFinite(previous.luminance) && Number.isFinite(current.luminance)
    && Math.abs(previous.luminance - current.luminance) > comparisonThresholds.maxLuminanceDiff) {
    reasons.push('Ljuset skiljer sig för mycket från förra gången.')
  }
  return reasons
}

/**
 * @param {object|null} previousRecord sparad post (endast värden)
 * @param {Record<string, ReturnType<typeof computeViewMetrics>>} currentResults
 */
export function compareWithPrevious(previousRecord, currentResults) {
  if (!previousRecord?.views) {
    return { reasons: ['Det finns inga tidigare godkända analysvärden att jämföra med.'], status: 'no-baseline', views: {} }
  }
  if (previousRecord.modelVersion !== localModelVersionTag) {
    return { reasons: ['Förra analysen gjordes med en annan modellversion.'], status: 'not-assessable', views: {} }
  }

  const views = {}
  const reasons = []
  for (const [viewId, current] of Object.entries(currentResults || {})) {
    const previous = previousRecord.views[viewId]
    if (!previous || !current?.quality?.ok || !current.metrics) continue
    const mismatch = conditionMismatch(previous.conditions, current.conditions)
    if (mismatch.length) {
      views[viewId] = { reasons: mismatch, reliable: false }
      reasons.push(...mismatch)
      continue
    }
    const skeletonDrift = relativeDiff(previous.metrics?.shoulderWidth, current.metrics?.shoulderWidth)
    if (skeletonDrift !== null && skeletonDrift > comparisonThresholds.maxSkeletonDiff) {
      const reason = 'Kroppens ställning eller kamerans vinkel skiljer sig från förra gången (skelettmåtten stämmer inte överens).'
      views[viewId] = { reasons: [reason], reliable: false }
      reasons.push(reason)
      continue
    }
    const changes = {}
    for (const key of contourMetricKeys[viewId] || []) {
      const change = classifyChange(previous.metrics?.[key], current.metrics?.[key])
      if (change) changes[key] = change
    }
    if (!Object.keys(changes).length) {
      views[viewId] = { reasons: ['Kroppens kontur kunde inte mätas i båda scanningarna.'], reliable: false }
      continue
    }
    const usable = Object.values(changes).filter((change) => change.level !== 'unreliable')
    if (!usable.length) {
      views[viewId] = { reasons: ['För stora skillnader för att vara pålitliga – troligen olika förutsättningar.'], reliable: false }
      continue
    }
    views[viewId] = { changes, reliable: true }
  }

  const reliableViews = Object.values(views).filter((view) => view.reliable)
  if (!reliableViews.length) {
    return {
      reasons: reasons.length ? [...new Set(reasons)] : ['Ingen vy kunde jämföras på ett tillförlitligt sätt.'],
      status: 'not-assessable',
      views,
    }
  }
  return { reasons: [...new Set(reasons)], status: 'compared', views }
}

export function describeChange(key, change) {
  if (!change) return ''
  const label = metricLabels[key] || key
  if (change.level === 'stable') return `${label}: ingen tydlig förändring.`
  if (change.level === 'unreliable') return `${label}: kan inte bedömas (för stor skillnad).`
  const isRatio = key === 'shoulderToHip' || key === 'waistToHip'
  const direction = isRatio
    ? (change.direction === 'smaller' ? 'lägre' : 'högre')
    : (change.direction === 'smaller' ? 'smalare' : 'bredare')
  const strength = change.level === 'possible-clear' ? 'möjligen' : 'möjligen något'
  return isRatio
    ? `${label}: ${strength} ${direction} än förra gången.`
    : `${label}: ${strength} ${direction} i förhållande till kroppslängden.`
}

// ---------------------------------------------------------------------------
// Verklig viktförändring – endast från användarens registrerade vikt.
// ---------------------------------------------------------------------------

function parseWeightEntry(entry) {
  const raw = entry?.date || entry?.localDate || entry?.createdAt
  const date = raw ? new Date(raw) : null
  const kg = Number(entry?.value ?? entry?.weight ?? entry?.valueKg ?? entry?.kg)
  if (!date || Number.isNaN(date.getTime()) || !Number.isFinite(kg) || kg <= 0) return null
  return { date, kg }
}

function closestEntry(entries, target, windowDays) {
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  let best = null
  for (const entry of entries) {
    const diff = Math.abs(entry.date.getTime() - target.getTime())
    if (diff <= windowMs && (!best || diff < best.diff)) best = { ...entry, diff }
  }
  return best
}

export function getLatestRegisteredWeight(weights) {
  const entries = (Array.isArray(weights) ? weights : []).map(parseWeightEntry).filter(Boolean)
  if (!entries.length) return null
  const latest = entries.reduce((best, entry) => (entry.date > best.date ? entry : best))
  return { date: latest.date.toISOString(), kg: latest.kg }
}

export function getRegisteredWeightChange(weights, fromDate, toDate = new Date(), windowDays = 10) {
  const entries = (Array.isArray(weights) ? weights : []).map(parseWeightEntry).filter(Boolean)
  const from = fromDate ? closestEntry(entries, new Date(fromDate), windowDays) : null
  const to = closestEntry(entries, new Date(toDate), windowDays)
  if (!from || !to || from.date.getTime() === to.date.getTime()) return null
  return {
    changeKg: round(to.kg - from.kg, 1),
    from: { date: from.date.toISOString(), kg: from.kg },
    to: { date: to.date.toISOString(), kg: to.kg },
  }
}

// ---------------------------------------------------------------------------
// Minimal post att spara efter användarens godkännande.
// ---------------------------------------------------------------------------

export function buildSavableRecord(results, now = new Date()) {
  const views = {}
  for (const [viewId, result] of Object.entries(results || {})) {
    if (!result?.quality?.ok || !result.metrics) continue
    const metrics = {}
    for (const key of [...(landmarkMetricKeys[viewId] || []), ...(contourMetricKeys[viewId] || [])]) {
      metrics[key] = Number.isFinite(result.metrics[key]) ? round(result.metrics[key]) : null
    }
    views[viewId] = {
      conditions: {
        bodyFraction: result.conditions?.bodyFraction ?? null,
        luminance: result.conditions?.luminance ?? null,
        roll: result.conditions?.roll ?? null,
      },
      metrics,
    }
  }
  if (!Object.keys(views).length) return null
  return {
    createdAt: now.toISOString(),
    id: `local-${now.getTime().toString(36)}`,
    modelVersion: localModelVersionTag,
    views,
  }
}
