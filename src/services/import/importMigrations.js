import { normalizeCloudBackupPayload } from '../cloudBackupSchema.js'
import { normalizeMeals } from '../nutritionService.js'
import { normalizeWeights } from '../progressService.js'
import { normalizeProfile } from '../profileService.js'
import { isAllowedSyncStorageKey } from '../sync/syncMetadata.js'
import { getBackupStorageKeys, userDataKeys } from '../userDataRepository.js'
import { parseCsv } from './csvParser.js'
import { safeParseJson } from './safeJsonParser.js'

const headerAliases = {
  calories: ['calories', 'kalorier', 'kcal'],
  carbohydrates: ['carbohydrates', 'kolhydrater', 'carbs'],
  date: ['date', 'datum', 'dag'],
  energy: ['energy', 'energi'],
  fat: ['fat', 'fett'],
  mood: ['mood', 'humör', 'humor'],
  name: ['name', 'namn', 'måltid', 'maltid', 'meal', 'mat'],
  note: ['note', 'anteckning', 'kommentar'],
  protein: ['protein'],
  source: ['source', 'källa', 'kalla'],
  steps: ['steps', 'steg'],
  time: ['time', 'tid'],
  type: ['type', 'typ'],
  weight: ['weight', 'vikt', 'kg'],
}

function firstValue(values, aliases) {
  const key = aliases.find((alias) => values[alias] !== undefined)
  return key ? values[key] : ''
}

function parseNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

function normalizeDate(value, fallbackDate) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }
  return fallbackDate
}

function makeGeneratedId(prefix, row, importDate) {
  return `${prefix}-${importDate.slice(0, 10)}-${row.index}`
}

function normalizeImportedStorageValue(storageKey, value) {
  if (storageKey === userDataKeys.profile) {
    return normalizeProfile(value)
  }

  return value
}

export function migrateBackupPayloadToSections(payload) {
  const backup = normalizeCloudBackupPayload(payload)
  if (!backup) {
    return { errors: ['Backupen har ett format som inte stöds.'], sections: [], warnings: [] }
  }

  const allowed = new Set(getBackupStorageKeys().filter(isAllowedSyncStorageKey))
  const sections = Object.entries(backup.userData || {})
    .filter(([storageKey]) => allowed.has(storageKey))
    .map(([storageKey, value]) => ({
      id: storageKey,
      itemCount: Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 1,
      key: storageKey,
      label: storageKey.replace('viktkollen.', ''),
      source: backup.metadata?.migratedFromSchemaVersion ? 'legacyBackup' : 'backup',
      value: normalizeImportedStorageValue(storageKey, value),
    }))

  return {
    errors: sections.length ? [] : ['Backupen saknar importerbara datadelar.'],
    sections,
    sourceVersion: backup.schemaVersion,
    warnings: backup.metadata?.migratedFromSchemaVersion ? ['Backupen migrerades från ett äldre Viktkollen-format.'] : [],
  }
}

export function migrateCsvToSections(text, sourceType, options = {}) {
  const csv = parseCsv(text)
  if (!csv.ok) return { errors: csv.errors, sections: [], warnings: csv.warnings || [] }

  const importDate = options.importDate || new Date().toISOString()
  const fallbackDate = importDate.slice(0, 10)
  const rows = csv.rows.filter((row) => !row.duplicate)

  if (sourceType === 'csvWeight') {
    const weights = normalizeWeights(rows.map((row) => ({
      date: normalizeDate(firstValue(row.values, headerAliases.date), fallbackDate),
      id: makeGeneratedId('import-weight', row, importDate),
      note: firstValue(row.values, headerAliases.note),
      source: firstValue(row.values, headerAliases.source) || 'Importerad',
      time: firstValue(row.values, headerAliases.time),
      value: parseNumber(firstValue(row.values, headerAliases.weight)),
    })).filter((item) => Number.isFinite(item.value)))

    return {
      errors: weights.length ? [] : ['CSV-filen saknar giltiga viktvärden.'],
      sections: [{
        id: userDataKeys.weights,
        itemCount: weights.length,
        key: userDataKeys.weights,
        label: 'Vikter',
        source: 'csv',
        value: weights,
      }],
      warnings: csv.warnings,
    }
  }

  if (sourceType === 'csvMeals') {
    const meals = normalizeMeals(rows.map((row) => ({
      calories: parseNumber(firstValue(row.values, headerAliases.calories)) ?? 0,
      carbohydrates: parseNumber(firstValue(row.values, headerAliases.carbohydrates)) ?? 0,
      date: normalizeDate(firstValue(row.values, headerAliases.date), fallbackDate),
      fat: parseNumber(firstValue(row.values, headerAliases.fat)) ?? 0,
      id: makeGeneratedId('import-meal', row, importDate),
      protein: parseNumber(firstValue(row.values, headerAliases.protein)) ?? 0,
      source: 'Importerad',
      text: firstValue(row.values, headerAliases.name),
      time: firstValue(row.values, headerAliases.time),
      type: firstValue(row.values, headerAliases.type) || 'Måltid',
    })).filter((item) => item.text))

    return {
      errors: meals.length ? [] : ['CSV-filen saknar giltiga måltider.'],
      sections: [{
        id: userDataKeys.meals,
        itemCount: meals.length,
        key: userDataKeys.meals,
        label: 'Måltider',
        source: 'csv',
        value: meals,
      }],
      warnings: csv.warnings,
    }
  }

  if (sourceType === 'csvCheckIns') {
    const checkIns = rows.map((row) => ({
      date: normalizeDate(firstValue(row.values, headerAliases.date), fallbackDate),
      energy: parseNumber(firstValue(row.values, headerAliases.energy)),
      id: makeGeneratedId('import-checkin', row, importDate),
      mood: firstValue(row.values, headerAliases.mood),
      steps: parseNumber(firstValue(row.values, headerAliases.steps)),
    }))

    return {
      errors: checkIns.length ? [] : ['CSV-filen saknar giltiga check-ins.'],
      sections: [{
        id: userDataKeys.checkIn,
        itemCount: checkIns.length,
        key: userDataKeys.checkIn,
        label: 'Check-ins',
        source: 'csv',
        value: checkIns.at(-1) || {},
      }],
      warnings: [
        ...csv.warnings,
        ...(checkIns.length > 1 ? ['Check-in-lagringen stödjer dagens aktuella check-in. Senaste CSV-raden används i V2.'] : []),
      ],
    }
  }

  return { errors: ['CSV-formatet behöver väljas manuellt innan import.'], sections: [], warnings: csv.warnings }
}

export function migrateJsonTextToSections(text) {
  const parsed = safeParseJson(text)
  if (!parsed.ok) return { errors: [parsed.reason], sections: [], warnings: [] }

  if (parsed.value?.format === 'viktkollen-nutrition') {
    return {
      errors: [],
      sections: [
        { id: userDataKeys.meals, itemCount: normalizeMeals(parsed.value.data?.meals || []).length, key: userDataKeys.meals, label: 'Måltider', source: 'legacyExport', value: normalizeMeals(parsed.value.data?.meals || []) },
        { id: userDataKeys.favoriteMeals, itemCount: Array.isArray(parsed.value.data?.favoriteMeals) ? parsed.value.data.favoriteMeals.length : 0, key: userDataKeys.favoriteMeals, label: 'Favoritmåltider', source: 'legacyExport', value: parsed.value.data?.favoriteMeals || [] },
        { id: userDataKeys.nutritionGoals, itemCount: 1, key: userDataKeys.nutritionGoals, label: 'Nutritionmål', source: 'legacyExport', value: parsed.value.data?.goals || {} },
      ],
      warnings: ['Äldre kostexport mappades till nuvarande datanycklar.'],
    }
  }

  if (parsed.value?.format === 'viktkollen-progress') {
    return {
      errors: [],
      sections: [
        { id: userDataKeys.weights, itemCount: normalizeWeights(parsed.value.data?.weights || []).length, key: userDataKeys.weights, label: 'Vikter', source: 'legacyExport', value: normalizeWeights(parsed.value.data?.weights || []) },
        { id: userDataKeys.bodyMeasurements, itemCount: Array.isArray(parsed.value.data?.bodyMeasurements) ? parsed.value.data.bodyMeasurements.length : 0, key: userDataKeys.bodyMeasurements, label: 'Kroppsmått', source: 'legacyExport', value: parsed.value.data?.bodyMeasurements || [] },
        { id: userDataKeys.progressGoalSettings, itemCount: 1, key: userDataKeys.progressGoalSettings, label: 'Framstegsmål', source: 'legacyExport', value: parsed.value.data?.goalSettings || {} },
      ],
      warnings: ['Äldre framstegsexport mappades till nuvarande datanycklar.'],
    }
  }

  return migrateBackupPayloadToSections(parsed.value)
}

export const importMigrationsInternals = {
  firstValue,
  headerAliases,
  makeGeneratedId,
  normalizeDate,
  parseNumber,
}
