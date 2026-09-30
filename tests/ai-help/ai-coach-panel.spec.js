import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from '../a11y/support/app.js'

test('the coach panel answers a local question and a follow-up offline', async ({ page }) => {
  const chatCalls = []
  page.on('request', (request) => {
    const url = request.url()
    const body = request.postData() || ''
    const isChatQuestion = /Hur fungerar vikttrend|förklara det enklare/.test(body)
    if (url.includes('api.openai.com') || (url.includes('/api/ai') && !url.includes('/api/ai-help') && isChatQuestion)) {
      chatCalls.push(url)
    }
  })

  await openApp(page)
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: /^AI Coach/ }).first()
  await folder.click()
  await expect(page.locator('#app-section-coach')).toHaveClass(/is-active/)
  const panel = page.locator('#chat')
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByRole('heading', { name: 'Fråga AI-coachen' })).toBeVisible()

  const input = panel.getByRole('textbox', { name: 'Fråga till AI Coach' })
  await expect(input).toBeVisible()
  await expect(panel.getByText('Hur fungerar vikttrend?')).toHaveCount(0)

  await input.fill('Hur fungerar vikttrend?')
  await panel.getByRole('button', { name: 'Skicka' }).click()
  await expect(panel.getByText('Hur fungerar vikttrend?')).toBeVisible()
  await expect(panel.getByText(/flera veckor/)).toBeVisible()

  await input.fill('Kan du förklara det enklare?')
  await panel.getByRole('button', { name: 'Skicka' }).click()
  await expect(panel.getByText('Kan du förklara det enklare?')).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Fråga AI-coachen' })).toBeVisible()
  await expect(panel.getByText('AI-coachen använder lokal fallback just nu.')).toHaveCount(0)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  expect(chatCalls).toEqual([])
})

test('a complex coach question uses the new coach route once and keeps the local answer', async ({ page }) => {
  const coachCalls = []
  const openaiCalls = []
  await page.route('**/api/ai-coach', async (route) => {
    coachCalls.push(route.request().postData() || '')
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'Fokusera på en promenad den här veckan.',
        ok: true,
        source: 'openai',
        status: 'answered',
      }),
    })
  })
  page.on('request', (request) => {
    if (request.url().includes('api.openai.com')) openaiCalls.push(request.url())
    if (request.url().includes('/api/ai') && !request.url().includes('/api/ai-coach') && !request.url().includes('/api/ai-help')) {
      const body = request.postData() || ''
      if (/fokusera|vikttrend/.test(body)) coachCalls.push(`old:${body}`)
    }
  })

  await openApp(page)
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /^AI Coach/ }).first().click()
  await expect(page.locator('#app-section-coach')).toHaveClass(/is-active/)
  const panel = page.locator('#chat')
  await panel.scrollIntoViewIfNeeded()
  const input = panel.getByRole('textbox', { name: 'Fråga till AI Coach' })

  await input.fill('Hur fungerar vikttrend?')
  await panel.getByRole('button', { name: 'Skicka' }).click()
  await expect(panel.getByText(/flera veckor/)).toBeVisible()
  expect(coachCalls).toEqual([])

  await input.fill('Utifrån min vecka, vad tycker du att jag ska fokusera på?')
  await panel.getByRole('button', { name: 'Skicka' }).dblclick()
  await expect(panel.getByText('AI-coachen formulerar ett svar.')).toBeVisible()
  await expect(panel.getByText('Fokusera på en promenad den här veckan.')).toBeVisible()
  await expect(panel.getByText(/flera veckor/)).toBeVisible()
  expect(coachCalls).toHaveLength(1)
  expect(coachCalls[0]).not.toMatch(/secret@|OPENAI_API_KEY|SERVICE_ROLE/)
  expect(openaiCalls).toEqual([])
})
