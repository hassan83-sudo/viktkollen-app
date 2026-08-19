const measuredSourcePatterns = [
  /manuell/i,
  /manual/i,
  /våg/i,
  /vag/i,
  /scale/i,
  /importerad/i,
  /import/i,
  /check-?in/i,
  /annat/i,
]

const aiEstimatedSourcePatterns = [
  /ai/i,
  /uppskatt/i,
  /estimat/i,
  /estimated/i,
  /kroppsanalys/i,
  /body\s*analysis/i,
  /body\s*scan/i,
  /scanner/i,
]

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('sv-SE')
}

function collectSignalText(entry = {}) {
  return [
    entry.source,
    entry.provenance,
    entry.origin,
    entry.kind,
    entry.type,
    entry.dataSource,
    entry.sourceType,
    entry.weightType,
    entry.note,
  ]
    .filter(Boolean)
    .map(normalizeText)
    .join(' ')
}

export function getWeightEntryProvenance(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return { kind: 'missing', source: '', reason: 'invalid-entry' }
  }

  const signalText = collectSignalText(entry)
  const hasEstimatedFields =
    hasOwn(entry, 'estimatedWeight') ||
    hasOwn(entry, 'estimatedWeightKg') ||
    hasOwn(entry, 'estimatedMeasurements') ||
    entry.isEstimated === true ||
    entry.aiEstimated === true

  if (hasEstimatedFields || aiEstimatedSourcePatterns.some((pattern) => pattern.test(signalText))) {
    return {
      kind: 'ai_estimated',
      source: String(entry.source || entry.provenance || 'AI-estimat'),
      reason: hasEstimatedFields ? 'estimated-fields' : 'source-marker',
    }
  }

  if (signalText && measuredSourcePatterns.some((pattern) => pattern.test(signalText))) {
    return {
      kind: signalText.includes('import') ? 'derived' : 'measured',
      source: String(entry.source || 'Manuell'),
      reason: 'measured-source',
    }
  }

  return {
    kind: 'user_entered',
    source: String(entry.source || 'Manuell'),
    reason: 'default-user-entry',
  }
}

export function isMeasuredWeightEntry(entry = {}) {
  const provenance = getWeightEntryProvenance(entry)

  return ['measured', 'user_entered', 'derived'].includes(provenance.kind)
}

function normalizeEstimatedWeight(value) {
  if (!value || typeof value !== 'object') return null

  const minKg = Number(value.minKg)
  const maxKg = Number(value.maxKg)
  const midpointKg = Number(value.midpointKg ?? ((minKg + maxKg) / 2))

  if (!Number.isFinite(minKg) || !Number.isFinite(maxKg) || minKg <= 0 || maxKg <= 0 || minKg > maxKg) {
    return null
  }

  return {
    confidence: ['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'low',
    maxKg,
    midpointKg: Number.isFinite(midpointKg) ? Number(midpointKg.toFixed(1)) : Number(((minKg + maxKg) / 2).toFixed(1)),
    minKg,
    provenance: 'ai_estimated',
  }
}

export function getLatestBodyScanEstimatedWeight(bodyAnalysisHistory = []) {
  const history = Array.isArray(bodyAnalysisHistory) ? bodyAnalysisHistory : []

  for (const entry of history) {
    const estimatedWeight = normalizeEstimatedWeight(entry?.result?.estimatedWeight || entry?.estimatedWeight)

    if (estimatedWeight) {
      return {
        ...estimatedWeight,
        date: entry?.createdAt || entry?.date || null,
        source: 'body_analysis',
      }
    }
  }

  return null
}

export function buildWeightProvenanceSummary({ bodyAnalysisHistory = [], weights = [] } = {}) {
  const entries = Array.isArray(weights) ? weights : []
  const counts = entries.reduce((summary, entry) => {
    const kind = getWeightEntryProvenance(entry).kind

    return {
      ...summary,
      [kind]: (summary[kind] || 0) + 1,
    }
  }, {})
  const aiEstimatedCount = counts.ai_estimated || 0
  const measuredCount =
    (counts.measured || 0) +
    (counts.user_entered || 0) +
    (counts.derived || 0)
  const latestBodyScanEstimate = getLatestBodyScanEstimatedWeight(bodyAnalysisHistory)

  return {
    aiEstimatedCount,
    excludedFromMeasuredSeriesCount: aiEstimatedCount,
    latestBodyScanEstimate,
    measuredCount,
    status: measuredCount > 0 ? 'measured' : latestBodyScanEstimate ? 'ai_estimated_only' : 'missing',
  }
}
