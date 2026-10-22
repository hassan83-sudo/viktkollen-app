import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { horizontalOverflow, openApp } from './support/app.js'

test('mobile wardrobe: raster photo consent, outfits, mannequin and no automatic AI upload', async ({ page }, testInfo) => {
  const uploads = []
  await page.route('**/api/**', async (route) => {
    // Vite serves a few shared client-safe modules from /api/_shared.
    if (new URL(route.request().url()).pathname.endsWith('.js')) { await route.continue(); return }
    if (/object-bank-scan|analysis-consent/.test(route.request().url())) uploads.push(route.request().url())
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' })
  })
  await openApp(page)
  await page.getByRole('button', { name: /Smart kamera och AI-ögon/ }).first().click()
  await page.getByRole('button', { name: /Kläder & stil/ }).click()
  const wardrobe = page.getByRole('region', { name: 'Din garderob', exact: true })
  await expect(wardrobe).toBeVisible()
  // Synthetic raster generated in the browser; no customer photo or backend required.
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800; canvas.height = 1000
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#2255aa'; ctx.fillRect(0, 0, 800, 1000)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await wardrobe.getByLabel('Fotografera eller välj bild').setInputFiles({ name: 'synthetic-shirt.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await expect(wardrobe.getByAltText('Förhandsvisning av nytt plagg')).toBeVisible()
  await wardrobe.getByLabel('Plaggets namn').fill('Blå testtröja')
  await expect(wardrobe.getByRole('button', { name: 'Spara plagg' })).toBeDisabled()
  await wardrobe.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }).check()
  await wardrobe.getByRole('button', { name: 'Spara plagg' }).click()
  await wardrobe.getByRole('checkbox', { name: 'Blå testtröja · Tröja' }).check()
  await expect(wardrobe.getByRole('img', { name: /Schematisk 2D-docka/ })).toBeVisible()
  await wardrobe.getByLabel('Outfitens namn').fill('Mobil outfit')
  await wardrobe.getByRole('button', { name: 'Spara outfit' }).click()
  await wardrobe.getByRole('button', { name: 'Avmarkera alla' }).click()
  await wardrobe.getByRole('button', { name: 'Välj Mobil outfit' }).click()
  await expect(wardrobe.getByRole('checkbox', { name: 'Blå testtröja · Tröja' })).toBeChecked()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    expect(await wardrobe.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  }
  await wardrobe.getByRole('form', { name: 'Lägg till plagg' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('wardrobe-mobile-form.png') })
  await wardrobe.getByRole('img', { name: /Schematisk 2D-docka/ }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('wardrobe-mobile-mannequin.png') })
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('viktkollen.notice.wardrobe.v1')))
  expect(stored.worn).toEqual([])
  expect(stored.garments[0].image).toMatch(/^data:image\/jpeg;base64,/)
  expect(uploads).toEqual([])
  await wardrobe.getByRole('button', { name: 'Ta bort Blå testtröja' }).click()
  await wardrobe.getByRole('button', { name: 'Bekräfta radering' }).click()
  await expect(wardrobe.getByRole('checkbox')).toHaveCount(0)
})
