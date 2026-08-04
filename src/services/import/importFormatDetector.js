import { normalizeCloudBackupPayload } from '../cloudBackupSchema.js'
import { parseCsv } from './csvParser.js'
import { safeParseJson } from './safeJsonParser.js'

const sourceTypes = Object.freeze({
  csvCheckIns: 'csvCheckIns',
  csvGeneric: 'csvGeneric',
  csvMeals: 'csvMeals',
  csvWeight: 'csvWeight',
  unknown: 'unknown',
  viktkollenBackup: 'viktkollenBackup',
  viktkollenLegacy: 'viktkollenLegacy',
})

function normalizeExtension(fileName = '') {
  return String(fileName).split('.').pop()?.toLocaleLowerCase('sv-SE') || ''
}

function hasAny(headers, candidates) {
  return candidates.some((candidate) => headers.includes(candidate))
}

function detectCsvKind(csv) {
  const headers = csv.headers || []
  if (hasAny(headers, ['vikt', 'weight', 'kg'])) return sourceTypes.csvWeight
  if (hasAny(headers, ['måltid', 'maltid', 'meal', 'mat', 'namn', 'name']) && hasAny(headers, ['kalorier', 'calories', 'protein', 'datum', 'date'])) {
    return sourceTypes.csvMeals
  }
  if (hasAny(headers, ['energi', 'energy', 'humör', 'humor', 'mood', 'steg', 'steps'])) return sourceTypes.csvCheckIns
  return sourceTypes.csvGeneric
}

export function detectImportFormat({ fileName = '', mimeType = '', text = '' } = {}) {
  const extension = normalizeExtension(fileName)
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim()

  if (!trimmed) {
    return { confidence: 1, detectedFormat: 'invalidFile', errors: ['Filen är tom.'], sourceType: sourceTypes.unknown }
  }

  if (extension === 'json' || mimeType.includes('json') || /^[{[]/.test(trimmed)) {
    const parsed = safeParseJson(trimmed)
    if (!parsed.ok) {
      return { confidence: 0.9, detectedFormat: 'invalidJson', errors: [parsed.reason], sourceType: sourceTypes.unknown }
    }

    if (parsed.value?.version === 1 && parsed.value?.data) {
      return { confidence: 1, detectedFormat: 'viktkollen-legacy-v1', errors: [], sourceType: sourceTypes.viktkollenLegacy }
    }

    const backup = normalizeCloudBackupPayload(parsed.value)
    if (backup?.schemaVersion === 2) {
      return { confidence: 1, detectedFormat: 'viktkollen-backup-v2', errors: [], sourceType: sourceTypes.viktkollenBackup }
    }

    if (parsed.value?.format === 'viktkollen-nutrition' || parsed.value?.format === 'viktkollen-progress') {
      return { confidence: 0.95, detectedFormat: parsed.value.format, errors: [], sourceType: sourceTypes.viktkollenLegacy }
    }

    return { confidence: 0.35, detectedFormat: 'unknown-json', errors: [], sourceType: sourceTypes.unknown }
  }

  if (['csv', 'tsv', 'txt'].includes(extension) || mimeType.includes('csv') || mimeType.includes('text')) {
    const csv = parseCsv(trimmed)
    if (!csv.ok) {
      return { confidence: 0.8, detectedFormat: 'invalidCsv', errors: csv.errors, sourceType: sourceTypes.unknown }
    }

    const csvType = detectCsvKind(csv)
    return {
      confidence: csvType === sourceTypes.csvGeneric ? 0.45 : 0.9,
      detectedFormat: csvType,
      errors: [],
      sourceType: csvType,
    }
  }

  return { confidence: 0, detectedFormat: 'unknown', errors: ['Filtypen stöds inte.'], sourceType: sourceTypes.unknown }
}

export { sourceTypes }

export const importFormatDetectorInternals = {
  detectCsvKind,
  normalizeExtension,
}
