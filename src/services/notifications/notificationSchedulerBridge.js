import {
  buildNotificationPlan,
  recordNotificationEvent,
  showNotificationDelivery,
} from './notificationEngine.js'

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
