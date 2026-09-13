import { ensurePlacePushSubscription } from '../../features/place/placePushService.js'

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export async function requestReminderNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, permission: 'unsupported' }
  }

  // ensurePlacePushSubscription starts Notification.requestPermission() before
  // its first await. This is important on iPhone because the permission prompt
  // must be triggered directly by the user's tap. It also registers the shared
  // service worker and stores the push subscription used by reminder-push.
  const result = await ensurePlacePushSubscription()
  if (result?.error) {
    return {
      ok: false,
      permission: window.Notification.permission,
      error: result.error,
    }
  }

  return {
    ok: window.Notification.permission === 'granted' && Boolean(result?.data?.enabled),
    permission: window.Notification.permission,
  }
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
