self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Viktkollen', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Viktkollen'
  const data = payload.data || { url: '/#app-section-notices' }
  const isReminder = data.type === 'reminder'
  const tag = isReminder && data.reminderId
    ? `reminder-${data.reminderId}`
    : data.safePlaceId
      ? `place-${data.safePlaceId}-${data.type || 'update'}`
      : 'viktkollen-update'

  const options = {
    body: payload.body || (isReminder ? 'Du har en påminnelse i Viktkollen.' : 'Ny platsnotis'),
    data,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/#app-section-notices', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(targetUrl)
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
  })())
})
