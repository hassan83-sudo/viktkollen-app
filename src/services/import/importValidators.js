import { getPayloadSizeBytes, isAllowedSyncStorageKey, maxSyncPayloadBytes } from '../sync/syncMetadata.js'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasUnsafeKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) return true
  if (Array.isArray(value)) return value.some((item) => hasUnsafeKey(item, seen))
  return Object.values(value).some((item) => hasUnsafeKey(item, seen))
}

function validateWeightItem(item) {
  const value = Number(item?.value ?? item?.weight)
  if (!Number.isFinite(value) || value < 20 || value > 350) return 'Viktvärdet ligger utanför ett rimligt intervall.'
  if (!item?.date || Number.isNaN(new Date(item.date).getTime())) return 'Viktposten saknar giltigt datum.'
  return ''
}

function validateMealItem(item) {
  if (!item?.text && !item?.name && !item?.title) return 'Måltiden saknar namn eller beskrivning.'
  const nutritionFields = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber']
  const hasInvalidNutrition = nutritionFields.some((field) => {
    if (item?.[field] === undefined || item?.[field] === null || item?.[field] === '') return false
    const value = Number(item[field])
    return !Number.isFinite(value) || value < 0 || value > 20000
  })
  if (hasInvalidNutrition) return 'Måltiden har ogiltiga näringsvärden.'
  return ''
}

function validateCheckInItem(item) {
  if (!item?.date || Number.isNaN(new Date(item.date).getTime())) return 'Check-in saknar giltigt datum.'
  const steps = Number(item?.steps)
  if (item?.steps !== undefined && item?.steps !== null && (!Number.isFinite(steps) || steps < 0 || steps > 200000)) {
    return 'Check-in har ogiltigt stegvärde.'
  }
  return ''
}

function validateItemsForKey(storageKey, value) {
  const items = Array.isArray(value) ? value : []
  if (!items.length) return { invalidItems: [], validCount: Array.isArray(value) ? 0 : 1, warnings: [] }

  const validator = storageKey === 'viktkollen.weights'
    ? validateWeightItem
    : storageKey === 'viktkollen.meals'
      ? validateMealItem
      : storageKey === 'viktkollen.checkIn'
        ? validateCheckInItem
        : () => ''
  const invalidItems = items
    .map((item, index) => ({ index, reason: validator(item) }))
    .filter((item) => item.reason)

  return {
    invalidItems,
    validCount: items.length - invalidItems.length,
    warnings: invalidItems.length ? [`${invalidItems.length} poster kan inte importeras utan manuell kontroll.`] : [],
  }
}

export function validateImportSection(section) {
  const errors = []
  const warnings = []
  const storageKey = section?.key || section?.storageKey

  if (!isAllowedSyncStorageKey(storageKey)) {
    errors.push('Datanyckeln ingår inte i Viktkollens säkra importlista.')
  }

  if (hasUnsafeKey(section?.value)) {
    errors.push('Datadelen innehåller osäkra objektfält.')
  }

  if (getPayloadSizeBytes(section?.value ?? null) > maxSyncPayloadBytes) {
    errors.push('Datadelen är för stor för säker import.')
  }

  if (section?.value === undefined) {
    errors.push('Datadelen saknar värde.')
  }

  const itemValidation = validateItemsForKey(storageKey, section?.value)
  warnings.push(...itemValidation.warnings)

  return {
    errors,
    invalidItems: itemValidation.invalidItems,
    ok: errors.length === 0,
    validCount: itemValidation.validCount,
    warnings,
  }
}

export function validateImportSections(sections = []) {
  const validatedSections = (Array.isArray(sections) ? sections : []).map((section) => ({
    ...section,
    validation: validateImportSection(section),
  }))

  return {
    errors: validatedSections.flatMap((section) => section.validation.errors.map((reason) => ({ reason, sectionId: section.id }))),
    ok: validatedSections.every((section) => section.validation.ok),
    sections: validatedSections,
    warnings: validatedSections.flatMap((section) => section.validation.warnings.map((reason) => ({ reason, sectionId: section.id }))),
  }
}

export const importValidatorsInternals = {
  hasUnsafeKey,
  isObject,
  validateCheckInItem,
  validateMealItem,
  validateWeightItem,
}
