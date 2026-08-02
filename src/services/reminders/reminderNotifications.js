export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export async function requestReminderNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, permission: 'unsupported' }
  }

  const permission = await window.Notification.requestPermission()
  return { ok: permission === 'granted', permission }
}

export function showReminderNotification(reminder) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (window.Notification.permission !== 'granted') return false

  new window.Notification(reminder.title || 'Påminnelse från Viktkollen', {
    body: 'Du har en frivillig påminnelse i Viktkollen.',
    tag: `viktkollen-reminder-${reminder.id}`,
  })

  return true
}
