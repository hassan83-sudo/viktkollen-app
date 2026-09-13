const CACHE_VERSION = 'v4'
const APP_SHELL_CACHE = `viktkollen-app-shell-${CACHE_VERSION}`
const ASSET_CACHE = `viktkollen-assets-${CACHE_VERSION}`
const IMAGE_CACHE = `viktkollen-images-${CACHE_VERSION}`
const CACHE_NAMES = [APP_SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE]

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
]

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin
}

function shouldBypassCache(requestUrl) {
  const path = requestUrl.pathname.toLowerCase()

  if (path.startsWith('/assets/')) return false

  return (
    !isSameOrigin(requestUrl) ||
    path.startsWith('/api/') ||
    path.includes('/auth') ||
    path.includes('/supabase') ||
    path.includes('/openai')
  )
}

function isAppShellNavigation(request) {
  return request.mode === 'navigate'
}

function isAppAsset(requestUrl) {
  return isSameOrigin(requestUrl) && requestUrl.pathname.startsWith('/assets/')
}

function isAppImage(request) {
  const requestUrl = new URL(request.url)

  return isSameOrigin(requestUrl) && (
    request.destination === 'image' ||
    requestUrl.pathname.endsWith('.svg') ||
    requestUrl.pathname.endsWith('.png') ||
    requestUrl.pathname.endsWith('.jpg') ||
    requestUrl.pathname.endsWith('.jpeg') ||
    requestUrl.pathname.endsWith('.webp')
  )
}

async function cacheAppAssetsFromHtml(response) {
  const html = await response.clone().text().catch(() => '')
  const assetPaths = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith('/assets/'))

  if (assetPaths.length === 0) return

  const cache = await caches.open(ASSET_CACHE)
  await Promise.allSettled([...new Set(assetPaths)].map((path) => cache.add(path)))
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetched = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone())
    }

    return response
  }).catch(() => cached)

  return cached || fetched
}

async function networkFirstAppShell(request) {
  const cache = await caches.open(APP_SHELL_CACHE)

  try {
    const response = await fetch(request)

    if (response.ok) {
      await cache.put('/index.html', response.clone())
      await cacheAppAssetsFromHtml(response)
    }

    return response
  } catch {
    return (await cache.match('/index.html')) || cache.match('/')
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => fetch('/index.html'))
      .then((response) => {
        if (response.ok) return cacheAppAssetsFromHtml(response)
        return undefined
      })
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('viktkollen-') && !CACHE_NAMES.includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (shouldBypassCache(requestUrl)) return

  if (isAppShellNavigation(request)) {
    event.respondWith(networkFirstAppShell(request))
    return
  }

  if (isAppAsset(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE))
    return
  }

  if (isAppImage(request)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE))
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Viktkollen', body: event.data ? event.data.text() : '' }
  }

  const isReminder = payload.data?.type === 'reminder'
  const title = payload.title || 'Viktkollen'
  const reminderActions = isReminder && payload.data?.actionToken
    ? [
        { action: 'snooze-5', title: 'Snooze 5 min' },
        { action: 'done', title: 'Klar' },
      ]
    : undefined

  const options = {
    body: isReminder ? (payload.body || `Dags för ${title}.`) : (payload.body || 'Ny platsnotis'),
    data: payload.data || { url: isReminder ? '/?section=notices' : '/?section=place' },
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    actions: reminderActions,
    tag: isReminder
      ? `reminder-${payload.data?.reminderId || 'update'}`
      : payload.data?.safePlaceId
        ? `place-${payload.data.safePlaceId}-${payload.data.type || 'update'}`
        : 'viktkollen-update',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

async function sendReminderAction(data, action) {
  if (!data?.actionUrl || !data?.actionToken || !data?.scheduleId || !data?.reminderId) return false

  const payload = {
    action,
    actionToken: data.actionToken,
    scheduleId: data.scheduleId,
    reminderId: data.reminderId,
  }
  if (action === 'snooze') payload.minutes = 5

  try {
    const response = await fetch(data.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch {
    return false
  }
}

self.addEventListener('notificationclick', (event) => {
  const { action } = event
  const data = event.notification.data || {}
  event.notification.close()

  if (action === 'snooze-5' || action === 'done') {
    event.waitUntil(sendReminderAction(data, action === 'snooze-5' ? 'snooze' : 'done'))
    return
  }

  const targetUrl = new URL(data.url || '/', self.location.origin).href
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
