self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Viktkollen', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Viktkollen'
  const options = {
    body: payload.body || 'Ny platsnotis',
    data: payload.data || { url: '/?section=place' },
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.safePlaceId ? `place-${payload.data.safePlaceId}-${payload.data.type || 'update'}` : 'place-update',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/?section=place', self.location.origin).href

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
