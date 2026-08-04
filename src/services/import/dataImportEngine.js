import { writeStorageResult } from '../appStorageService.js'
import { getApproximatePayloadSize } from '../cloudBackupSchema.js'
import { markSyncKeyDirty } from '../sync/syncMetadata.js'
import { createSyncRestoreSnapshot, rollbackSyncRestoreSnapshot } from '../sync/syncRestoreSafety.js'
import { detectImportFormat } from './importFormatDetector.js'
import { buildImportPlan } from './importPlanBuilder.js'
import { migrateCsvToSections, migrateJsonTextToSections } from './importMigrations.js'

export const maxImportFileBytes = 5 * 1024 * 1024

let activeApplyId = ''

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString()
}

function stableImportId({ fileMetadata = {}, importDate }) {
  const seed = `${fileMetadata.name || 'import'}|${fileMetadata.size || 0}|${fileMetadata.type || ''}|${importDate}`
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `import-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function validateImportFileMetadata(file = {}) {
  const name = String(file.name || '')
  const type = String(file.type || '')
  const size = Number(file.size) || 0
  const extension = name.split('.').pop()?.toLocaleLowerCase('sv-SE') || ''
  const allowedExtensions = ['json', 'csv', 'tsv', 'txt']
  const allowedMime = ['', 'application/json', 'text/json', 'text/csv', 'text/plain', 'application/vnd.ms-excel']
  const errors = []

  if (!size) errors.push('Filen är tom.')
  if (size > maxImportFileBytes) errors.push('Filen är för stor för säker import.')
  if (!allowedExtensions.includes(extension)) errors.push('Filändelsen stöds inte.')
  const allowedMimeType = !type || allowedMime.some((mime) => mime && (type === mime || type.includes(mime)))
  if (!allowedMimeType) errors.push('Filtypen stöds inte.')

  return {
    errors,
    metadata: { extension, name: name.slice(0, 160), size, type: type.slice(0, 120) },
    ok: errors.length === 0,
  }
}

function buildSummary(sections = []) {
  return {
    invalidCount: sections.reduce((sum, section) => sum + (section.validation?.invalidItems?.length || 0), 0),
    sectionCount: sections.length,
    totalItems: sections.reduce((sum, section) => sum + (section.itemCount || 0), 0),
    validCount: sections.reduce((sum, section) => sum + (section.validation?.validCount ?? section.itemCount ?? 0), 0),
  }
}

export function createImportSession({ fileMetadata = {}, format, importDate, sections = [], warnings = [], errors = [] }) {
  const safeImportDate = nowIso(importDate)
  const importId = stableImportId({ fileMetadata, importDate: safeImportDate })
  const session = {
    createdAt: safeImportDate,
    detectedFormat: format.detectedFormat,
    errors,
    fileMetadata,
    importId,
    mergePlan: null,
    preview: {
      sections: sections.map((section) => ({
        id: section.id,
        itemCount: section.itemCount,
        key: section.key,
        label: section.label,
        source: section.source,
      })),
    },
    sections,
    sourceType: format.sourceType,
    sourceVersion: null,
    status: errors.length ? 'invalid' : 'previewReady',
    summary: buildSummary(sections),
    warnings,
  }

  return session
}

export function parseDataImportText({ file = {}, importDate = new Date(), text = '' } = {}) {
  const fileValidation = validateImportFileMetadata(file)
  if (!fileValidation.ok) {
    return createImportSession({
      errors: fileValidation.errors,
      fileMetadata: fileValidation.metadata,
      format: { detectedFormat: 'invalidFile', sourceType: 'unknown' },
      importDate,
      sections: [],
      warnings: [],
    })
  }

  const format = detectImportFormat({
    fileName: fileValidation.metadata.name,
    mimeType: fileValidation.metadata.type,
    text,
  })
  if (format.errors?.length) {
    return createImportSession({
      errors: format.errors,
      fileMetadata: fileValidation.metadata,
      format,
      importDate,
      sections: [],
      warnings: [],
    })
  }

  const migrated = format.sourceType.startsWith('csv')
    ? migrateCsvToSections(text, format.sourceType, { importDate: nowIso(importDate) })
    : migrateJsonTextToSections(text)

  return createImportSession({
    errors: migrated.errors || [],
    fileMetadata: fileValidation.metadata,
    format,
    importDate,
    sections: migrated.sections || [],
    warnings: migrated.warnings || [],
  })
}

function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function writeValue(storage, key, value) {
  if (!storage) return writeStorageResult(key, value)

  try {
    storage.setItem(key, JSON.stringify(value))
    markSyncKeyDirty(key, storage)
    return { ok: true, reason: '' }
  } catch {
    return { ok: false, reason: 'Datadelen kunde inte skrivas lokalt.' }
  }
}

export function applyImportPlan(importSession, plan, options = {}) {
  const storage = getStorage(options.storage)
  const importId = importSession?.importId || plan?.importId || ''
  const currentUserId = options.currentUserId || ''

  if (!plan?.okToApply) {
    return { failedKeys: [], ok: false, reason: 'Importplanen är inte redo att appliceras.', restored: false, status: 'failed', writtenKeys: [] }
  }

  if (activeApplyId) {
    return { failedKeys: [], ok: false, reason: 'En import körs redan.', restored: false, status: 'failed', writtenKeys: [] }
  }

  if (options.expectedUserId && currentUserId && options.expectedUserId !== currentUserId) {
    return { failedKeys: [], ok: false, reason: 'Användaren ändrades innan importen kunde genomföras.', restored: false, status: 'failed', writtenKeys: [] }
  }

  activeApplyId = importId || 'active-import'
  const keys = plan.sectionPlans.filter((sectionPlan) => sectionPlan.estimatedWrites > 0).map((sectionPlan) => sectionPlan.key)
  const snapshot = createSyncRestoreSnapshot(storage, keys, {
    now: options.now || new Date(),
    reason: `data-import:${importId}`,
  })
  const writtenKeys = []
  const failedKeys = []

  try {
    for (const sectionPlan of plan.sectionPlans) {
      if (sectionPlan.estimatedWrites <= 0) continue
      const result = writeValue(storage, sectionPlan.key, sectionPlan.nextValue)
      if (!result.ok) {
        failedKeys.push(sectionPlan.key)
        throw new Error(result.reason || 'Datadelen kunde inte skrivas.')
      }
      writtenKeys.push(sectionPlan.key)
    }

    return {
      failedKeys,
      importId,
      ok: true,
      reason: 'Importen slutfördes.',
      restored: false,
      snapshotId: snapshot.id,
      status: 'completed',
      summary: {
        addedCount: plan.additions,
        estimatedSizeBytes: getApproximatePayloadSize(Object.fromEntries(plan.sectionPlans.map((sectionPlan) => [sectionPlan.key, sectionPlan.nextValue]))),
        updatedCount: plan.updates,
        writtenKeys: writtenKeys.length,
      },
      writtenKeys,
    }
  } catch {
    const restored = rollbackSyncRestoreSnapshot(snapshot, storage)
    return {
      failedKeys,
      importId,
      ok: false,
      reason: restored
        ? 'Importen misslyckades och lokala data återställdes.'
        : 'Importen misslyckades och rollback behöver kontrolleras manuellt.',
      restored,
      safeErrorId: `import-error-${Date.now().toString(36)}`,
      status: restored ? 'rolledBack' : 'failed',
      writtenKeys,
    }
  } finally {
    activeApplyId = ''
  }
}

export function buildPreviewImportPlan(importSession, options = {}) {
  const plan = buildImportPlan(importSession, options)
  return {
    ...importSession,
    mergePlan: plan,
    status: plan.okToApply ? 'confirmationRequired' : 'previewReady',
  }
}

export const dataImportEngineInternals = {
  buildSummary,
  getStorage,
  stableImportId,
  writeValue,
}
