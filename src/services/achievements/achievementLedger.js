export const achievementLedgerLimit = 160

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value, fallback = '', max = 120) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

export function normalizeAchievementState(value = {}) {
  const source = isObject(value) ? value : {}
  const safeEvents = Array.isArray(source.events) ? source.events : []
  const safeXp = Array.isArray(source.xpLedger) ? source.xpLedger : []

  return {
    acknowledged: Array.isArray(source.acknowledged) ? [...new Set(source.acknowledged.map((id) => safeText(id)).filter(Boolean))].slice(-achievementLedgerLimit) : [],
    challengeHistory: Array.isArray(source.challengeHistory)
      ? source.challengeHistory.filter(isObject).map(normalizeLedgerEvent).filter(Boolean).slice(-achievementLedgerLimit)
      : [],
    events: safeEvents.filter(isObject).map(normalizeLedgerEvent).filter(Boolean).slice(-achievementLedgerLimit),
    schemaVersion: 1,
    settings: {
      achievementNotifications: source.settings?.achievementNotifications === true,
      reducedMotion: source.settings?.reducedMotion === true,
    },
    unlocked: Array.isArray(source.unlocked) ? [...new Set(source.unlocked.map((id) => safeText(id)).filter(Boolean))].slice(-achievementLedgerLimit) : [],
    updatedAt: safeText(source.updatedAt),
    xpLedger: safeXp.filter(isObject).map(normalizeLedgerEvent).filter(Boolean).slice(-achievementLedgerLimit),
  }
}

export function normalizeLedgerEvent(event = {}) {
  if (!isObject(event)) return null
  const type = safeText(event.type, 'achievementUnlocked', 60)
  const definitionId = safeText(event.definitionId || event.achievementId, '', 90)
  const at = safeText(event.at || event.createdAt || event.completedAt)
  const eventId = safeText(event.eventId || event.id || `${type}-${definitionId}-${at}`, '', 120)
  if (!definitionId && !eventId) return null

  return {
    achievementId: safeText(event.achievementId || definitionId, '', 90),
    at,
    definitionId,
    eventId,
    source: safeText(event.source, 'achievementEngine', 60),
    type,
    xp: Math.max(0, Math.min(Math.round(Number(event.xp) || 0), 100)),
  }
}

export function appendAchievementEvents(state = {}, events = [], options = {}) {
  const normalized = normalizeAchievementState(state)
  const existing = new Set([
    ...normalized.events.map((event) => event.eventId),
    ...normalized.xpLedger.map((event) => event.eventId),
  ])
  const now = options.now || new Date().toISOString()
  const nextEvents = []
  const nextXp = []

  events.forEach((event) => {
    const normalizedEvent = normalizeLedgerEvent({ ...event, at: event.at || now })
    if (!normalizedEvent || existing.has(normalizedEvent.eventId)) return
    existing.add(normalizedEvent.eventId)
    if (normalizedEvent.type === 'xpGranted') {
      nextXp.push(normalizedEvent)
    } else {
      nextEvents.push(normalizedEvent)
    }
  })

  return {
    ...normalized,
    events: [...normalized.events, ...nextEvents].slice(-achievementLedgerLimit),
    updatedAt: now,
    unlocked: [...new Set([
      ...normalized.unlocked,
      ...nextEvents
        .filter((event) => event.type === 'achievementUnlocked' || event.type === 'milestoneReached')
        .map((event) => event.definitionId),
    ])].slice(-achievementLedgerLimit),
    xpLedger: [...normalized.xpLedger, ...nextXp].slice(-achievementLedgerLimit),
  }
}
