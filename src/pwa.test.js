import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  applyServiceWorkerUpdate,
  isStandaloneDisplayMode,
  PWA_CACHE_VERSION,
  registerServiceWorker,
  shouldRegisterServiceWorker,
  watchForServiceWorkerUpdate,
} from './registerServiceWorker.js'

function rootFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function rootStat(path) {
  return statSync(new URL(`../${path}`, import.meta.url))
}

function makeEventTarget() {
  const listeners = new Map()

  return {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    dispatch(type) {
      listeners.get(type)?.()
    },
    removeEventListener: vi.fn((type) => listeners.delete(type)),
  }
}

describe('PWA V2 contract', () => {
  it('defines an installable Swedish manifest', () => {
    const manifest = JSON.parse(rootFile('public/manifest.webmanifest'))

    expect(manifest.name).toBe('Viktkollen')
    expect(manifest.short_name).toBe('Viktkollen')
    expect(manifest.lang).toBe('sv')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.orientation).toBe('portrait')
    expect(manifest.theme_color).toBe('#168b9c')
    expect(manifest.background_color).toBe('#eaf0f6')
  })

  it('provides required app icons without external URLs', () => {
    const manifest = JSON.parse(rootFile('public/manifest.webmanifest'))
    const icons = manifest.icons || []

    expect(icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' }),
      expect.objectContaining({ src: '/pwa-maskable-512.png', purpose: 'maskable', sizes: '512x512', type: 'image/png' }),
    ]))
    icons.forEach((icon) => expect(icon.src).toMatch(/^\/[^/]/))
    expect(rootStat('public/pwa-icon-192.png').size).toBeGreaterThan(1000)
    expect(rootStat('public/pwa-icon-512.png').size).toBeGreaterThan(1000)
    expect(rootStat('public/pwa-maskable-512.png').size).toBeGreaterThan(1000)
  })

  it('links manifest, theme color and Apple metadata in HTML', () => {
    const html = rootFile('index.html')

    expect(html).toContain('<html lang="sv">')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<meta name="theme-color" content="#168b9c" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/pwa-icon-192.png" />')
  })

  it('separates service worker caches and avoids dynamic data', () => {
    const serviceWorker = rootFile('public/sw.js')

    expect(serviceWorker).toContain("const CACHE_VERSION = 'v2'")
    expect(serviceWorker).toContain('viktkollen-app-shell-')
    expect(serviceWorker).toContain('viktkollen-assets-')
    expect(serviceWorker).toContain('viktkollen-images-')
    expect(serviceWorker).toContain("path.startsWith('/api/')")
    expect(serviceWorker).toContain("path.includes('/auth')")
    expect(serviceWorker).toContain("path.includes('/supabase')")
    expect(serviceWorker).toContain("path.includes('/openai')")
    expect(serviceWorker).not.toMatch(/localStorage|indexedDB/i)
  })

  it('uses stale-while-revalidate for assets and images with offline navigation fallback', () => {
    const serviceWorker = rootFile('public/sw.js')

    expect(serviceWorker).toContain('staleWhileRevalidate(request, ASSET_CACHE)')
    expect(serviceWorker).toContain('staleWhileRevalidate(request, IMAGE_CACHE)')
    expect(serviceWorker).toContain('networkFirstAppShell(request)')
    expect(serviceWorker).toContain("cache.match('/index.html')")
  })

  it('supports update activation via skipWaiting message', () => {
    const serviceWorker = rootFile('public/sw.js')
    const postMessage = vi.fn()

    expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(applyServiceWorkerUpdate({ waiting: { postMessage } })).toBe(true)
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(applyServiceWorkerUpdate({})).toBe(false)
  })

  it('does not register the service worker outside production', async () => {
    const register = vi.fn()
    const result = await registerServiceWorker({
      isProduction: false,
      serviceWorker: { register },
    })

    expect(result).toEqual({ registered: false, reason: 'unsupported-or-non-production' })
    expect(register).not.toHaveBeenCalled()
  })

  it('registers and watches the service worker in production when supported', async () => {
    const registration = makeEventTarget()
    const register = vi.fn().mockResolvedValue(registration)
    const onStatusChange = vi.fn()
    const result = await registerServiceWorker({
      isProduction: true,
      onStatusChange,
      serviceWorker: { register },
    })

    expect(register).toHaveBeenCalledWith('/sw.js')
    expect(result).toMatchObject({ registered: true, registration })
    expect(onStatusChange).toHaveBeenCalledWith('registered')
    expect(registration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function))
  })

  it('detects waiting service worker updates', () => {
    const registration = makeEventTarget()
    registration.waiting = { state: 'installed' }
    const onStatusChange = vi.fn()
    const onUpdateAvailable = vi.fn()

    watchForServiceWorkerUpdate(registration, {
      hasController: true,
      onStatusChange,
      onUpdateAvailable,
    })

    expect(onStatusChange).toHaveBeenCalledWith('update-ready')
    expect(onUpdateAvailable).toHaveBeenCalledWith(registration)
  })

  it('handles service worker registration failures without throwing', async () => {
    const error = new Error('blocked')
    const result = await registerServiceWorker({
      isProduction: true,
      serviceWorker: { register: vi.fn().mockRejectedValue(error) },
    })

    expect(result).toMatchObject({ error, registered: false, reason: 'registration-failed' })
  })

  it('requires production and service worker support before registering', () => {
    expect(shouldRegisterServiceWorker({ hasServiceWorker: true, isProduction: true })).toBe(true)
    expect(shouldRegisterServiceWorker({ hasServiceWorker: true, isProduction: false })).toBe(false)
    expect(shouldRegisterServiceWorker({ hasServiceWorker: false, isProduction: true })).toBe(false)
  })

  it('detects standalone display mode', () => {
    expect(isStandaloneDisplayMode({
      matchMedia: vi.fn(() => ({ matches: true })),
      navigatorRef: {},
    })).toBe(true)
    expect(isStandaloneDisplayMode({
      matchMedia: vi.fn(() => ({ matches: false })),
      navigatorRef: { standalone: true },
    })).toBe(true)
  })

  it('keeps install, update, offline and diagnostics UI accessible', () => {
    const source = rootFile('src/components/PwaExperience.jsx')

    expect(source).toContain('beforeinstallprompt')
    expect(source).toContain('appinstalled')
    expect(source).toContain('Ny version finns')
    expect(source).toContain('Uppdatera nu')
    expect(source).toContain('Offline')
    expect(source).toContain('role="status"')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain('PWA diagnostics')
    expect(PWA_CACHE_VERSION).toBe('v2')
  })
})
