import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations, runAxe } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8Q: form feedback (8M B6), status messages (8M B7) and focus
// recovery after "Dölj" in Mat (8P finding).
//
// Announcements are verified semantically, not with a screen reader: the
// message must be in exactly one live region (role=status, polite) in
// Chrome's accessibility tree, the region must exist before the text arrives,
// and fields must expose aria-invalid and their description.

const moderate = ['critical', 'serious', 'moderate']

async function axNode(page, selector) {
  const cdp = await page.context().newCDPSession(page)
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  expect(nodeId, selector).toBeTruthy()
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
  await cdp.detach()
  const node = nodes[0]
  return {
    description: node.description?.value || '',
    name: node.name?.value || '',
    properties: Object.fromEntries((node.properties || []).map((property) => [property.name, property.value?.value])),
    role: node.role?.value,
  }
}

// Live regions (role status/alert/log or aria-live) whose text contains `text`.
function liveRegionsWith(page, text) {
  return page.evaluate((needle) => [...document.querySelectorAll('[role=status], [role=alert], [role=log], [aria-live]')]
    .filter((element) => element.getAttribute('aria-live') !== 'off' && element.textContent.includes(needle))
    .map((element) => ({ role: element.getAttribute('role') || '', text: element.textContent.trim() })), text)
}

async function tabTo(page, locator, maxStops = 80) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press('Tab')
    if (await locator.evaluate((element) => element === document.activeElement)) return
  }
  await expect(locator).toBeFocused()
}

test.describe('Redo "Lägg till sak" feedback (8M B6)', () => {
  const emptyError = 'Skriv vad du vill lägga till innan du sparar.'

  test('empty and blank input: visible message, announced once, field invalid and described; correction clears it', async ({ page }, testInfo) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Redo!', 'redo')
    const input = page.getByRole('textbox', { name: 'Lägg till sak' })
    const message = page.locator('#ready-add-error')

    // The status region exists (empty) before any error, so its first text
    // is announced.
    await expect(message).toHaveAttribute('role', 'status')
    await expect(message).toHaveText('')
    await expect(input).not.toHaveAttribute('aria-invalid', 'true')
    await expectNoBlockingAxeViolations(page, testInfo, 'redo-normal', { block: moderate })

    // A. Tab to the field, leave it empty, submit with Enter.
    await tabTo(page, input)
    await page.keyboard.press('Enter')
    await expect(message).toBeVisible()
    await expect(message).toHaveText(emptyError)
    await expect(input).toBeFocused()
    const field = await axNode(page, '.ready-add-form input')
    expect(field.properties.invalid).toBe('true')
    expect(field.description).toBe(emptyError)
    expect(await liveRegionsWith(page, emptyError)).toEqual([{ role: 'status', text: emptyError }])
    const region = await axNode(page, '#ready-add-error')
    expect(region.role).toBe('status')
    expect(region.properties.live).toBe('polite')
    await expectNoBlockingAxeViolations(page, testInfo, 'redo-validation-error', { block: moderate })

    // Nothing was added.
    const items = page.locator('.ready-item-list > li')
    const itemCount = await items.count()

    // B. Blank text: the same feedback, still nothing added; the save button
    // path keeps focus on the button.
    await input.fill('   ')
    await expect(message).toHaveText('')
    await page.getByRole('button', { name: 'Spara' }).focus()
    await page.keyboard.press('Enter')
    await expect(message).toHaveText(emptyError)
    await expect(page.getByRole('button', { name: 'Spara' })).toBeFocused()
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(items).toHaveCount(itemCount)

    // C. Correct it: the error, aria-invalid and the description go away as
    // soon as the text changes, and the item is added.
    await input.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Nycklar')
    await expect(message).toHaveText('')
    await expect(input).not.toHaveAttribute('aria-invalid', 'true')
    await expect(input).not.toHaveAttribute('aria-describedby', /.+/)
    await page.keyboard.press('Enter')
    await expect(page.locator('.ready-item-list')).toContainText('Nycklar')
    await expect(items).toHaveCount(itemCount + 1)
    await expect(message).toHaveText('')
    expect(await liveRegionsWith(page, emptyError)).toEqual([])
  })
})

const weatherBody = JSON.stringify({
  current: { apparent_temperature: 11, precipitation_probability: 10, temperature_2m: 12.3, time: '2026-09-25T10:00', weather_code: 1, wind_speed_10m: 3.2 },
  daily: { precipitation_probability_max: [10], sunrise: ['2026-09-25T07:00'], sunset: ['2026-09-25T19:00'] },
})

// Mocked boundaries (the production code is unchanged): the Open-Meteo API
// is answered by page.route, and geolocation is granted with a fixed
// position so the device path does not wait for a permission prompt.
async function openHomeWithWeather(page) {
  const state = { mode: 'fail', release: null }
  await page.route('https://api.open-meteo.com/**', async (route) => {
    if (state.mode === 'fail') return route.abort()
    await new Promise((resolve) => { state.release = resolve })
    return route.fulfill({ body: weatherBody, contentType: 'application/json' })
  })
  await openApp(page, { reducedMotion: 'reduce' })
  return state
}

test.describe('Home "Koppla väder" status (8M B7)', () => {
  test.use({ geolocation: { latitude: 59.33, longitude: 18.07 }, permissions: ['geolocation'] })

  test('start, failure, loading and success are each in one polite status region; focus is not moved', async ({ page }, testInfo) => {
    const weather = await openHomeWithWeather(page)
    const connect = page.getByRole('button', { name: 'Koppla väder' })
    const region = page.locator('.overview-live-meta [role=status]')
    const visible = page.locator('.overview-weather-empty')

    // A. Start: the automatic load on page open failed; nothing is announced,
    // and the visible text is what assistive technology gets.
    await expect(connect).toBeVisible()
    await expect(region).toHaveCount(1)
    await expect(region).toHaveText('')
    // The status text is no longer overridden by aria-label="Väder ej
    // anslutet" (which also hid "Hämtar väder…" from assistive technology).
    await expect(visible).not.toHaveAttribute('aria-label', /.*/)
    await expect(visible).toHaveText('Väder ej anslutet')

    // D. Failure (network error).
    await connect.focus()
    await page.keyboard.press('Enter')
    const failed = 'Vädret kunde inte hämtas. Försök igen.'
    await expect(region).toHaveText(failed)
    await expect(visible).toHaveText(failed)
    expect(await liveRegionsWith(page, failed)).toEqual([{ role: 'status', text: failed }])
    await expect(connect).toBeFocused()
    const status = await axNode(page, '.overview-live-meta [role=status]')
    expect(status.role).toBe('status')
    expect(status.properties.live).toBe('polite')
    await expectNoBlockingAxeViolations(page, testInfo, 'weather-failure', { block: moderate })

    // B. Loading.
    weather.mode = 'ok'
    await page.keyboard.press('Enter')
    await expect(region).toHaveText('Hämtar väder…')
    await expect(visible).toHaveText('Hämtar väder…')
    expect(await liveRegionsWith(page, 'Hämtar väder')).toEqual([{ role: 'status', text: 'Hämtar väder…' }])
    await expect(connect).toBeFocused()
    await expectNoBlockingAxeViolations(page, testInfo, 'weather-loading', { block: moderate })

    // C. Success.
    await expect.poll(() => weather.release !== null).toBe(true)
    weather.release()
    await expect(page.locator('.overview-weather-row')).toContainText('12')
    await expect(region).toHaveText('Vädret är uppdaterat.')
    expect(await liveRegionsWith(page, 'Vädret är uppdaterat.')).toEqual([{ role: 'status', text: 'Vädret är uppdaterat.' }])
    expect(await liveRegionsWith(page, 'Hämtar väder')).toEqual([])
    await expectNoBlockingAxeViolations(page, testInfo, 'weather-success', { block: moderate })
  })
})

// Mat recommendations, blocking at moderate. One finding predates 8Q and is
// outside it: the visible "Rekommendationer" h3 follows the folder's h1 "Mat"
// with no h2 in between (axe heading-order, moderate, also on a full-page
// scan). It is listed exactly and must stay the only one.
const knownMatFindings = [{ id: 'heading-order', reason: 'pre-existing heading level, outside 8Q', target: '#nutrition-action-plan-title' }]

async function expectMatAxeClean(page, testInfo, label) {
  const violations = await runAxe(page, { include: '#app-section-more .nutrition-action-plan' })
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })
  const blocking = violations.filter((violation) => moderate.includes(violation.impact))
  const unexpected = blocking.flatMap((violation) => violation.nodes
    .filter((node) => !knownMatFindings.some((known) => known.id === violation.id && known.target === node.target))
    .map((node) => `[${violation.impact}] ${violation.id}: ${node.target}`))
  expect(unexpected, label).toEqual([])
}

async function openRecommendations(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: /^Mat/ }).first()
  await folder.focus()
  await page.keyboard.press('Enter')
  const plan = page.locator('#app-section-more .nutrition-action-plan')
  await expect(plan.locator('.nutrition-recommendation-card').first()).toBeVisible({ timeout: 15000 })
  await plan.getByRole('button', { name: 'Visa alla' }).click()
  return plan
}

function cardTitles(plan) {
  return plan.locator('.nutrition-recommendation-card h4').allInnerTexts()
}

// Tab from the card's first control to its "Dölj" and press Enter.
async function dismissWithKeyboard(page, plan, index) {
  const card = plan.locator('.nutrition-recommendation-card').nth(index)
  await card.locator('button').first().focus()
  const dismiss = card.getByRole('button', { name: 'Dölj', exact: true })
  for (let step = 0; step < 5 && !(await dismiss.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press('Tab')
  await expect(dismiss).toBeFocused()
  await page.keyboard.press('Enter')
}

async function expectVisibleFocusOn(page, locator) {
  await expect(locator).toBeFocused()
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.problems, focused.name).toEqual([])
}

test.describe('Mat "Dölj" focus recovery (8P finding)', () => {
  test('first, middle and last card: focus moves to the next card\'s "Dölj", else the previous one', async ({ page }, testInfo) => {
    const plan = await openRecommendations(page)
    await expectMatAxeClean(page, testInfo, 'mat-before-dismiss')
    const cards = plan.locator('.nutrition-recommendation-card')
    const start = await cardTitles(plan)
    expect(start.length).toBeGreaterThanOrEqual(4)

    // First card: the next card moves up and its "Dölj" gets focus.
    await dismissWithKeyboard(page, plan, 0)
    await expect(cards.locator('h4', { hasText: start[0] })).toHaveCount(0)
    await expectVisibleFocusOn(page, cards.nth(0).getByRole('button', { name: 'Dölj', exact: true }))
    expect(await cards.nth(0).locator('h4').innerText()).toBe(start[1])
    await expectMatAxeClean(page, testInfo, 'mat-after-dismiss')

    // Middle card.
    let titles = await cardTitles(plan)
    await dismissWithKeyboard(page, plan, 1)
    await expect(cards.locator('h4', { hasText: titles[1] })).toHaveCount(0)
    await expectVisibleFocusOn(page, cards.nth(1).getByRole('button', { name: 'Dölj', exact: true }))
    expect(await cards.nth(1).locator('h4').innerText()).toBe(titles[2])

    // Last card: there is no next card, so the previous card's "Dölj".
    titles = await cardTitles(plan)
    const last = titles.length - 1
    await dismissWithKeyboard(page, plan, last)
    await expect(cards.locator('h4', { hasText: titles[last] })).toHaveCount(0)
    await expectVisibleFocusOn(page, cards.nth(last - 1).getByRole('button', { name: 'Dölj', exact: true }))

    // Hide the rest: focus ends on the section heading, never on <body>.
    while (await cards.count()) await dismissWithKeyboard(page, plan, 0)
    const heading = plan.getByRole('heading', { name: 'Rekommendationer' })
    await expectVisibleFocusOn(page, heading)
    await expect(heading).toHaveAttribute('tabindex', '-1')
  })
})
