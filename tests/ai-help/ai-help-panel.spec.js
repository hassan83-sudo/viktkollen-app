import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from '../a11y/support/app.js'
import { answerPlanQuestion } from '../../api/_shared/aiHelp/planAnswers.js'

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
  await expect(panel.getByText('Fråga om hur appen fungerar, eller om konto, abonnemang, plan, kvoter och betalningsstatus.')).toBeVisible()

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

for (const language of ['sv', 'en', 'es', 'ar']) {
  test(`formatted plan and long answers fit a 320px screen in ${language}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    const reply = await answerPlanQuestion({ question: 'Compare 9 kr and 19 kr', language: { code: language }, reader: async () => ({ plans: [9, 19].map((price) => ({
      priceText: `${price} kr/mån`, complete: true,
      quotas: [{ key: 'ai_coach', limit: price * 10 }, { key: 'food_scan', limit: price * 2 }],
      unlimited: [{ key: 'friend_chat' }],
    })) }) })
    await page.route('**/api/ai-help', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ ...reply, answer: `${reply.answer}\n\n${'Kontrollera uppgifterna. '.repeat(40)}\n\n${'x'.repeat(240)}\n\n<img src=x onerror=alert(1)>` }),
    }))
    await openApp(page)
    await goToSection(page, 'Mer', 'more')
    await page.locator('#app-section-more').getByRole('button', { name: /Inställningar/ }).click()
    await page.getByRole('combobox', { name: 'Språk / Language', exact: true }).selectOption(language)
    const panel = page.locator('.ai-help-panel')
    await panel.locator('.panel-heading button').click()
    await panel.getByRole('textbox').fill('Compare 9 kr and 19 kr')
    const response = page.waitForResponse((item) => item.url().includes('/api/ai-help'))
    await panel.locator('button[type="submit"]').click()
    expect((await response).status()).toBe(200)
    const answer = panel.locator('.ai-help-answer')
    await expect(answer.getByRole('heading')).toHaveCount(3)
    await expect(answer.getByRole('list')).toHaveCount(5)
    await expect(answer.locator('p')).not.toHaveCount(1)
    await expect(panel).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr')
    await expect(answer.locator('img,script,a')).toHaveCount(0)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    expect(await answer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `test-results/ai-help-layout-${language}.png`, fullPage: true })
  })
}
