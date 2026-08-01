const CACHE_VERSION = 'v2'
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
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
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
