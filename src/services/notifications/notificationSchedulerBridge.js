import {
  buildNotificationPlan,
  recordNotificationEvent,
  showNotificationDelivery,
} from './notificationEngine.js'
import { readReminderSpeechSettings } from '../reminders/reminderCapabilities.js'

function speakDueReminders(due = []) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
  const settings = readReminderSpeechSettings()
  if (!settings.enabled) return

  const spoken = due.filter((reminder) => reminder.speakOnTrigger !== false)
  if (spoken.length === 0) return

  window.speechSynthesis.cancel()
  spoken.slice(0, 3).forEach((reminder) => {
    const reminderText = settings.includeSensitiveText
      ? (reminder.title || 'Du har en påminnelse i Viktkollen.')
      : 'Du har en påminnelse i Viktkollen.'
    const utterance = new SpeechSynthesisUtterance(reminderText)
    utterance.lang = document?.documentElement?.lang || 'sv-SE'
    window.speechSynthesis.speak(utterance)
  })
}

export function applyDueNotificationPlan(currentState, {
  adaptiveCoachFeedback,
  due = [],
  now,
  syncStatus,
} = {}) {
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now || Date.now()).toISOString()
  const plan = buildNotificationPlan({
    adaptiveCoachFeedback,
    dueReminders: due,
    reminderState: currentState,
    syncStatus,
  }, { now: nowIso })
  const delivered = plan.deliveries
    .slice(0, 3)
    .map((delivery) => showNotificationDelivery(delivery))
    .some(Boolean)

  speakDueReminders(due)

  return {
    ...recordNotificationEvent(currentState, {
      items: plan.deliveries.flatMap((delivery) => delivery.items),
      status: delivered ? 'delivered' : 'suppressed',
    }, { now: nowIso }),
    reminders: (Array.isArray(currentState.reminders) ? currentState.reminders : []).map((reminder) =>
      due.some((entry) => entry.id === reminder.id)
        ? { ...reminder, lastTriggeredAt: nowIso, updatedAt: nowIso }
        : reminder),
    updatedAt: nowIso,
  }
}
