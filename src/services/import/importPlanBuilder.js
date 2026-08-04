import { readStorage } from '../appStorageService.js'
import { stableSerialize } from '../sync/syncMetadata.js'
import { canSafelyMergeSyncPayload, syncCollectionMergePolicies } from '../sync/cloudConflictResolver.js'
import { validateImportSections } from './importValidators.js'

const mergeStrategies = Object.freeze(['skip', 'append', 'safeMerge', 'replace', 'manualReview'])

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value
  Object.freeze(value)
  Object.values(value).forEach(deepFreeze)
  return value
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getItemId(item) {
  return item && typeof item === 'object' && item.id !== undefined ? String(item.id) : ''
}

function mergeArraysById(local = [], incoming = []) {
  const byId = new Map()
  const additions = []
  const updates = []
  const unchanged = []
  const conflicts = []

  local.forEach((item) => {
    const id = getItemId(item)
    if (id) byId.set(id, item)
  })

  incoming.forEach((item) => {
    const id = getItemId(item)
    if (!id || !byId.has(id)) {
      additions.push(item)
      if (id) byId.set(id, item)
      return
    }

    const existing = byId.get(id)
    if (stableSerialize(existing) === stableSerialize(item)) {
      unchanged.push(item)
      return
    }

    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime()
    const nextTime = new Date(item.updatedAt || item.createdAt || 0).getTime()
    if (Number.isFinite(existingTime) && Number.isFinite(nextTime) && nextTime > existingTime) {
      updates.push(item)
      byId.set(id, item)
    } else if (!Number.isFinite(existingTime) || !Number.isFinite(nextTime)) {
      conflicts.push({ id, reason: 'Samma id saknar tydlig tidsordning.' })
    } else {
      unchanged.push(item)
    }
  })

  return {
    additions,
    conflicts,
    payload: [...byId.values()],
    unchanged,
    updates,
  }
}

function countItems(value) {
  if (Array.isArray(value)) return value.length
  if (isObject(value)) return Object.keys(value).length
  return value === undefined ? 0 : 1
}

function defaultStrategyForKey(storageKey, incomingValue, selectedStrategy) {
  if (mergeStrategies.includes(selectedStrategy)) return selectedStrategy
  const policy = syncCollectionMergePolicies[storageKey]
  if (Array.isArray(incomingValue) && policy === 'mergeById') return 'safeMerge'
  if (policy === 'mergeWeeks') return 'safeMerge'
  if (isObject(incomingValue)) return 'manualReview'
  if (policy === 'lastWholeKey') return 'manualReview'
  return 'append'
}

function readCurrentValue(storageKey, currentData = {}, incomingValue = null) {
  if (Object.prototype.hasOwnProperty.call(currentData, storageKey)) return currentData[storageKey]
  return readStorage(storageKey, Array.isArray(incomingValue) ? [] : isObject(incomingValue) ? {} : null)
}

function buildSectionPlan(section, options = {}) {
  const storageKey = section.key
  const currentValue = readCurrentValue(storageKey, options.currentData, section.value)
  const strategy = defaultStrategyForKey(storageKey, section.value, options.strategies?.[storageKey])

  if (strategy === 'skip') {
    return {
      additions: 0,
      conflicts: [],
      estimatedWrites: 0,
      key: storageKey,
      nextValue: currentValue,
      sectionId: section.id,
      skipped: countItems(section.value),
      strategy,
      unchanged: 0,
      updates: 0,
    }
  }

  if (strategy === 'manualReview') {
    return {
      additions: 0,
      conflicts: [{ reason: 'Datadelen kräver manuell strategi innan import.', storageKey }],
      estimatedWrites: 0,
      key: storageKey,
      nextValue: currentValue,
      sectionId: section.id,
      skipped: countItems(section.value),
      strategy,
      unchanged: 0,
      updates: 0,
    }
  }

  if (strategy === 'replace') {
    return {
      additions: countItems(section.value),
      conflicts: [],
      estimatedWrites: 1,
      key: storageKey,
      nextValue: section.value,
      sectionId: section.id,
      skipped: 0,
      strategy,
      unchanged: 0,
      updates: 0,
    }
  }

  if (strategy === 'safeMerge') {
    const safeMerged = canSafelyMergeSyncPayload(storageKey, currentValue, section.value)
    if (safeMerged.ok) {
      const merged = Array.isArray(currentValue) && Array.isArray(section.value)
        ? mergeArraysById(currentValue, section.value)
        : { additions: [], conflicts: [], payload: safeMerged.payload, unchanged: [], updates: [] }
      return {
        additions: merged.additions.length,
        conflicts: merged.conflicts,
        estimatedWrites: stableSerialize(currentValue) === stableSerialize(safeMerged.payload) ? 0 : 1,
        key: storageKey,
        nextValue: safeMerged.payload,
        sectionId: section.id,
        skipped: 0,
        strategy,
        unchanged: merged.unchanged.length,
        updates: merged.updates.length,
      }
    }

    return {
      additions: 0,
      conflicts: [{ reason: safeMerged.reason || 'Datadelen kan inte mergas säkert.', storageKey }],
      estimatedWrites: 0,
      key: storageKey,
      nextValue: currentValue,
      sectionId: section.id,
      skipped: countItems(section.value),
      strategy,
      unchanged: 0,
      updates: 0,
    }
  }

  const localItems = Array.isArray(currentValue) ? currentValue : []
  const incomingItems = Array.isArray(section.value) ? section.value : []
  const merged = mergeArraysById(localItems, incomingItems)

  return {
    additions: merged.additions.length,
    conflicts: merged.conflicts,
    estimatedWrites: stableSerialize(currentValue) === stableSerialize(merged.payload) ? 0 : 1,
    key: storageKey,
    nextValue: merged.payload,
    sectionId: section.id,
    skipped: 0,
    strategy,
    unchanged: merged.unchanged.length,
    updates: merged.updates.length,
  }
}

export function buildImportPlan(importSession, options = {}) {
  const selectedSections = new Set(options.selectedSections || importSession?.sections?.map((section) => section.id) || [])
  const validation = validateImportSections(importSession?.sections || [])
  const includedSections = validation.sections.filter((section) => selectedSections.has(section.id))
  const sectionPlans = includedSections.map((section) => buildSectionPlan(section, options))
  const conflicts = sectionPlans.flatMap((plan) => plan.conflicts.map((conflict) => ({ ...conflict, sectionId: plan.sectionId })))
  const invalidItems = validation.sections.flatMap((section) =>
    section.validation.invalidItems.map((item) => ({ ...item, sectionId: section.id })))
  const blockingErrors = [
    ...validation.errors,
    ...conflicts,
  ]

  return deepFreeze({
    additions: sectionPlans.reduce((sum, plan) => sum + plan.additions, 0),
    blockingErrors,
    conflicts,
    duplicates: [],
    estimatedWrites: sectionPlans.reduce((sum, plan) => sum + plan.estimatedWrites, 0),
    importId: importSession?.importId || '',
    invalidItems,
    okToApply: blockingErrors.length === 0 && invalidItems.length === 0 && sectionPlans.some((plan) => plan.estimatedWrites > 0),
    requiresManualConfirmation: sectionPlans.some((plan) => plan.strategy === 'replace') || blockingErrors.length > 0,
    requiresSnapshot: sectionPlans.some((plan) => plan.estimatedWrites > 0),
    sectionPlans,
    selectedSections: [...selectedSections],
    skipped: sectionPlans.reduce((sum, plan) => sum + plan.skipped, 0),
    strategies: Object.fromEntries(sectionPlans.map((plan) => [plan.key, plan.strategy])),
    unchanged: sectionPlans.reduce((sum, plan) => sum + plan.unchanged, 0),
    updates: sectionPlans.reduce((sum, plan) => sum + plan.updates, 0),
    warnings: validation.warnings,
  })
}

export { mergeStrategies }

export const importPlanBuilderInternals = {
  buildSectionPlan,
  countItems,
  deepFreeze,
  defaultStrategyForKey,
  mergeArraysById,
}
