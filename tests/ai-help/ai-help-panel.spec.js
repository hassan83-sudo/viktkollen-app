import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from '../a11y/support/app.js'

test('AI Help renders, opens and closes on a phone-sized screen', async ({ page }) => {
  await openApp(page)
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /Inställningar/ }).click()

  const panel = page.getByRole('region', { name: 'AI-Hjälp' })
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('lang', 'sv')
  await expect(panel).toHaveAttribute('dir', 'ltr')

  await panel.getByRole('button', { name: 'Öppna AI-Hjälp' }).click()
  const question = panel.getByRole('textbox', { name: 'Fråga om Viktkollen' })
  await expect(question).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Skicka' })).toBeVisible()
  await expect(panel.getByText('Ställ en fråga om hur Viktkollen fungerar.')).toBeVisible()

  const box = await question.boundingBox()
  expect(box?.width).toBeGreaterThan(120)
  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

  await panel.getByRole('button', { name: 'Stäng' }).click()
  await expect(question).toBeHidden()
  await expect(panel.getByRole('button', { name: 'Öppna AI-Hjälp' })).toBeVisible()
})

test('a help question reaches the test API and does not reveal a server key', async ({ page }) => {
  await openApp(page)
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /Inställningar/ }).click()
  const panel = page.getByRole('region', { name: 'AI-Hjälp' })
  await panel.getByRole('button', { name: 'Öppna AI-Hjälp' }).click()
  await panel.getByRole('textbox', { name: 'Fråga om Viktkollen' }).fill('Hur öppnar jag Mer?')

  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/ai-help'))
  await panel.getByRole('button', { name: 'Skicka' }).click()
  const response = await responsePromise
  const body = await response.json()

  expect(response.headers()['content-type']).toContain('application/json')
  expect(body.ok).toBe(false)
  expect(body.error?.code).toBeTruthy()
  expect(JSON.stringify(body)).not.toMatch(/OPENAI_API_KEY|sk-/)
  await expect(panel.getByText(/Logga in för att använda AI-Hjälp|AI-Hjälpen kunde inte svara just nu/)).toBeVisible()
})
