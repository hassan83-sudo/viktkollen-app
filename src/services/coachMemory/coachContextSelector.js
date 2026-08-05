import {
  coachFocusCategories,
  normalizeCoachMemory,
} from './coachMemoryModel.js'

const intentCategoryMap = {
  activity: 'activity',
  coach: 'planning',
  goal: 'goals',
  goals: 'goals',
  meal: 'nutrition',
  motivation: 'recovery',
  nutrition: 'nutrition',
  plan: 'planning',
  reminder: 'reminders',
  stress: 'recovery',
  weight: 'weight',
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function isFresh(item, nowText) {
  if (!item.staleAfter) return true
  const staleAt = new Date(item.staleAfter)
  const now = new Date(nowText)
  return !Number.isNaN(staleAt.getTime()) && staleAt.getTime() >= now.getTime()
}

function wantedCategories(intents = []) {
  const categories = safeArray(intents).map((intent) => intentCategoryMap[intent]).filter(Boolean)
  return categories.length ? [...new Set(categories)] : ['planning']
}

function selectItems(items, categories, now, max = 2, kind = 'memory') {
  return safeArray(items)
    .filter((item) => categories.includes(item.category) || categories.includes('planning'))
    .filter((item) => item.confidence >= 0.35)
    .filter((item) => isFresh(item, now))
    .sort((first, second) => second.confidence - first.confidence || second.evidenceCount - first.evidenceCount || first.category.localeCompare(second.category))
    .slice(0, max)
    .map((item) => ({
      category: item.category,
      confidence: item.confidence,
      evidenceCount: item.evidenceCount,
      kind,
      reason: `${item.category} valdes eftersom det matchar aktuell coachkontext och har tillräcklig confidence.`,
    }))
}

export function selectCoachMemoryContext(memory = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  const normalized = normalizeCoachMemory(memory, { now })
  if (!normalized.consent.personalizationEnabled) {
    return {
      items: [],
      limitations: ['Personlig anpassning är avstängd.'],
      memoryEnabled: false,
      remoteAllowed: false,
      summary: null,
    }
  }

  const categories = wantedCategories(options.intents || options.categories)
    .filter((category) => coachFocusCategories.includes(category))
    .filter((category) => !normalized.preferences.excludedFocusAreas.includes(category))
  const explicitPreferences = {
    actionSize: normalized.preferences.preferredActionSize,
    coachStyle: normalized.preferences.preferredCoachTone,
    excludedFocusAreas: normalized.preferences.excludedFocusAreas,
    selectedFocusAreas: normalized.preferences.preferredFocusAreas,
  }
  const successful = selectItems(normalized.successfulStrategies, categories, now, 3, 'successfulStrategy')
  const declined = selectItems(normalized.declinedStrategies, categories, now, 2, 'declinedStrategy')
  const barriers = selectItems(normalized.recurringBarriers, categories, now, 2, 'recurringBarrier')

  return {
    activePriorityCategories: normalized.activePriorities.filter((item) => categories.includes(item)).slice(0, 4),
    explicitPreferences,
    items: [...successful, ...declined, ...barriers].slice(0, 7),
    limitations: [
      normalized.recentContext.currentCoverage < 0.35 ? 'Begränsad datatäckning.' : '',
      categories.length === 0 ? 'Alla relevanta fokusområden är exkluderade.' : '',
    ].filter(Boolean),
    memoryEnabled: true,
    recentContext: {
      activeActionCount: normalized.recentContext.activeActionCount,
      currentCoverage: normalized.recentContext.currentCoverage,
      currentMomentum: normalized.recentContext.currentMomentum,
      safeWeeklySummary: normalized.recentContext.safeWeeklySummary,
    },
    remoteAllowed: normalized.consent.remoteAiMemoryEnabled === true,
    summary: `${normalized.successfulStrategies.length + normalized.declinedStrategies.length + normalized.recurringBarriers.length} säkra minnesposter finns.`,
  }
}

export const coachContextSelectorInternals = {
  isFresh,
  wantedCategories,
}
