const APP_SHELL_CACHE = 'viktkollen-app-shell-v1'
const STATIC_CACHE = 'viktkollen-static-v1'
const CACHE_NAMES = [APP_SHELL_CACHE, STATIC_CACHE]

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
]

function isStaticAppAsset(requestUrl) {
  return requestUrl.origin === self.location.origin && (
    requestUrl.pathname.startsWith('/assets/') ||
    requestUrl.pathname === '/favicon.svg' ||
    requestUrl.pathname === '/manifest.webmanifest' ||
    requestUrl.pathname.startsWith('/pwa-icon-') ||
    requestUrl.pathname.startsWith('/pwa-maskable-')
  )
}

function isAppShellNavigation(request) {
  return request.mode === 'navigate'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !CACHE_NAMES.includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)

  if (requestUrl.origin !== self.location.origin) return
  if (requestUrl.pathname.startsWith('/api/')) return

  if (isAppShellNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    )
    return
  }

  if (isStaticAppAsset(requestUrl)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
          }

          return response
        })
      }),
    )
  }
})
