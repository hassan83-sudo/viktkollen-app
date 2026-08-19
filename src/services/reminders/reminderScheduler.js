import { normalizeReminderState, weekDays } from './reminderModel.js'

const dayMs = 86400000
const weekdayFromDate = (date) => weekDays[(date.getDay() + 6) % 7]
const isValidDate = (date) => date instanceof Date && Number.isFinite(date.getTime())

function atLocalTime(date, time) {
  const [hours, minutes] = String(time || '09:00').split(':').map(Number)
  const next = new Date(date)
  next.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return next
}

function dateText(date) {
  if (!isValidDate(date)) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDateAllowed(reminder, candidate) {
  const localDate = dateText(candidate)
  if (reminder.startDate && localDate < reminder.startDate) return false
  if (reminder.endDate && localDate > reminder.endDate) return false
  return true
}

export function getNextReminderAt(reminder, options = {}) {
  if (!reminder || !reminder.enabled || reminder.archivedAt || reminder.pausedAt || reminder.needsReview) return null
  const now = new Date(options.now || Date.now())
  if (Number.isNaN(now.getTime())) return null
  if (reminder.snoozedUntil && new Date(reminder.snoozedUntil) > now) return reminder.snoozedUntil

  if (reminder.scheduleType === 'once') {
    const candidate = atLocalTime(new Date(`${reminder.startDate || dateText(now)}T12:00:00`), reminder.time)
    return candidate > now && isDateAllowed(reminder, candidate) ? candidate.toISOString() : null
  }

  if (reminder.scheduleType === 'interval') {
    const base = reminder.lastTriggeredAt ? new Date(reminder.lastTriggeredAt) : now
    const safeBase = isValidDate(base) ? base : now
    const interval = Math.max(60, reminder.intervalMinutes || 60) * 60000
    const candidate = new Date(safeBase.getTime() + interval)
    return isValidDate(candidate) && isDateAllowed(reminder, candidate) ? candidate.toISOString() : null
  }

  for (let offset = 0; offset < 370; offset += 1) {
    const date = new Date(now.getTime() + offset * dayMs)
    const candidate = atLocalTime(date, reminder.time)
    if (candidate <= now) continue
    if (reminder.scheduleType === 'weekly' && !reminder.daysOfWeek.includes(weekdayFromDate(candidate))) continue
    if (!isDateAllowed(reminder, candidate)) continue
    return candidate.toISOString()
  }

  return null
}

export function getDueReminders(state, options = {}) {
  const now = new Date(options.now || Date.now())
  const normalized = normalizeReminderState(state, options)
  if (Number.isNaN(now.getTime())) return []

  return normalized.reminders.filter((reminder) => {
    if (!reminder.enabled || reminder.archivedAt || reminder.pausedAt || reminder.needsReview) return false
    if (reminder.snoozedUntil && new Date(reminder.snoozedUntil) > now) return false
    if (reminder.lastTriggeredAt && dateText(new Date(reminder.lastTriggeredAt)) === dateText(now)) return false
    if (reminder.scheduleType === 'interval') {
      if (!reminder.lastTriggeredAt) return false
      const lastTriggeredAt = new Date(reminder.lastTriggeredAt).getTime()
      if (!Number.isFinite(lastTriggeredAt)) return false
      return lastTriggeredAt + Math.max(60, reminder.intervalMinutes || 60) * 60000 <= now.getTime()
    }

    const candidate = atLocalTime(now, reminder.time)
    if (candidate > now || !isDateAllowed(reminder, candidate)) return false
    if (reminder.scheduleType === 'weekly' && !reminder.daysOfWeek.includes(weekdayFromDate(candidate))) return false
    return true
  })
}

export function buildReminderStatus(state, options = {}) {
  const normalized = normalizeReminderState(state, options)
  const due = getDueReminders(normalized, options)
  const nextReminderAt = normalized.reminders
    .map((reminder) => getNextReminderAt(reminder, options))
    .filter(Boolean)
    .sort()[0] || ''

  return {
    currentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    dueCount: due.length,
    enabledCount: normalized.reminders.filter((reminder) => reminder.enabled && !reminder.archivedAt).length,
    latestError: '',
    nextReminderAt,
    notificationCapability: typeof window !== 'undefined' && 'Notification' in window,
    pausedCount: normalized.reminders.filter((reminder) => reminder.pausedAt && !reminder.archivedAt).length,
    permissionState: typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported',
    schedulerRunning: false,
    snoozedCount: normalized.reminders.filter((reminder) => reminder.snoozedUntil && new Date(reminder.snoozedUntil) > new Date(options.now || Date.now())).length,
  }
}

export function createReminderScheduler({ getState, onDue, setTimer = setTimeout, clearTimer = clearTimeout, now = () => new Date() }) {
  let timerId = null
  let stopped = true

  function clear() {
    if (timerId !== null) clearTimer(timerId)
    timerId = null
  }

  function tick() {
    if (stopped) return
    const current = now()
    const state = getState()
    const due = getDueReminders(state, { now: current.toISOString() })
    if (due.length) onDue(due, current)
    schedule()
  }

  function schedule() {
    clear()
    if (stopped) return
    const current = now()
    const nextAt = buildReminderStatus(getState(), { now: current.toISOString() }).nextReminderAt
    const delay = nextAt ? Math.max(1000, Math.min(3600000, new Date(nextAt).getTime() - current.getTime())) : 3600000
    timerId = setTimer(tick, delay)
  }

  return {
    recalculate: schedule,
    start() {
      if (!stopped) return
      stopped = false
      tick()
    },
    stop() {
      stopped = true
      clear()
    },
  }
}
