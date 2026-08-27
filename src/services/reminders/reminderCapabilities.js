export function getReminderCapabilities(win = typeof window === 'undefined' ? undefined : window) {
  const hasWindow = typeof win !== 'undefined'
  const notification = hasWindow && 'Notification' in win
  const serviceWorker = hasWindow && 'serviceWorker' in win.navigator
  const push = hasWindow && 'PushManager' in win
  const standalone = hasWindow && (
    win.matchMedia?.('(display-mode: standalone)').matches ||
    win.navigator.standalone === true
  )

  return {
    appMode: standalone ? 'pwa' : 'browser',
    notification: notification ? win.Notification.permission : 'unsupported',
    push,
    serviceWorker,
    speech: hasWindow && 'speechSynthesis' in win && 'SpeechSynthesisUtterance' in win,
  }
}

export function readReminderSpeechSettings(storage = typeof window === 'undefined' ? undefined : window.localStorage) {
  try {
    return JSON.parse(storage?.getItem('viktkollen.reminderHub.speech.v1') || '{"enabled":false,"includeSensitiveText":false}')
  } catch {
    return { enabled: false, includeSensitiveText: false }
  }
}

export function saveReminderSpeechSettings(settings, storage = typeof window === 'undefined' ? undefined : window.localStorage) {
  const next = {
    enabled: settings?.enabled === true,
    includeSensitiveText: settings?.includeSensitiveText === true,
  }
  storage?.setItem('viktkollen.reminderHub.speech.v1', JSON.stringify(next))
  return next
}
