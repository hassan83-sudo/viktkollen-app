import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, shouldRegisterServiceWorker } from './registerServiceWorker.js'

function rootFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function rootStat(path) {
  return statSync(new URL(`../${path}`, import.meta.url))
}

describe('PWA V1 contract', () => {
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

  it('keeps service worker caching limited to app shell and static same-origin assets', () => {
    const serviceWorker = rootFile('public/sw.js')

    expect(serviceWorker).toContain('viktkollen-app-shell-v1')
    expect(serviceWorker).toContain('viktkollen-static-v1')
    expect(serviceWorker).toContain("requestUrl.pathname.startsWith('/api/')")
    expect(serviceWorker).toContain("requestUrl.origin !== self.location.origin")
    expect(serviceWorker).toContain("request.mode === 'navigate'")
    expect(serviceWorker).toContain("caches.match('/index.html')")
    expect(serviceWorker).not.toMatch(/supabase|auth|localStorage|indexedDB/i)
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

  it('registers the service worker in production when supported', async () => {
    const registration = { scope: '/' }
    const register = vi.fn().mockResolvedValue(registration)
    const result = await registerServiceWorker({
      isProduction: true,
      serviceWorker: { register },
    })

    expect(register).toHaveBeenCalledWith('/sw.js')
    expect(result).toEqual({ registered: true, registration })
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
})
