import { expect, test } from '@playwright/test'
import { openApp, goToSection, horizontalOverflow } from '../a11y/support/app.js'

async function openHelp(page) {
  await openApp(page)
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /Inställningar/ }).click()
  const panel = page.getByRole('region', { name: 'AI-Hjälp', exact: true })
  await panel.getByRole('button', { name: 'Öppna AI-Hjälp' }).click()
  return panel
}

test('free accounts get AI help and no human support submission form', async ({ page }) => {
  await page.route('**/api/support', (route) => route.fulfill({ json: { ok: true, eligible: false, tickets: [] } }))
  const help = await openHelp(page)
  const support = help.getByRole('region', { name: 'Mänsklig support' })
  await support.getByRole('button', { name: 'Kontrollera supportåtkomst' }).click()
  await expect(support.getByText('Inga ärenden.')).toBeVisible()
  await expect(support.getByRole('button', { name: 'Skicka supportärende' })).toHaveCount(0)
  await expect(help.getByRole('textbox', { name: 'Fråga om Viktkollen' })).toBeVisible()
})

test('a paid request enters the admin queue, can be prioritized and receives a human reply', async ({ page }) => {
  let tickets = []
  // Both admin panels mount together. Keep Security Center's independent
  // polling endpoint inside this offline fixture instead of Vite's HTML fallback.
  await page.route('**/api/security-center', (route) => route.fulfill({ json: { ok: true, events: [] } }))
  await page.route('**/api/billing/capability', (route) => route.fulfill({ json: { ok: true, billing_admin: true } }))
  await page.route('**/api/support**', async (route) => {
    const admin = route.request().url().includes('resource=admin')
    const command = route.request().method() === 'POST' ? route.request().postDataJSON() : null
    if (command?.action === 'create') {
      expect(command).not.toHaveProperty('user_id')
      tickets = [{ id: '10000000-0000-4000-8000-000000000001', category: command.category, priority: 'high', status: 'open', version: 1, notification_pending: true, created_at: '2026-10-17T12:00:00Z', thread: [{ role: 'customer', message: command.message }] }]
    } else if (command?.action === 'update') {
      tickets[0] = { ...tickets[0], priority: command.priority, status: command.status, version: 2, notification_pending: false }
    } else if (command?.action === 'reply') {
      tickets[0] = { ...tickets[0], thread: [...tickets[0].thread, { role: admin ? 'support' : 'customer', message: command.message }], version: 3, status: 'answered', notification_pending: false }
    }
    await route.fulfill({ json: command ? { ok: true, ticket: tickets[0] } : { ok: true, eligible: true, pendingCount: tickets.filter((t) => t.notification_pending).length, tickets } })
  })
  const help = await openHelp(page)
  await expect(page.getByRole('region', { name: 'Säkerhetscentral' })).toContainText('0 senaste händelser.')
  const support = help.getByRole('region', { name: 'Mänsklig support' })
  await support.getByRole('button', { name: 'Kontrollera supportåtkomst' }).click()
  await support.getByRole('combobox').selectOption('billing')
  await support.getByRole('textbox', { name: 'Meddelande' }).fill('Jag behöver hjälp med en betalningsfråga.')
  await support.getByRole('button', { name: 'Skicka supportärende' }).click()
  await expect(support.getByText('Ärendet är sparat. Svaret visas här.')).toBeVisible()
  const queue = page.getByRole('region', { name: 'Supportärenden', exact: true })
  await queue.getByRole('button', { name: 'Uppdatera ärenden' }).click()
  await expect(queue.getByText('Nya supportförfrågningar: 1')).toBeVisible()
  await queue.getByRole('combobox', { name: 'Prioritet' }).selectOption('normal')
  await queue.getByRole('combobox', { name: 'Status' }).selectOption('in_progress')
  await queue.getByRole('button', { name: 'Spara', exact: true }).click()
  await expect(queue.getByText('Nya supportförfrågningar: 0')).toBeVisible()
  await queue.getByRole('textbox', { name: 'Meddelande' }).fill('Vi hjälper dig med betalningsfrågan här.')
  await queue.getByRole('button', { name: 'Svara', exact: true }).click()
  await expect(queue.getByText('Vi hjälper dig med betalningsfrågan här.', { exact: false })).toBeVisible()
  await support.getByRole('button', { name: 'Uppdatera ärenden' }).click()
  await expect(support.getByText('Vi hjälper dig med betalningsfrågan här.', { exact: false })).toBeVisible()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

test('explicit scanner navigation uses the real app intent; AI-Hjälp itself never requests the camera', async ({ page }) => {
  // API response is mocked; the browser still exercises the actual App/More/Nutrition navigation.
  // The food scanner starts its live camera by itself once it is on screen (existing product
  // behaviour, also on manual navigation). AI-Hjälp must not ask for the camera before that.
  await page.route('**/api/ai-help', (route) => route.fulfill({ json: { ok: true, status: 'answered', source: 'local', answer: 'Öppnar matscanningen.', featureIds: ['more.nutrition'], tool: { name: 'open-section', sectionId: 'nutrition', targetId: 'nutrition-scanner-v2' } } }))
  await page.addInitScript(() => {
    window.__cameraCallsBeforeScanner = 0
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        if (!document.querySelector('#nutrition-scanner-v2')) window.__cameraCallsBeforeScanner++
        throw new Error('Camera is not available in this test')
      }
    }
  })
  const help = await openHelp(page)
  await help.getByRole('textbox', { name: 'Fråga om Viktkollen' }).fill('Ta mig till matscanningen')
  await help.getByRole('button', { name: 'Skicka', exact: true }).click()
  await expect(page.locator('#nutrition-scanner-v2')).toBeVisible()
  expect(await page.evaluate(() => window.__cameraCallsBeforeScanner)).toBe(0)
})

test('the same help panel switches Swedish, English, Arabic and Spanish', async ({ page }) => {
  const sentLanguages = []
  await page.route('**/api/ai-help', async (route) => {
    const body = route.request().postDataJSON()
    sentLanguages.push(body.language)
    const answers = { sv: 'Verifierat testsvar.', en: 'Verified test reply.', ar: 'رد اختباري موثق.', es: 'Respuesta de prueba verificada.' }
    await route.fulfill({ json: { ok: true, status: 'answered', answer: answers[body.language], featureIds: ['settings.language'] } })
  })
  await openHelp(page)
  const languages = [
    ['sv','AI-Hjälp','Fråga om Viktkollen','Skicka','ltr'],
    ['en','AI Help','Ask about Viktkollen','Send','ltr'],
    ['ar','مساعدة الذكاء الاصطناعي','اسأل عن Viktkollen','إرسال','rtl'],
    ['es','Ayuda IA','Pregunta sobre Viktkollen','Enviar','ltr'],
  ]
  for (const [code, title, placeholder, send, direction] of languages) {
    await page.locator('.profile-settings-panel select').selectOption(code)
    const help = page.getByRole('region', { name: title, exact: true })
    await expect(help).toHaveAttribute('lang', code)
    await expect(help).toHaveAttribute('dir', direction)
    await help.getByRole('textbox', { name: placeholder }).fill('Viktkollen?')
    await help.getByRole('button', { name: send, exact: true }).click()
    await expect(help.getByRole('button', { name: send, exact: true })).toBeDisabled()
    await expect(help.getByRole('log')).toContainText(({ sv: 'Verifierat testsvar.', en: 'Verified test reply.', ar: 'رد اختباري موثق.', es: 'Respuesta de prueba verificada.' })[code])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  }
  expect(sentLanguages).toEqual(['sv','en','ar','es'])
})
