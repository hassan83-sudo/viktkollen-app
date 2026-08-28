function asArray(value) {
  return Array.isArray(value) ? value : []
}

function formatTimeLabel(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function mapReminderToEvent(reminder) {
  if (!reminder || typeof reminder !== 'object') return null
  if (reminder.enabled === false || reminder.paused || reminder.archived) return null
  const title = String(reminder.text || reminder.title || '').trim()
  if (!title) return null
  const timeLabel = formatTimeLabel(reminder.nextAt || reminder.time || reminder.scheduledAt)
  if (!timeLabel) return null
  return {
    id: reminder.id || `reminder-${title}-${timeLabel}`,
    source: 'reminder',
    timeLabel,
    title,
  }
}

export function buildReadyNextEvents({
  demoMode = false,
  readyItems = [],
  reminderState = null,
} = {}) {
  const fromReminders = asArray(reminderState?.reminders)
    .map(mapReminderToEvent)
    .filter(Boolean)

  const fromNotes = asArray(readyItems)
    .filter((item) => item?.note && !item.done)
    .map((item) => {
      const timeMatch = String(item.note).match(/\b(\d{1,2}:\d{2})\b/)
      if (!timeMatch) return null
      return {
        id: `item-${item.id}`,
        source: 'checklist',
        timeLabel: timeMatch[1],
        title: item.label,
      }
    })
    .filter(Boolean)

  const events = [...fromReminders, ...fromNotes]
    .sort((a, b) => String(a.timeLabel).localeCompare(String(b.timeLabel), 'sv'))
    .slice(0, 4)

  if (events.length > 0) return events

  if (demoMode) {
    return [
      { id: 'demo-leave', source: 'demo', timeLabel: '08:15', title: 'Dags att gå' },
      { id: 'demo-pe', source: 'demo', timeLabel: '10:20', title: 'Idrott' },
    ]
  }

  return []
}
