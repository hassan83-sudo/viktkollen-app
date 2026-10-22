import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

test('built offline wardrobe has no auth/cloud/AI dispatch and remains usable on mobile', async ({ page }) => {
  const outgoing = []
  const api = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://127.0.0.1:5195') { outgoing.push(url.origin); await route.abort(); return }
    if (url.pathname.startsWith('/api/')) { api.push(url.pathname); await route.abort(); return }
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Garderob – offline-Preview' })).toBeVisible()
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'self'")
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("worker-src 'none'")
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Fotografera eller välj bild').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await expect(page.getByText(/Offline-Preview: AI-analys/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analysera vald bild' })).toHaveCount(0)
  await page.getByLabel('Plaggets namn').fill('Offline tröja')
  await page.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }).check()
  await page.getByRole('button', { name: 'Spara plagg' }).click()
  await page.getByRole('checkbox', { name: 'Offline tröja · Tröja' }).check()
  await page.getByLabel('Outfitens namn').fill('Offline outfit')
  await page.getByRole('button', { name: 'Spara outfit' }).click()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Offline tröja · Tröja' })).toBeChecked()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
  // Deliberate negative probe: browser CSP must reject external connections before the route/network.
  expect(await page.evaluate(async () => { try { await fetch('https://offline-probe.invalid/'); return false } catch { return true } })).toBe(true)
  expect(outgoing).toEqual([])
  expect(api).toEqual([])
  await page.getByRole('button', { name: 'Ta bort Offline tröja' }).click()
  await page.getByRole('button', { name: 'Bekräfta radering' }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
})
