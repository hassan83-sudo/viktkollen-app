import { expect, test } from '@playwright/test'

const requiredDistFiles = [
  '/manifest.webmanifest',
  '/sw.js',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
]

test.describe('release PWA contract', () => {
  test('serves manifest service worker and icons from production preview', async ({ page }) => {
    for (const path of requiredDistFiles) {
      const response = await page.request.get(path)
      expect(response.ok(), `${path} should be served`).toBe(true)
    }

    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({
      display: 'standalone',
      lang: 'sv',
      name: 'Viktkollen',
      short_name: 'Viktkollen',
      start_url: '/',
    })
    expect(manifest.icons?.some((icon) => icon.sizes === '192x192')).toBe(true)
    expect(manifest.icons?.some((icon) => icon.sizes === '512x512')).toBe(true)
    expect(manifest.icons?.some((icon) => String(icon.purpose || '').includes('maskable'))).toBe(true)
  })

  test('does not preload lazy release-gate or heavy feature chunks', async ({ page }) => {
    await page.goto('/')
    const preloadHrefs = await page.locator('link[rel="modulepreload"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute('href') || ''),
    )

    expect(preloadHrefs.join('\n')).not.toMatch(/ReminderCenter|LaunchReadinessPanel|CloudBackupPanel|ReportDrilldown/)
  })
})
