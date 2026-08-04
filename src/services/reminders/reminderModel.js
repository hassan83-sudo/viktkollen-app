export const reminderSchemaVersion = 2
export const reminderStorageKey = 'viktkollen.reminders.v2'
export const reminderMaxCount = 100
export const reminderHistoryLimit = 100
export const reminderNotificationHistoryLimit = 120

export const reminderTypes = [
  'habit',
  'goal',
  'check_in',
  'meal_log',
  'weight',
  'workout',
  'steps',
  'weekly_report',
  'monthly_report',
  'custom',
]

export const scheduleTypes = ['once', 'daily', 'weekly', 'interval']
export const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const unsafeTextPatterns = [
  /straff/i,
  /misslyck/i,
  /värdelös/i,
  /dum/i,
  /svält/i,
  /hoppa över (mat|måltid|frukost|lunch|middag)/i,
  /måste/i,
  /akut/i,
]

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

export function normalizeReminderText(value, fallback = '', max = 180) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeId(value, fallbackSeed = '') {
  const source = normalizeReminderText(value, '', 90)
  if (source) return source

  return `reminder-${String(fallbackSeed || Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`
}

export function createReminderId(seed = '', options = {}) {
  return normalizeId(options.id, `${seed}-${options.now || new Date().toISOString()}`)
}

export function isUnsafeReminderText(value) {
  const text = normalizeReminderText(value).toLocaleLowerCase('sv-SE')
  return unsafeTextPatterns.some((pattern) => pattern.test(text))
}

function normalizeTime(value, fallback = '09:00') {
  const text = String(value || '')
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback
}

function normalizeDateText(value) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function normalizeIntervalMinutes(value) {
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes)) return 0
  if (minutes < 60) return 0
  if (minutes > 10080) return 10080
  return minutes
}

export function normalizeReminder(reminder = {}, options = {}) {
  if (!isObject(reminder)) return null
  const now = options.now || new Date().toISOString()
  const type = reminderTypes.includes(reminder.type) ? reminder.type : 'custom'
  const scheduleType = scheduleTypes.includes(reminder.scheduleType) ? reminder.scheduleType : 'daily'
  const title = normalizeReminderText(reminder.title, defaultReminderTitle(type), 90)
  const description = normalizeReminderText(reminder.description, defaultReminderDescription(type), 240)
  const invalidSafetyText = isUnsafeReminderText(title) || isUnsafeReminderText(description)
  const intervalMinutes = scheduleType === 'interval' ? normalizeIntervalMinutes(reminder.intervalMinutes ?? reminder.interval) : 0
  const daysOfWeek = safeArray(reminder.daysOfWeek ?? reminder.days)
    .map((day) => normalizeReminderText(day))
    .filter((day) => weekDays.includes(day))

  return {
    archivedAt: reminder.archivedAt || '',
    createdAt: reminder.createdAt || now,
    daysOfWeek: daysOfWeek.length ? [...new Set(daysOfWeek)] : [...weekDays],
    description: invalidSafetyText ? defaultReminderDescription(type) : description,
    enabled: reminder.enabled !== false,
    endDate: normalizeDateText(reminder.endDate),
    id: normalizeId(reminder.id, `${type}-${title}-${reminder.createdAt || now}`),
    intervalMinutes,
    lastCompletedAt: reminder.lastCompletedAt || '',
    lastSkippedAt: reminder.lastSkippedAt || '',
    lastTriggeredAt: reminder.lastTriggeredAt || '',
    linkedEntityId: normalizeReminderText(reminder.linkedEntityId ?? reminder.linkedId, '', 120),
    linkedEntityType: normalizeReminderText(reminder.linkedEntityType ?? reminder.linkedType, '', 40),
    needsReview: reminder.needsReview === true || invalidSafetyText,
    pausedAt: reminder.pausedAt || (reminder.paused ? now : ''),
    safetyCategory: invalidSafetyText ? 'needs_review' : normalizeReminderText(reminder.safetyCategory, 'standard', 40),
    scheduleType,
    snoozedUntil: reminder.snoozedUntil || '',
    source: normalizeReminderText(reminder.source, 'user', 40),
    startDate: normalizeDateText(reminder.startDate) || normalizeDateText(now),
    time: normalizeTime(reminder.time),
    timezone: normalizeReminderText(reminder.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone || 'local', 80),
    title: invalidSafetyText ? defaultReminderTitle(type) : title,
    type,
    updatedAt: reminder.updatedAt || now,
  }
}

export function validateReminder(reminder = {}) {
  const normalized = normalizeReminder(reminder)
  if (!normalized) return { ok: false, errors: ['Remindern kunde inte läsas.'], reminder: null }

  const errors = []
  if (!normalized.title) errors.push('Titel saknas.')
  if (normalized.scheduleType === 'interval' && normalized.intervalMinutes < 60) {
    errors.push('Intervall behöver vara minst 60 minuter.')
  }
  if (normalized.needsReview) errors.push('Texten behöver vara neutral och trygg.')
  if (normalized.endDate && normalized.startDate && normalized.endDate < normalized.startDate) {
    errors.push('Slutdatum ligger före startdatum.')
  }

  return { errors, ok: errors.length === 0, reminder: normalized }
}

export function normalizeReminderState(value = {}, options = {}) {
  const source = isObject(value) ? value : {}
  const reminders = safeArray(source.reminders)
    .map((reminder) => normalizeReminder(reminder, options))
    .filter(Boolean)
    .slice(0, reminderMaxCount)
  const byId = new Map()
  reminders.forEach((reminder) => byId.set(reminder.id, reminder))

  return {
    history: safeArray(source.history).filter(isObject).map((entry) => ({
      action: normalizeReminderText(entry.action, 'updated', 50),
      at: entry.at || options.now || new Date().toISOString(),
      id: normalizeReminderText(entry.id, `history-${entry.reminderId || entry.at || Date.now()}`, 90),
      reminderId: normalizeReminderText(entry.reminderId, '', 90),
    })).slice(-reminderHistoryLimit),
    notificationsV3: normalizeReminderNotificationsV3(source.notificationsV3, options),
    reminders: [...byId.values()],
    schemaVersion: reminderSchemaVersion,
    smartCategories: isObject(source.smartCategories) ? { ...source.smartCategories } : {},
    updatedAt: source.updatedAt || options.now || new Date().toISOString(),
  }
}

function normalizeReminderNotificationsV3(value = {}, options = {}) {
  const source = isObject(value) ? value : {}
  const settings = isObject(source.settings) ? source.settings : {}
  const quietHours = isObject(settings.quietHours) ? settings.quietHours : {}
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

  return {
    history: safeArray(source.history).filter(isObject).map((entry) => ({
      at: entry.at || options.now || new Date().toISOString(),
      batchId: normalizeReminderText(entry.batchId, '', 120),
      id: normalizeReminderText(entry.id, `notification-${entry.at || Date.now()}`, 120),
      notificationId: normalizeReminderText(entry.notificationId, '', 120),
      reason: normalizeReminderText(entry.reason, '', 220),
      sourceIdMasked: normalizeReminderText(entry.sourceIdMasked, '', 80),
      sourceType: normalizeReminderText(entry.sourceType, 'reminder', 50),
      status: normalizeReminderText(entry.status, 'scheduled', 40),
      statusLabel: normalizeReminderText(entry.statusLabel, '', 80),
      title: normalizeReminderText(entry.title, 'Viktkollen', 90),
    })).slice(-reminderNotificationHistoryLimit),
    lastDeliveredAtBySource: isObject(source.lastDeliveredAtBySource) ? { ...source.lastDeliveredAtBySource } : {},
    settings: {
      batchingWindowMinutes: Math.max(5, Math.min(120, Math.round(Number(settings.batchingWindowMinutes) || 30))),
      enabled: settings.enabled !== false,
      quietHours: {
        enabled: quietHours.enabled !== false,
        end: timePattern.test(quietHours.end) ? quietHours.end : '07:00',
        start: timePattern.test(quietHours.start) ? quietHours.start : '22:00',
      },
    },
    version: 3,
  }
}

export function defaultReminderTitle(type) {
  const labels = {
    check_in: 'Dagens check-in',
    goal: 'Målpåminnelse',
    habit: 'Vanepåminnelse',
    meal_log: 'Måltidsloggning',
    monthly_report: 'Månadsrapport',
    steps: 'Steg',
    weekly_report: 'Veckorapport',
    weight: 'Viktregistrering',
    workout: 'Träning',
  }
  return labels[type] || 'Egen påminnelse'
}

export function defaultReminderDescription(type) {
  if (type === 'weight') return 'Registrera vikt när det passar dig.'
  if (type === 'meal_log') return 'Lägg till en måltid om du vill följa dagen.'
  if (type === 'check_in') return 'Gör en kort check-in om du vill.'
  if (type === 'habit') return 'Följ upp vanan i lugn takt.'
  return 'En neutral påminnelse från Viktkollen.'
}
