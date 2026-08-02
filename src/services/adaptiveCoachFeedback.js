export const adaptiveCoachFeedbackStorageKey = 'viktkollen.adaptiveCoach.v1'
export const adaptiveCoachFeedbackVersion = 1

const statusLabels = {
  accepted: 'Accepterad',
  completed: 'Klar',
  dismissed: 'Inte relevant',
  new: 'Ny',
  postponed: 'Uppskjuten',
}

const validStatuses = new Set(Object.keys(statusLabels))

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ')
    : fallback
}

function safeDateText(value, fallback = '') {
  const text = safeText(value)
  if (!text) return fallback
  const date = new Date(text)

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function addDaysIso(dateText, days) {
  const base = safeDateText(dateText, new Date().toISOString())
  const date = new Date(base)
  date.setDate(date.getDate() + days)

  return date.toISOString()
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function normalizeArea(value) {
  return safeText(value, 'general').toLocaleLowerCase('sv-SE')
}

function hashText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function normalizeStatus(value) {
  const status = safeText(value).toLocaleLowerCase('sv-SE')

  return validStatuses.has(status) ? status : 'new'
}

export function getCoachRecommendationId(recommendation = {}) {
  const area = normalizeArea(recommendation.area)
  const source = [
    area,
    safeText(recommendation.title),
    safeText(recommendation.action),
    safeText(recommendation.text),
  ].join('|')

  return `coach-${area}-${hashText(source)}`
}

function normalizeFeedbackEntry(entry = {}, options = {}) {
  const source = safeObject(entry)
  const recommendation = safeObject(options.recommendation)
  const now = safeDateText(options.now, new Date().toISOString())
  const id = safeText(source.id) || safeText(source.recommendationId) || getCoachRecommendationId(recommendation)
  const status = normalizeStatus(source.status || options.status)
  const createdAt = safeDateText(source.createdAt, now)
  const updatedAt = safeDateText(source.updatedAt, createdAt)
  const completedAt = status === 'completed'
    ? safeDateText(source.completedAt, updatedAt)
    : ''
  const dismissedReason = status === 'dismissed'
    ? safeText(source.dismissedReason || source.reason || options.dismissedReason, 'Inte relevant')
    : ''
  const postponedUntil = status === 'postponed'
    ? safeDateText(source.postponedUntil || options.postponedUntil, addDaysIso(updatedAt, 1))
    : ''

  return {
    action: safeText(source.action || recommendation.action),
    area: normalizeArea(source.area || recommendation.area),
    actionCreatedAt: safeDateText(source.actionCreatedAt),
    completedAt,
    completionSource: safeText(source.completionSource),
    createdAt,
    dismissedReason,
    id,
    lastActionStatus: safeText(source.lastActionStatus),
    linkedEntityId: safeText(source.linkedEntityId),
    linkedEntityType: safeText(source.linkedEntityType),
    postponedUntil,
    recommendationId: safeText(source.recommendationId, id),
    status,
    title: safeText(source.title || recommendation.title, 'Coachråd'),
    updatedAt,
  }
}

function normalizeHistoryEntry(entry = {}) {
  const source = safeObject(entry)
  const at = safeDateText(source.at || source.updatedAt || source.createdAt)
  if (!at) return null

  const recommendation = normalizeFeedbackEntry(source, { now: at })

  return {
    area: recommendation.area,
    at,
    dismissedReason: recommendation.dismissedReason,
    id: `${recommendation.id}-${at}-${recommendation.status}`,
    recommendationId: recommendation.recommendationId,
    status: recommendation.status,
    statusLabel: getAdaptiveCoachStatusLabel(recommendation.status),
    title: recommendation.title,
  }
}

export function normalizeAdaptiveCoachFeedback(value = {}, options = {}) {
  const source = safeObject(value)
  const now = safeDateText(options.now, source.updatedAt || new Date().toISOString())
  const rawEntries = safeArray(Array.isArray(source.recommendations)
    ? source.recommendations
    : Array.isArray(source.actions)
      ? source.actions
      : [])
  const byId = rawEntries.reduce((map, entry) => {
    const normalized = normalizeFeedbackEntry(entry, { now })
    const existing = map.get(normalized.id)

    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      map.set(normalized.id, existing ? {
        ...existing,
        ...normalized,
        action: normalized.action || existing.action,
        area: normalized.area === 'general' ? existing.area : normalized.area,
        title: normalized.title === 'Coachråd' ? existing.title : normalized.title,
      } : normalized)
    }

    return map
  }, new Map())
  const entries = [...byId.values()].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
  const history = [
    ...safeArray(source.history).map(normalizeHistoryEntry),
    ...entries.map((entry) => normalizeHistoryEntry(entry)),
  ]
    .filter(Boolean)
    .sort((first, second) => second.at.localeCompare(first.at))
    .filter((entry, index, list) =>
      list.findIndex((item) =>
        item.recommendationId === entry.recommendationId &&
        item.status === entry.status &&
        item.at === entry.at) === index)
    .slice(0, 100)

  return {
    history,
    recommendations: entries,
    updatedAt: entries[0]?.updatedAt || now,
    version: adaptiveCoachFeedbackVersion,
  }
}

export function getAdaptiveCoachStatusLabel(status) {
  return statusLabels[normalizeStatus(status)] || statusLabels.new
}

export function findAdaptiveCoachFeedback(feedback, recommendation) {
  const normalized = normalizeAdaptiveCoachFeedback(feedback)
  const id = safeText(recommendation?.id) || getCoachRecommendationId(recommendation)

  return normalized.recommendations.find((entry) => entry.id === id || entry.recommendationId === id) || null
}

export function updateAdaptiveCoachFeedback(feedback, recommendation, status, options = {}) {
  const normalized = normalizeAdaptiveCoachFeedback(feedback, options)
  const now = safeDateText(options.now, new Date().toISOString())
  const baseRecommendation = {
    ...safeObject(recommendation),
    id: safeText(recommendation?.id) || getCoachRecommendationId(recommendation),
  }
  const previous = findAdaptiveCoachFeedback(normalized, baseRecommendation)
  const nextEntry = normalizeFeedbackEntry({
    ...previous,
    ...baseRecommendation,
    completedAt: status === 'completed' ? now : '',
    dismissedReason: status === 'dismissed'
      ? safeText(options.dismissedReason, 'Inte relevant')
      : '',
    postponedUntil: status === 'postponed'
      ? safeDateText(options.postponedUntil, addDaysIso(now, 1))
      : '',
    status,
    updatedAt: now,
  }, { now, recommendation: baseRecommendation, status })
  const entries = [
    nextEntry,
    ...normalized.recommendations.filter((entry) => entry.id !== nextEntry.id),
  ]
  const historyEntry = normalizeHistoryEntry({
    ...nextEntry,
    at: now,
  })

  return normalizeAdaptiveCoachFeedback({
    history: [historyEntry, ...normalized.history],
    recommendations: entries,
    updatedAt: now,
    version: adaptiveCoachFeedbackVersion,
  }, { now })
}

export function getActiveAdaptiveCoachRecommendations(feedback, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())

  return normalizeAdaptiveCoachFeedback(feedback, { now }).recommendations.filter((entry) => {
    if (entry.status === 'completed' || entry.status === 'dismissed') return false
    if (entry.status === 'postponed') return entry.postponedUntil && entry.postponedUntil <= now

    return entry.status === 'accepted' || entry.status === 'new'
  })
}

function countByStatus(entries) {
  return entries.reduce((counts, entry) => ({
    ...counts,
    [entry.status]: (counts[entry.status] || 0) + 1,
  }), {
    accepted: 0,
    completed: 0,
    dismissed: 0,
    postponed: 0,
  })
}

function topArea(entries, fallback = 'Saknas') {
  const counts = entries.reduce((map, entry) => {
    const key = safeText(entry.area, 'general')
    map.set(key, (map.get(key) || 0) + 1)

    return map
  }, new Map())
  const top = [...counts.entries()].sort((first, second) => second[1] - first[1])[0]

  return top ? top[0] : fallback
}

export function buildAdaptiveCoachFeedbackSummary(feedback, options = {}) {
  const normalized = normalizeAdaptiveCoachFeedback(feedback, options)
  const entries = normalized.recommendations
  const counts = countByStatus(entries)
  const actionableTotal = counts.accepted + counts.completed + counts.postponed + counts.dismissed
  const completionRate = actionableTotal > 0
    ? Math.round((counts.completed / actionableTotal) * 100)
    : null
  const active = getActiveAdaptiveCoachRecommendations(normalized, options)
  const completedEntries = entries.filter((entry) => entry.status === 'completed')
  const dismissedEntries = entries.filter((entry) => entry.status === 'dismissed')

  return {
    accepted: counts.accepted,
    activeCount: active.length,
    activeRecommendations: active,
    completed: counts.completed,
    completionRate,
    completionRateLabel: completionRate === null ? 'Inget underlag' : `${completionRate.toLocaleString('sv-SE')}%`,
    confidence: entries.length ? Math.min(0.95, 0.45 + completedEntries.length * 0.08 + counts.accepted * 0.04) : 0.2,
    coverage: entries.length ? Math.min(1, entries.length / 6) : 0,
    dismissed: counts.dismissed,
    effectivenessLabel: completionRate === null
      ? 'Mer historik behövs'
      : completionRate >= 60
        ? 'Coachråden verkar hjälpa'
        : 'Coachråden behöver bättre tajming',
    helpedMost: topArea(completedEntries),
    ignoredMost: topArea(dismissedEntries),
    latestAction: normalized.history[0] || null,
    postponed: counts.postponed,
    recentActions: normalized.history.slice(0, 5),
    total: entries.length,
    updatedAt: normalized.updatedAt,
    weeklyStatus: active.length
      ? `${active.length} aktiva coachråd`
      : entries.length
        ? 'Inga aktiva coachråd just nu'
        : 'Ingen feedback ännu',
  }
}

function daysBetween(first, second) {
  const firstDate = new Date(first)
  const secondDate = new Date(second)
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(secondDate.getTime())) return Infinity

  return Math.abs(secondDate.getTime() - firstDate.getTime()) / 86400000
}

function buildAreaSuccessMap(entries) {
  return entries.reduce((map, entry) => {
    if (entry.status !== 'completed') return map
    map.set(entry.area, (map.get(entry.area) || 0) + 1)

    return map
  }, new Map())
}

export function applyFeedbackToRecommendations(recommendations = [], feedback, options = {}) {
  const now = safeDateText(options.now, new Date().toISOString())
  const normalized = normalizeAdaptiveCoachFeedback(feedback, { now })
  const areaSuccess = buildAreaSuccessMap(normalized.recommendations)

  return safeArray(recommendations)
    .map((recommendation) => {
      const id = safeText(recommendation.id) || getCoachRecommendationId(recommendation)
      const entry = normalized.recommendations.find((item) => item.id === id || item.recommendationId === id)
      const area = normalizeArea(recommendation.area)
      let feedbackAdjustment = areaSuccess.has(area) ? Math.min(12, areaSuccess.get(area) * 4) : 0
      let hiddenUntil = ''

      if (entry?.status === 'accepted') feedbackAdjustment += 10
      if (entry?.status === 'dismissed') feedbackAdjustment -= daysBetween(entry.updatedAt, now) <= 21 ? 45 : 12
      if (entry?.status === 'completed') feedbackAdjustment -= daysBetween(entry.completedAt || entry.updatedAt, now) <= 7 ? 30 : 6
      if (entry?.status === 'postponed' && entry.postponedUntil > now) {
        feedbackAdjustment -= 100
        hiddenUntil = entry.postponedUntil
      }

      return {
        ...recommendation,
        adjustedPriority: normalizeNumber(recommendation.priority) + feedbackAdjustment,
        feedbackStatus: entry?.status || 'new',
        feedbackStatusLabel: getAdaptiveCoachStatusLabel(entry?.status || 'new'),
        hiddenUntil,
        id,
        lastFeedbackAt: entry?.updatedAt || '',
      }
    })
    .filter((recommendation) => !recommendation.hiddenUntil)
    .sort((first, second) => second.adjustedPriority - first.adjustedPriority)
}
