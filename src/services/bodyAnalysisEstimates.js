export const bodyAnalysisSchemaVersion = 2
export const bodyAnalysisConfidenceLevels = ['low', 'medium', 'high']
export const bodyMeasurementEstimateKeys = ['waistCm', 'hipCm', 'chestCm', 'shoulderWidthCm']

const swedishConfidenceLabels = {
  high: 'Hög',
  low: 'Låg',
  medium: 'Medel',
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundOne(value) {
  return Math.round(value * 10) / 10
}

export function normalizeConfidence(value, fallback = 'low') {
  const normalized = String(value || '').trim().toLowerCase()
  const fromSwedish = normalized === 'låg'
    ? 'low'
    : normalized === 'medel'
      ? 'medium'
      : normalized === 'hög'
        ? 'high'
        : normalized

  return bodyAnalysisConfidenceLevels.includes(fromSwedish) ? fromSwedish : fallback
}

export function getConfidenceLabel(value) {
  return swedishConfidenceLabels[normalizeConfidence(value)] || swedishConfidenceLabels.low
}

export function normalizeRangeEstimate(value, {
  max = 300,
  min = 1,
  minWidth = 0.5,
} = {}) {
  if (!isObject(value)) return null

  const minValue = numberOrNull(value.minKg ?? value.min)
  const maxValue = numberOrNull(value.maxKg ?? value.max)
  if (minValue === null || maxValue === null) return null
  if (minValue < min || maxValue > max || maxValue <= minValue) return null
  if (maxValue - minValue < minWidth) return null

  return {
    confidence: normalizeConfidence(value.confidence),
    max: roundOne(maxValue),
    min: roundOne(minValue),
  }
}

export function normalizeEstimatedWeight(value) {
  const range = normalizeRangeEstimate(value, { max: 350, min: 25, minWidth: 2 })
  if (!range) return null

  const midpoint = numberOrNull(value.midpointKg)
  const safeMidpoint = midpoint !== null && midpoint > range.min && midpoint < range.max
    ? midpoint
    : (range.min + range.max) / 2

  return {
    basis: String(value.basis || 'AI-uppskattning från bilder och profilkontext.').replace(/\s+/g, ' ').trim().slice(0, 180),
    confidence: range.confidence,
    maxKg: range.max,
    midpointKg: roundOne(safeMidpoint),
    minKg: range.min,
  }
}

export function normalizeMeasurementEstimate(value) {
  const range = normalizeRangeEstimate(value, { max: 240, min: 20, minWidth: 1 })
  if (!range) return null

  return {
    confidence: range.confidence,
    max: range.max,
    min: range.min,
  }
}

export function normalizeEstimatedMeasurements(value) {
  if (!isObject(value)) {
    return bodyMeasurementEstimateKeys.reduce((result, key) => ({ ...result, [key]: null }), {})
  }

  return bodyMeasurementEstimateKeys.reduce((result, key) => ({
    ...result,
    [key]: normalizeMeasurementEstimate(value[key]),
  }), {})
}

export function normalizeBodyFatEstimate(value) {
  const range = normalizeRangeEstimate(value, { max: 70, min: 3, minWidth: 3 })
  if (!range) return null

  return {
    basis: String(value.basis || 'Försiktig visuell indikator, inte en kroppsfettmätning.').replace(/\s+/g, ' ').trim().slice(0, 180),
    confidence: normalizeConfidence(value.confidence, 'low') === 'high' ? 'medium' : normalizeConfidence(value.confidence, 'low'),
    maxPercent: range.max,
    minPercent: range.min,
  }
}

export function normalizeScanInput(value = {}) {
  const source = isObject(value) ? value : {}
  const angles = Array.isArray(source.angles)
    ? source.angles.filter((angle) => ['front', 'side', 'back'].includes(angle))
    : ['front', 'side', 'back']

  return {
    angles: [...new Set(angles)],
    imageCount: Math.max(0, Math.min(3, Number(source.imageCount) || angles.length || 0)),
    requiredAngles: ['front', 'side', 'back'],
  }
}

export function getScanInputLabel(scanInput) {
  const normalized = normalizeScanInput(scanInput)
  return `${normalized.imageCount} bilder / ${normalized.requiredAngles.length} vinklar`
}

export function getLatestMeasuredWeight(weights = []) {
  const latest = [...weights]
    .filter((entry) => Number.isFinite(Number(entry?.value ?? entry?.weight)) && typeof entry?.date === 'string')
    .sort((first, second) => `${second.date}T${second.time || '00:00'}`.localeCompare(`${first.date}T${first.time || '00:00'}`))[0]

  if (!latest) return null

  return {
    date: latest.date,
    source: latest.source || 'Registrerad vikt',
    valueKg: roundOne(Number(latest.value ?? latest.weight)),
  }
}

export function normalizeMeasuredWeight(value) {
  if (!isObject(value)) return null

  const valueKg = numberOrNull(value.valueKg ?? value.value ?? value.weight)
  if (valueKg === null || valueKg < 25 || valueKg > 350) return null

  return {
    date: typeof value.date === 'string' ? value.date.slice(0, 20) : '',
    source: String(value.source || 'Registrerad vikt').replace(/\s+/g, ' ').trim().slice(0, 80),
    valueKg: roundOne(valueKg),
  }
}

export function buildBodyAnalysisContext({ bodyAnalysisHistory = [], profile = {}, weights = [] } = {}) {
  const latestMeasuredWeight = getLatestMeasuredWeight(weights)

  return {
    latestMeasuredWeight,
    previousScans: bodyAnalysisHistory
      .slice(0, 3)
      .map((entry) => ({
        createdAt: entry.createdAt,
        estimatedMeasurements: entry.result?.estimatedMeasurements || null,
        estimatedWeight: entry.result?.estimatedWeight || null,
        scanInput: entry.result?.scanInput || entry.scanInput || null,
        summary: entry.result?.summary || '',
      })),
    profile: {
      age: Number.isFinite(Number(profile.age)) ? Number(profile.age) : null,
      gender: typeof profile.gender === 'string' ? profile.gender : '',
      height: Number.isFinite(Number(profile.height)) ? Number(profile.height) : null,
    },
  }
}

export function normalizeBodyAnalysisResultModel(value = {}, {
  generatedAt = new Date().toISOString(),
  scanInput = normalizeScanInput(),
} = {}) {
  return {
    bodyComposition: value.bodyComposition || '',
    bodyFatEstimate: normalizeBodyFatEstimate(value.bodyFatEstimate),
    confidence: normalizeConfidence(value.confidence || value.confidenceLevel, 'low'),
    confidenceLevel: getConfidenceLabel(value.confidence || value.confidenceLevel),
    dataQuality: normalizeConfidence(value.dataQuality || value.confidence || value.confidenceLevel, 'low'),
    estimatedMeasurements: normalizeEstimatedMeasurements(value.estimatedMeasurements),
    estimatedWeight: normalizeEstimatedWeight(value.estimatedWeight),
    generatedAt: value.generatedAt || generatedAt,
    measuredWeight: normalizeMeasuredWeight(value.measuredWeight),
    scanInput: normalizeScanInput(value.scanInput || scanInput),
    schemaVersion: bodyAnalysisSchemaVersion,
  }
}
