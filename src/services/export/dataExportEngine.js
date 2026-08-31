import { createStableChecksum, getApproximatePayloadSize, normalizeCloudBackupPayload } from '../cloudBackupSchema.js'
import { readStorage } from '../appStorageService.js'
import { parseDataImportText } from '../import/dataImportEngine.js'
import { buildImportPlan } from '../import/importPlanBuilder.js'
import { normalizeProfile } from '../profileService.js'
import { userDataKeys } from '../userDataRepository.js'
import { buildCheckInsCsv, buildMealsCsv, buildWeightCsv } from './csvExport.js'
import {
  dataExportSchemaVersion,
  exportExcludedFields,
  findExportSectionById,
  getDefaultExportSectionIds,
  getExportStorageKeys,
  getExportableSections,
  isBlockedExportField,
  maxExportArrayItems,
  maxExportPayloadBytes,
  maxExportTextLength,
} from './exportSchema.js'
import { exportMimeTypes, sanitizeExportFilename } from './downloadService.js'
import { sanitizeMediaPayload } from '../security/mediaSafeguard.js'

export const exportFormats = Object.freeze([
  'viktkollenBackup',
  'jsonSelected',
  'csvMeals',
  'csvWeight',
  'csvCheckIns',
  'textSummary',
])

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString()
}

function stableExportId({ exportDate, format, selectedSections }) {
  const seed = `${format}|${exportDate}|${selectedSections.join(',')}`
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `export-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasSensitiveString(value) {
  const text = String(value || '')
  return /data:image|base64,|blob:|access_token|refresh_token|supabase|service_role|api[_-]?key/i.test(text)
}

function sanitizeValue(value, excludedFields, depth = 0) {
  if (depth > 12) {
    excludedFields.add('För djupt nästlade data')
    return null
  }

  if (typeof value === 'string') {
    if (hasSensitiveString(value)) {
      excludedFields.add('Känslig text eller bildreferens')
      return ''
    }
    return value.slice(0, maxExportTextLength)
  }

  if (value === null || value === undefined || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    if (value.length > maxExportArrayItems) excludedFields.add('Begränsad historikarray')
    return value.slice(0, maxExportArrayItems).map((item) => sanitizeValue(item, excludedFields, depth + 1))
  }

  if (!isObject(value)) return null

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => {
      const blocked = isBlockedExportField(key) || ['__proto__', 'constructor', 'prototype'].includes(key)
      if (blocked) excludedFields.add(key)
      return !blocked
    })
    .map(([key, entry]) => [key, sanitizeValue(entry, excludedFields, depth + 1)])
    .filter(([, entry]) => entry !== undefined))
}

function readExportData(storageKeys, currentData = {}) {
  return storageKeys.reduce((data, key) => {
    if (Object.prototype.hasOwnProperty.call(currentData, key)) {
      return { ...data, [key]: currentData[key] }
    }

    const value = readStorage(key, null)
    return value === null || value === undefined ? data : { ...data, [key]: value }
  }, {})
}

function normalizeExportStorageValue(storageKey, value) {
  if (storageKey === userDataKeys.profile) {
    return normalizeProfile(value)
  }

  return value
}

function sectionSummary(section, data) {
  const itemCount = section.storageKeys.reduce((sum, key) => {
    const value = data[key]
    if (Array.isArray(value)) return sum + value.length
    if (isObject(value)) return sum + Object.keys(value).length
    return value === undefined || value === null ? sum : sum + 1
  }, 0)

  return {
    dependencies: section.dependencies,
    empty: itemCount === 0,
    id: section.id,
    label: section.label,
    recordCount: itemCount,
    storageKeyCount: section.storageKeys.filter((key) => data[key] !== undefined).length,
  }
}

function buildBackupPayload({ appVersion = '0.0.0', data, exportDate, exportId, format, selectedSections, sectionSummaries }) {
  const storageKeys = Object.keys(data).sort()
  const sectionVersions = Object.fromEntries(selectedSections.map((sectionId) => [sectionId, dataExportSchemaVersion]))
  const basePayload = {
    app: 'Viktkollen',
    appVersion,
    exportedAt: exportDate,
    exportId,
    format: format === 'jsonSelected' ? 'viktkollen-selected-export' : 'viktkollen-backup',
    metadata: {
      excludedFields: exportExcludedFields,
      recordCount: sectionSummaries.reduce((sum, section) => sum + section.recordCount, 0),
      sectionCount: sectionSummaries.length,
      sectionSummaries,
      selectedSections,
      sizeBytes: 0,
      storageKeyCount: storageKeys.length,
      storageKeys,
    },
    schemaVersion: dataExportSchemaVersion,
    sectionVersions,
    selectedSections,
    userData: data,
  }
  const sizeBytes = getApproximatePayloadSize(basePayload)

  return {
    ...basePayload,
    checksum: createStableChecksum({
      schemaVersion: basePayload.schemaVersion,
      userData: basePayload.userData,
    }),
    integrity: {
      checksumKind: 'stable-non-cryptographic',
      sectionChecksums: Object.fromEntries(storageKeys.map((key) => [key, createStableChecksum(data[key])])),
      totalEstimatedSizeBytes: sizeBytes,
    },
    metadata: {
      ...basePayload.metadata,
      sizeBytes,
    },
  }
}

function createTextSummary(draftData, sectionSummaries, exportDate) {
  const lines = [
    'Viktkollen dataexport',
    `Datum: ${exportDate}`,
    `Sektioner: ${sectionSummaries.length}`,
    `Poster: ${sectionSummaries.reduce((sum, section) => sum + section.recordCount, 0)}`,
    '',
    'Innehåll',
    ...sectionSummaries.map((section) => `- ${section.label}: ${section.recordCount} poster`),
    '',
    'Ingår aldrig',
    ...exportExcludedFields.map((field) => `- ${field}`),
  ]

  return `${lines.join('\n')}\n`
}

function buildCsvPayload(format, data, csvOptions) {
  if (format === 'csvMeals') return buildMealsCsv(data['viktkollen.meals'] || [], csvOptions)
  if (format === 'csvWeight') return buildWeightCsv(data['viktkollen.weights'] || [], csvOptions)
  if (format === 'csvCheckIns') return buildCheckInsCsv(data['viktkollen.checkIn'] || {}, csvOptions)
  return ''
}

export function verifyExportDraft(draft) {
  if (!draft?.payloadText) return { errors: ['Exporten saknar payload.'], status: 'invalid', warnings: [] }

  if (draft.format.startsWith('csv')) {
    const parsed = parseDataImportText({
      file: { name: draft.filename, size: draft.estimatedSize, type: 'text/csv' },
      importDate: draft.exportDate,
      text: draft.payloadText,
    })
    return {
      errors: parsed.errors,
      importSession: parsed,
      status: parsed.errors.length ? 'invalid' : parsed.warnings.length ? 'verifiedWithWarnings' : 'verified',
      warnings: parsed.warnings,
    }
  }

  if (draft.format === 'textSummary') {
    return { errors: [], status: 'verified', warnings: ['Textsamanfattning är inte ett importformat.'] }
  }

  let parsedPayload
  try {
    parsedPayload = JSON.parse(draft.payloadText)
  } catch {
    return { errors: ['Exportens JSON kunde inte tolkas.'], status: 'invalid', warnings: [] }
  }

  const normalized = normalizeCloudBackupPayload(parsedPayload)
  if (!normalized) return { errors: ['Backupen kunde inte verifieras.'], status: 'invalid', warnings: [] }

  const parsed = parseDataImportText({
    file: { name: draft.filename, size: draft.estimatedSize, type: 'application/json' },
    importDate: draft.exportDate,
    text: draft.payloadText,
  })
  const plan = buildImportPlan(parsed, {
    currentData: normalized.userData,
    selectedSections: parsed.sections.map((section) => section.id),
  })

  return {
    errors: parsed.errors,
    importPlan: plan,
    importSession: parsed,
    status: parsed.errors.length ? 'invalid' : parsed.warnings.length ? 'verifiedWithWarnings' : 'verified',
    warnings: parsed.warnings,
  }
}

export function buildDataExportDraft(options = {}) {
  const exportDate = nowIso(options.exportDate || new Date())
  const format = exportFormats.includes(options.format) ? options.format : 'viktkollenBackup'
  const selectedSections = options.selectedSections?.length ? options.selectedSections : getDefaultExportSectionIds()
  const sections = getExportableSections().filter((section) => selectedSections.includes(section.id))
  const storageKeys = format === 'csvMeals'
    ? ['viktkollen.meals']
    : format === 'csvWeight'
      ? ['viktkollen.weights']
      : format === 'csvCheckIns'
        ? ['viktkollen.checkIn']
        : getExportStorageKeys(selectedSections)
  const rawData = readExportData(storageKeys, options.currentData || {})
  const excludedFields = new Set(exportExcludedFields)
  const sanitizedData = Object.fromEntries(Object.entries(rawData)
    .map(([key, value]) => [key, sanitizeMediaPayload(sanitizeValue(normalizeExportStorageValue(key, value), excludedFields))])
    .filter(([, value]) => value !== undefined && value !== null))
  const selectedSectionSummaries = sections.map((section) => sectionSummary(section, sanitizedData))
  const csvSection = findExportSectionById(
    format === 'csvMeals' ? 'meals' : format === 'csvWeight' ? 'weightLog' : format === 'csvCheckIns' ? 'checkIns' : '',
  )
  const sectionSummaries = format.startsWith('csv') && csvSection
    ? [sectionSummary(csvSection, sanitizedData)]
    : selectedSectionSummaries
  const exportId = stableExportId({ exportDate, format, selectedSections })
  const payload = format.startsWith('csv')
    ? buildCsvPayload(format, sanitizedData, options.csvOptions || {})
    : format === 'textSummary'
      ? createTextSummary(sanitizedData, sectionSummaries, exportDate)
      : JSON.stringify(buildBackupPayload({
        appVersion: options.appVersion || '0.0.0',
        data: sanitizedData,
        exportDate,
        exportId,
        format,
        sectionSummaries,
        selectedSections,
      }), null, 2)
  const mimeType = format.startsWith('csv')
    ? exportMimeTypes.csv
    : format === 'textSummary'
      ? exportMimeTypes.text
      : exportMimeTypes.json
  const extension = format.startsWith('csv') ? 'csv' : format === 'textSummary' ? 'txt' : 'json'
  const estimatedSize = getApproximatePayloadSize(payload)
  const validationErrors = estimatedSize > maxExportPayloadBytes ? ['Exporten är för stor för säker nedladdning.'] : []
  const draft = {
    createdAt: exportDate,
    estimatedSize,
    excludedFields: [...excludedFields],
    exportDate,
    exportId,
    filename: sanitizeExportFilename(`viktkollen-${format}-${exportDate.slice(0, 10)}`, extension),
    format,
    mimeType,
    payloadText: payload,
    recordCounts: Object.fromEntries(sectionSummaries.map((section) => [section.id, section.recordCount])),
    schemaVersion: dataExportSchemaVersion,
    sectionSummaries,
    selectedSections,
    status: validationErrors.length ? 'validationFailed' : 'previewReady',
    validation: {
      errors: validationErrors,
      ok: validationErrors.length === 0,
      verification: null,
    },
    warnings: sectionSummaries
      .filter((section) => section.empty)
      .map((section) => `${section.label} saknar data.`),
  }
  const verification = draft.validation.ok ? verifyExportDraft(draft) : { errors: validationErrors, status: 'invalid', warnings: [] }

  return {
    ...draft,
    status: verification.status === 'invalid' ? 'validationFailed' : 'confirmationRequired',
    validation: {
      ...draft.validation,
      errors: [...draft.validation.errors, ...verification.errors],
      ok: verification.status !== 'invalid' && draft.validation.ok,
      verification,
    },
    warnings: [...draft.warnings, ...verification.warnings],
  }
}

export const dataExportEngineInternals = {
  buildBackupPayload,
  createTextSummary,
  hasSensitiveString,
  readExportData,
  sanitizeValue,
  sectionSummary,
  stableExportId,
}
