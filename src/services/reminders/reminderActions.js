import { normalizeReminderState, reminderHistoryLimit } from './reminderModel.js'

function withHistory(state, reminderId, action, options = {}) {
  const now = options.now || new Date().toISOString()

  return {
    ...state,
    history: [
      ...state.history,
      {
        action,
        at: now,
        id: `${action}-${reminderId}-${now}`,
        reminderId,
      },
    ].slice(-reminderHistoryLimit),
    updatedAt: now,
  }
}

function updateReminder(state, reminderId, updater, action, options = {}) {
  const normalized = normalizeReminderState(state, options)
  let changed = false
  const reminders = normalized.reminders.map((reminder) => {
    if (reminder.id !== reminderId) return reminder
    changed = true
    return {
      ...updater(reminder),
      updatedAt: options.now || new Date().toISOString(),
    }
  })
  const nextState = { ...normalized, reminders }

  return changed ? withHistory(nextState, reminderId, action, options) : normalized
}

export function completeReminder(state, reminderId, options = {}) {
  const now = options.now || new Date().toISOString()
  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    lastCompletedAt: reminder.lastCompletedAt === now ? reminder.lastCompletedAt : now,
    snoozedUntil: '',
  }), 'completed', options)
}

export function skipReminder(state, reminderId, options = {}) {
  const now = options.now || new Date().toISOString()
  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    lastSkippedAt: now,
    lastTriggeredAt: reminder.lastTriggeredAt || now,
    snoozedUntil: '',
  }), 'skipped', options)
}

export function snoozeReminder(state, reminderId, minutes = 30, options = {}) {
  const nowDate = new Date(options.now || Date.now())
  const safeMinutes = Math.max(5, Math.min(240, Math.round(Number(minutes) || 30)))
  const snoozedUntil = new Date(nowDate.getTime() + safeMinutes * 60000).toISOString()

  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    snoozedUntil,
  }), 'snoozed', { ...options, now: nowDate.toISOString() })
}

export function archiveReminder(state, reminderId, options = {}) {
  const now = options.now || new Date().toISOString()
  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    archivedAt: reminder.archivedAt || now,
    enabled: false,
  }), 'archived', options)
}

export function restoreReminder(state, reminderId, options = {}) {
  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    archivedAt: '',
    enabled: false,
    pausedAt: '',
  }), 'restored', options)
}

export function pauseReminder(state, reminderId, options = {}) {
  const now = options.now || new Date().toISOString()
  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    enabled: false,
    pausedAt: reminder.pausedAt || now,
  }), 'paused', options)
}

export function resumeReminder(state, reminderId, options = {}) {
  return updateReminder(state, reminderId, (reminder) => ({
    ...reminder,
    enabled: true,
    pausedAt: '',
  }), 'resumed', options)
}
