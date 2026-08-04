import { getNotificationPermission } from '../reminders/reminderNotifications.js'
import { normalizeReminderState } from '../reminders/reminderModel.js'
import { getNextReminderAt } from '../reminders/reminderScheduler.js'

export const notificationEngineVersion = 3
export const notificationHistoryLimit = 120

const defaultQuietHours = {
  enabled: true,
  end: '07:00',
  start: '22:00',
}

const statusLabels = {
  batched: 'Samlad',
  completed: 'Klar',
  dismissed: 'Avfärdad',
  delivered: 'Skickad',
  postponed: 'Uppskjuten',
  scheduled: 'Planerad',
  skipped: 'Hoppad över',
  suppressed: 'Pausad',
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 180) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeIso(value, fallback = '') {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function normalizeTime(value, fallback) {
  const text = String(value || '')
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback
}

function minutesFromTime(value) {
  const [hours, minutes] = normalizeTime(value, '00:00').split(':').map(Number)
  return hours * 60 + minutes
}

function minutesFromDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

function addMinutesIso(value, minutes) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() + minutes)
  return date.toISOString()
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

function maskEntityId(value) {
  const text = safeText(value, '', 120)
  if (!text) return ''
  return `ref-${hashText(text)}`
}

function historyId(entry) {
  return `notification-${hashText([
    entry.sourceType,
    entry.sourceIdMasked,
    entry.status,
    entry.at,
  ].join('|'))}`
}

export function normalizeNotificationSettings(value = {}) {
  const source = isObject(value) ? value : {}
  const quietHours = isObject(source.quietHours) ? source.quietHours : {}
  const batchingWindowMinutes = Number.isFinite(Number(source.batchingWindowMinutes))
    ? clamp(source.batchingWindowMinutes, 5, 120)
    : 30

  return {
    batchingWindowMinutes,
    enabled: source.enabled !== false,
    quietHours: {
      enabled: quietHours.enabled !== false,
      end: normalizeTime(quietHours.end, defaultQuietHours.end),
      start: normalizeTime(quietHours.start, defaultQuietHours.start),
    },
  }
}

export function normalizeNotificationHistoryEntry(entry = {}, options = {}) {
  const source = isObject(entry) ? entry : {}
  const at = safeIso(source.at || source.createdAt || source.updatedAt, options.now || new Date().toISOString())
  const status = Object.hasOwn(statusLabels, source.status) ? source.status : 'scheduled'
  const normalized = {
    at,
    batchId: safeText(source.batchId, '', 120),
    id: safeText(source.id, '', 120),
    notificationId: safeText(source.notificationId, '', 120),
    reason: safeText(source.reason, '', 220),
    sourceIdMasked: safeText(source.sourceIdMasked || maskEntityId(source.sourceId), '', 80),
    sourceType: safeText(source.sourceType, 'reminder', 50),
    status,
    statusLabel: statusLabels[status],
    title: sanitizeNotificationTitle(source.title),
  }

  return {
    ...normalized,
    id: normalized.id || historyId(normalized),
  }
}

export function normalizeNotificationsV3(value = {}, options = {}) {
  const source = isObject(value) ? value : {}

  return {
    history: safeArray(source.history)
      .map((entry) => normalizeNotificationHistoryEntry(entry, options))
      .slice(-notificationHistoryLimit),
    lastDeliveredAtBySource: isObject(source.lastDeliveredAtBySource)
      ? Object.fromEntries(Object.entries(source.lastDeliveredAtBySource).map(([key, date]) => [safeText(key, '', 120), safeIso(date)]).filter(([key, date]) => key && date))
      : {},
    settings: normalizeNotificationSettings(source.settings),
    version: notificationEngineVersion,
  }
}

export function sanitizeNotificationTitle(value) {
  const title = safeText(value, 'Viktkollen', 90)
  if (/(token|session|apikey|api key|base64|data:image|supabase)/i.test(title)) return 'Viktkollen'
  return title
}

export function isWithinQuietHours(dateValue, quietHours = defaultQuietHours) {
  const settings = {
    ...defaultQuietHours,
    ...(isObject(quietHours) ? quietHours : {}),
  }
  if (settings.enabled === false) return false
  const current = minutesFromDate(dateValue)
  const start = minutesFromTime(settings.start)
  const end = minutesFromTime(settings.end)

  if (start === end) return false
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

export function getQuietHoursResumeAt(dateValue, quietHours = defaultQuietHours) {
  const date = new Date(dateValue)
  const end = normalizeTime(quietHours.end, defaultQuietHours.end)
  const [hours, minutes] = end.split(':').map(Number)
  const resume = new Date(date)
  resume.setHours(hours, minutes, 0, 0)
  if (resume <= date) resume.setDate(resume.getDate() + 1)
  return resume.toISOString()
}

function recentHistory(state, sourceType, status, limit = 14) {
  const notifications = normalizeNotificationsV3(state.notificationsV3)
  return notifications.history
    .filter((entry) => entry.sourceType === sourceType && (!status || entry.status === status))
    .slice(-limit)
}

export function buildAdaptiveDeliveryProfile(reminderState = {}) {
  const normalized = normalizeReminderState(reminderState)
  const completed = recentHistory(normalized, 'reminder', 'completed').length + normalized.history.filter((entry) => entry.action === 'completed').slice(-14).length
  const dismissed = recentHistory(normalized, 'reminder', 'dismissed').length + normalized.history.filter((entry) => entry.action === 'skipped').slice(-14).length
  const postponed = recentHistory(normalized, 'reminder', 'postponed').length + normalized.history.filter((entry) => entry.action === 'snoozed').slice(-14).length
  const ignored = dismissed + postponed
  const total = Math.max(1, completed + ignored)
  const completionRate = completed / total
  const ignoreRate = ignored / total

  return {
    batchingWindowMinutes: ignoreRate >= 0.5 ? 60 : completionRate >= 0.65 ? 15 : 30,
    cadence: ignoreRate >= 0.5 ? 'reduced' : completionRate >= 0.65 ? 'responsive' : 'balanced',
    completionRate: Math.round(completionRate * 100),
    ignoreRate: Math.round(ignoreRate * 100),
    recommendedDelayMinutes: ignored >= completed + 2 ? 45 : 0,
  }
}

function createReminderCandidate(reminder, options = {}) {
  const scheduledAt = safeIso(options.scheduledAt || getNextReminderAt(reminder, options), options.now)
  return {
    body: 'Du har en frivillig påminnelse i Viktkollen.',
    id: `notification-${hashText(`reminder|${reminder.id}|${scheduledAt}`)}`,
    priority: reminder.type === 'check_in' || reminder.type === 'meal_log' ? 70 : 55,
    scheduledAt,
    sourceId: reminder.id,
    sourceIdMasked: maskEntityId(reminder.id),
    sourceType: 'reminder',
    tag: `viktkollen-reminder-${reminder.id}`,
    title: sanitizeNotificationTitle(reminder.title),
  }
}

function createCoachCandidates(feedback = {}, options = {}) {
  const recommendations = safeArray(feedback.recommendations)
    .filter((item) => ['accepted', 'postponed', 'new'].includes(item.status || 'new'))
    .slice(0, 2)
  return recommendations.map((item, index) => ({
    body: 'Ett litet nästa steg väntar i coachen.',
    id: `notification-${hashText(`coach|${item.id || item.recommendationId}|${options.now}|${index}`)}`,
    priority: item.status === 'accepted' ? 68 : 48,
    scheduledAt: options.now,
    sourceId: item.id || item.recommendationId,
    sourceIdMasked: maskEntityId(item.id || item.recommendationId),
    sourceType: 'coachAction',
    tag: `viktkollen-coach-${hashText(item.id || item.recommendationId || index)}`,
    title: sanitizeNotificationTitle(item.title || 'Coachens nästa steg'),
  }))
}

function createWeeklyPlanCandidates(weeklyPlan = {}, options = {}) {
  const actions = safeArray(weeklyPlan.proposedActions || weeklyPlan.scheduleSuggestions).slice(0, 1)
  return actions.map((item, index) => ({
    body: 'Veckoplanen har ett planerat fokus att följa upp.',
    id: `notification-${hashText(`weekly|${item.id || item.actionId}|${options.now}|${index}`)}`,
    priority: 45,
    scheduledAt: options.now,
    sourceId: item.id || item.actionId,
    sourceIdMasked: maskEntityId(item.id || item.actionId),
    sourceType: 'weeklyPlan',
    tag: `viktkollen-weekly-${hashText(item.id || item.actionId || index)}`,
    title: sanitizeNotificationTitle(item.title || 'Veckoplan'),
  }))
}

function createSyncCandidates(syncStatus = {}, options = {}) {
  if (!syncStatus?.conflicts?.length && syncStatus?.syncHealth !== 'failed') return []
  return [{
    body: 'Sync behöver din uppmärksamhet.',
    id: `notification-${hashText(`sync|${syncStatus.syncHealth}|${options.now}`)}`,
    priority: 80,
    scheduledAt: options.now,
    sourceId: syncStatus.statusCode || 'sync',
    sourceIdMasked: maskEntityId(syncStatus.statusCode || 'sync'),
    sourceType: 'sync',
    tag: 'viktkollen-sync-status',
    title: 'Sync behöver granskas',
  }]
}

function dedupeCandidates(candidates = [], lastDeliveredAtBySource = {}, now = new Date().toISOString()) {
  const nowTime = new Date(now).getTime()
  const seenTags = new Set()
  return candidates
    .filter((candidate) => {
      if (!candidate.scheduledAt || seenTags.has(candidate.tag)) return false
      seenTags.add(candidate.tag)
      const lastAt = lastDeliveredAtBySource[candidate.sourceIdMasked]
      if (!lastAt) return true
      return nowTime - new Date(lastAt).getTime() > 45 * 60000
    })
    .sort((first, second) => second.priority - first.priority || first.scheduledAt.localeCompare(second.scheduledAt))
}

export function batchNotificationCandidates(candidates = [], options = {}) {
  const windowMinutes = clamp(options.windowMinutes, 5, 120)
  const sorted = [...candidates].sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt))
  const batches = []

  sorted.forEach((candidate) => {
    const existing = batches.find((batch) =>
      Math.abs(new Date(batch.scheduledAt).getTime() - new Date(candidate.scheduledAt).getTime()) <= windowMinutes * 60000)
    if (existing) {
      existing.items.push(candidate)
      existing.priority = Math.max(existing.priority, candidate.priority)
      existing.title = `${existing.items.length} påminnelser från Viktkollen`
      existing.body = 'Flera saker ligger nära varandra. Du kan ta dem i lugn takt.'
      return
    }

    batches.push({
      body: candidate.body,
      id: `notification-batch-${hashText(`${candidate.id}|${windowMinutes}`)}`,
      items: [candidate],
      priority: candidate.priority,
      scheduledAt: candidate.scheduledAt,
      tag: candidate.tag,
      title: candidate.title,
    })
  })

  return batches
}

export function buildNotificationPlan(input = {}, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const reminderState = normalizeReminderState(input.reminderState, { now })
  const notifications = normalizeNotificationsV3(reminderState.notificationsV3, { now })
  const adaptiveProfile = buildAdaptiveDeliveryProfile(reminderState)
  const settings = {
    ...notifications.settings,
    batchingWindowMinutes: notifications.settings.batchingWindowMinutes || adaptiveProfile.batchingWindowMinutes,
  }
  const dueReminders = safeArray(input.dueReminders).length
    ? safeArray(input.dueReminders)
    : reminderState.reminders.filter((reminder) => getNextReminderAt(reminder, { now }) && new Date(getNextReminderAt(reminder, { now })) <= new Date(now))
  const reminderCandidates = dueReminders.map((reminder) => createReminderCandidate(reminder, { now, scheduledAt: now }))
  const candidates = dedupeCandidates([
    ...reminderCandidates,
    ...createCoachCandidates(input.adaptiveCoachFeedback, { now }),
    ...createWeeklyPlanCandidates(input.weeklyPlan, { now }),
    ...createSyncCandidates(input.syncStatus, { now }),
  ], notifications.lastDeliveredAtBySource, now)
  const quiet = isWithinQuietHours(now, settings.quietHours)
  const adjustedCandidates = quiet
    ? candidates.map((candidate) => ({
      ...candidate,
      reason: 'quiet_hours',
      scheduledAt: getQuietHoursResumeAt(now, settings.quietHours),
      status: 'suppressed',
    }))
    : adaptiveProfile.recommendedDelayMinutes
      ? candidates.map((candidate) => ({
        ...candidate,
        reason: 'adaptive_delay',
        scheduledAt: addMinutesIso(candidate.scheduledAt, adaptiveProfile.recommendedDelayMinutes),
      }))
      : candidates
  const batches = batchNotificationCandidates(adjustedCandidates, { windowMinutes: settings.batchingWindowMinutes || adaptiveProfile.batchingWindowMinutes })

  return {
    adaptiveProfile,
    batches,
    candidates: adjustedCandidates,
    deliveries: quiet ? [] : batches,
    history: notifications.history,
    permission: getNotificationPermission(),
    quietHoursActive: quiet,
    settings,
    upcoming: batches,
  }
}

export function recordNotificationEvent(reminderState = {}, event = {}, options = {}) {
  const now = safeIso(options.now || event.at, new Date().toISOString())
  const state = normalizeReminderState(reminderState, { now })
  const notifications = normalizeNotificationsV3(state.notificationsV3, { now })
  const items = safeArray(event.items).length ? safeArray(event.items) : [event]
  const entries = items.map((item) => normalizeNotificationHistoryEntry({
    at: now,
    batchId: event.batchId || event.id || '',
    notificationId: item.id || event.id || '',
    reason: event.reason || item.reason || '',
    sourceId: item.sourceId,
    sourceIdMasked: item.sourceIdMasked,
    sourceType: item.sourceType || event.sourceType || 'reminder',
    status: event.status || item.status || 'delivered',
    title: item.title || event.title,
  }, { now }))
  const lastDeliveredAtBySource = { ...notifications.lastDeliveredAtBySource }
  entries.forEach((entry) => {
    if (['delivered', 'batched', 'completed'].includes(entry.status)) {
      lastDeliveredAtBySource[entry.sourceIdMasked] = entry.at
    }
  })

  return {
    ...state,
    notificationsV3: {
      ...notifications,
      history: [...notifications.history, ...entries].slice(-notificationHistoryLimit),
      lastDeliveredAtBySource,
    },
    updatedAt: now,
  }
}

export function buildNotificationCenterModel(input = {}, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const state = normalizeReminderState(input.reminderState, { now })
  const plan = buildNotificationPlan(input, { now })
  const history = normalizeNotificationsV3(state.notificationsV3, { now }).history.slice().reverse()

  return {
    adaptiveProfile: plan.adaptiveProfile,
    completed: history.filter((entry) => entry.status === 'completed'),
    dismissed: history.filter((entry) => entry.status === 'dismissed' || entry.status === 'skipped'),
    history,
    permission: plan.permission,
    postponed: history.filter((entry) => entry.status === 'postponed' || entry.status === 'suppressed'),
    quietHoursActive: plan.quietHoursActive,
    settings: plan.settings,
    upcoming: plan.upcoming,
  }
}

export function showNotificationDelivery(delivery) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (window.Notification.permission !== 'granted') return false

  new window.Notification(sanitizeNotificationTitle(delivery.title), {
    body: safeText(delivery.body, 'Du har en frivillig påminnelse i Viktkollen.', 160),
    tag: safeText(delivery.tag || delivery.id, 'viktkollen-notification', 80),
  })

  return true
}

export const notificationEngineInternals = {
  hashText,
  maskEntityId,
  safeText,
}
