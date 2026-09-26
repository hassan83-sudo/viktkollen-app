import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openAccessibilityFolder, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations, runAxe } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8Z3 (docs/accessibility/A11Y_8Z3_FINAL_CODE_GAPS.md): permanent gates
// for the last Claude-owned code gaps from 8Y, 8Z1 and 8Z2:
// - B-8Z1-N1: Ekonomi does not scroll sideways (320/390 px, normal and extra
//   large text, and desktop);
// - C15: Ekonomi's text alternative is a real table with column and row
//   headers, and stays visually hidden;
// - C14: Ekonomi and goal forms say why a form was not saved;
// - C-N3: the "Visa hela dagen" weather dialog;
// - B10: Place texts follow the app language in the running app;
// - C-8Y-N1: the 8X dialogs have a clear edge in the app's high contrast.

const moderate = ['critical', 'serious', 'moderate']
const extraLarge = { largeControls: true, textSize: 'extra-large' }

async function openEconomy(page, preferences = null) {
  await openApp(page, { preferences, reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /^Ekonomi/ }).first().click()
  await page.locator('.economy-activation').getByRole('button').click()
  const tablist = page.locator('#app-section-more .economy-tabs[role=tablist]')
  await expect(tablist).toBeVisible()
  return tablist
}

async function expectFocusVisible(page) {
  expect(await page.evaluate(() => document.activeElement !== document.body), 'focus on <body>').toBe(true)
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.problems, focused.name).toEqual([])
}

test.describe('Ekonomi reflow (8Z1 B-8Z1-N1)', () => {
  const sizes = [
    ['320 px', 320, null],
    ['320 px, extra large text', 320, extraLarge],
    ['390 px', 390, null],
    ['390 px, extra large text', 390, extraLarge],
    ['desktop 1280 px', 1280, null],
  ]
  for (const [label, width, preferences] of sizes) {
    test(`${label}: no tab scrolls the page sideways`, async ({ page }) => {
      const tablist = await openEconomy(page, preferences)
      await page.setViewportSize({ height: 800, width })
      for (const name of await tablist.getByRole('tab').allInnerTexts()) {
        await tablist.getByRole('tab', { name, exact: true }).click()
        await expect.poll(() => horizontalOverflow(page), { message: `${label}, ${name}: scrollWidth - clientWidth` }).toBe(0)
      }
    })
  }
})

test('Ekonomi text alternative is a real, visually hidden data table (8Y C15)', async ({ page }, testInfo) => {
  await openEconomy(page)
  const table = page.getByRole('table', { name: 'Textalternativ till utgiftstavlan' })
  await expect(table).toHaveCount(1)
  await expect(table.getByRole('columnheader')).toHaveText(['Kategori', 'Belopp', 'Andel'])
  const rowHeaders = table.getByRole('rowheader')
  expect(await rowHeaders.count()).toBeGreaterThan(0)
  // Every data row has its category as row header and one cell per column.
  const rows = await table.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.children[0].tagName, tr.children[0].getAttribute('scope'), tr.children.length]))
  for (const row of rows) expect(row).toEqual(['TH', 'row', 3])
  expect(await table.locator('thead th[scope=col]').count()).toBe(3)
  // Chrome's accessibility tree sees the headers (what screen readers get).
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  const roles = nodes.filter((node) => !node.ignored).map((node) => `${node.role?.value}:${node.name?.value || ''}`)
  for (const header of ['Kategori', 'Belopp', 'Andel']) expect(roles).toContain(`columnheader:${header}`)
  // Hidden by its wrapper: nothing of the table is painted in the layout.
  const box = await table.evaluate((element) => {
    const wrapper = element.parentElement.getBoundingClientRect()
    return { clip: getComputedStyle(element.parentElement).clipPath, height: wrapper.height, width: wrapper.width }
  })
  expect(box).toEqual({ clip: 'inset(50%)', height: 1, width: 1 })
  await expectNoBlockingAxeViolations(page, testInfo, 'economy-overview', { block: moderate, include: '#economy-center' })
})

test('Ekonomi forms always say why an entry was not saved (8Y C14)', async ({ page }, testInfo) => {
  const tablist = await openEconomy(page)
  const region = page.locator('#economy-center .economy-status')
  // One status region that stays in the DOM: the same element carries every
  // message (a region that is inserted together with its text is often not
  // announced).
  await expect(region).toHaveCount(1)
  await expect(region).toHaveAttribute('role', 'status')
  await region.evaluate((element) => { element.dataset.probe = 'same-region' })
  await tablist.getByRole('tab', { name: 'Köp', exact: true }).click()
  const form = page.locator('#economy-tabpanel form').first()
  const submit = form.locator('button[type=submit]')

  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(region).toHaveText('Ange ett giltigt belopp.')
  await expect(submit).toBeFocused()

  await form.getByLabel('Belopp').fill('120')
  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(region).toHaveText('Fyll i namn eller beskrivning.')
  await expect(submit).toBeFocused()
  await expectFocusVisible(page)

  await form.getByLabel('Beskrivning').fill('Lunch')
  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(region).toHaveText('Sparat lokalt.')
  await expect(region).toHaveAttribute('data-probe', 'same-region')
  // Only one live region carries the message.
  expect(await page.locator('[role=status]:has-text("Sparat lokalt."), [aria-live]:has-text("Sparat lokalt.")').count()).toBe(1)
  await expectNoBlockingAxeViolations(page, testInfo, 'economy-form-status', { block: moderate, include: '#economy-center' })
})

test('goal form: a goal that cannot be created is announced as an error (8Y C14)', async ({ page }, testInfo) => {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Min resa', 'journey')
  await page.locator('#app-section-journey').getByRole('button', { name: 'Mål & vanor', exact: true }).first().click()
  const form = page.locator('#app-section-journey form').filter({ has: page.getByRole('heading', { name: 'Skapa mål' }) })
  await expect(form).toBeVisible({ timeout: 15000 })
  // A protein target of 5 g passes the native checks (required, min=1) but
  // is outside the safe range, so the goal is not created.
  await form.getByLabel('Nivå').fill('5')
  const submit = form.getByRole('button', { name: 'Skapa mål' })
  await submit.focus()
  await page.keyboard.press('Enter')
  const error = page.locator('#goals-habits-error')
  await expect(error).toHaveAttribute('role', 'alert')
  await expect(error).toHaveText('Målet kunde inte skapas. Kontrollera nivå, text och kategori.')
  await expect(submit).toBeFocused()
  await expectNoBlockingAxeViolations(page, testInfo, 'goal-form-error', { block: moderate, include: '#app-section-journey' })
})

async function openMat(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /^Mat/ }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

test('recipe form: a recipe that cannot be saved is announced, and the field is marked invalid (8Y C14)', async ({ page }, testInfo) => {
  await openMat(page)
  await page.locator('#app-section-more').getByRole('button', { name: 'Recept', exact: true }).first().click()
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Skapa recept' }) })
  const submit = form.getByRole('button', { name: 'Skapa recept' })
  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more [role=status]').filter({ hasText: 'Receptet kunde inte sparas. Kontrollera fälten.' })).toHaveCount(1)
  const name = form.getByRole('textbox', { name: 'Namn' }).first()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(name).toHaveAccessibleDescription(/.+/)
  await expectFocusVisible(page)
  await expectNoBlockingAxeViolations(page, testInfo, 'recipe-form-error', { block: moderate, include: '.recipe-editor' })
})

test('meal form: a failed save marks the field invalid and moves focus to it (8Y C14)', async ({ page }, testInfo) => {
  await openMat(page)
  await page.locator('#app-section-more').getByRole('button', { name: 'Lägg till måltid' }).first().click()
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Spara måltid' }) })
  const submit = form.getByRole('button', { name: 'Spara måltid' })
  await submit.focus()
  await page.keyboard.press('Enter')
  // Focus goes to the first invalid field; its label carries the error text,
  // so the error is announced together with the field.
  const invalid = form.locator('[aria-invalid="true"]').first()
  await expect(invalid).toBeFocused()
  const error = form.locator('.field-error').first()
  await expect(error).toBeVisible()
  const accessibleName = await invalid.evaluate((element) => element.labels?.[0]?.innerText || '')
  expect(accessibleName).toContain(await error.innerText())
  await expectFocusVisible(page)
  await expectNoBlockingAxeViolations(page, testInfo, 'meal-form-error', { block: moderate, include: '.meal-editor' })
  // Fixing the field and saving clears the invalid state.
  await invalid.fill('Gröt')
  await submit.click()
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0)
})

const weatherCurrent = {
  current: { apparent_temperature: 11, precipitation_probability: 10, temperature_2m: 12.3, time: '2026-09-25T10:00', weather_code: 1, wind_speed_10m: 3.2 },
  daily: { precipitation_probability_max: [10], sunrise: ['2026-09-25T07:00'], sunset: ['2026-09-25T19:00'] },
}
const weatherHourly = { ...weatherCurrent, hourly: { precipitation_probability: [10, 20], temperature_2m: [12, 13], time: ['2026-09-25T10:00', '2026-09-25T11:00'], uv_index: [2, 3], weather_code: [1, 2], wind_speed_10m: [3, 4] } }

test.describe('weather "Visa hela dagen" dialog (8Y C-N3)', () => {
  test.use({ geolocation: { latitude: 59.33, longitude: 18.07 }, permissions: ['geolocation'] })

  test('named modal dialog: focus in, trapped, Escape closes, focus returns; loading and error are announced', async ({ page }, testInfo) => {
    // Mocked boundary (production code unchanged): Home loads the current
    // weather; the dialog loads the hourly forecast, which the test controls.
    const dialogLoad = { mode: 'ok', release: null }
    await page.route('https://api.open-meteo.com/**', async (route) => {
      if (!route.request().url().includes('hourly')) return route.fulfill({ body: JSON.stringify(weatherCurrent), contentType: 'application/json' })
      if (dialogLoad.mode === 'hold') {
        await new Promise((resolve) => { dialogLoad.release = resolve })
        return route.abort()
      }
      return route.fulfill({ body: JSON.stringify(weatherHourly), contentType: 'application/json' })
    })
    await openApp(page, { reducedMotion: 'reduce' })
    const opener = page.getByRole('button', { name: 'Visa hela dagen' })
    await expect(opener).toBeVisible({ timeout: 15000 })

    // Open with the keyboard: named modal, focus inside and visible.
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Vädret idag' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await expectFocusVisible(page)
    await expect(dialog.getByRole('list', { name: 'Timme för timme' })).toBeVisible()
    // The background is inert while the dialog is open.
    expect(await opener.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(true)
    // Tab and Shift+Tab stay in the dialog.
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press(index % 3 === 0 ? 'Shift+Tab' : 'Tab')
      expect(await dialog.evaluate((element) => element.contains(document.activeElement)), `Tab ${index}`).toBe(true)
    }
    await expectNoBlockingAxeViolations(page, testInfo, 'weather-day-dialog', { block: moderate })

    // Escape closes and returns focus to "Visa hela dagen".
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(await opener.evaluate((element) => Boolean(element.closest('[inert]'))), 'background still inert').toBe(false)

    // Loading, then a failed load: each is shown in a polite live region in
    // the dialog, and the dialog stays usable.
    dialogLoad.mode = 'hold'
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    const status = dialog.locator('.overview-weather-day-status')
    await expect(status).toHaveText('Hämtar väder…')
    await expect(status).toHaveAttribute('aria-live', 'polite')
    await expect.poll(() => dialogLoad.release !== null).toBe(true)
    dialogLoad.release()
    await expect(status).toHaveText('Väder ej anslutet')
    await expect(status).toHaveAttribute('aria-live', 'polite')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await expectNoBlockingAxeViolations(page, testInfo, 'weather-day-dialog-error', { block: moderate })
    // "Stäng" closes and returns focus too.
    await dialog.getByRole('button', { name: 'Stäng' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
})

test('Place texts follow the app language in the running app (B10)', async ({ page }, testInfo) => {
  await page.addInitScript(() => window.localStorage.setItem('i18nextLng', 'en'))
  await openApp(page, { reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const link = page.locator('.bottom-nav a[href="#app-section-place"]')
  await link.focus()
  await page.keyboard.press('Enter')
  await page.locator('#app-section-place').getByRole('checkbox', { name: 'I approve voluntary location sharing' }).check()
  const cards = page.locator('#app-section-place .place-feature-open')
  const checks = [
    ['Safety alert', ['What happened?', 'I feel threatened', 'In acute danger – call 112.']],
    ['All OK', ['Send a quick check-in to the family', 'I am okay']],
    ['Location history', ['How long should location history be kept?', 'Immediately', '30 days']],
    ['Location sharing settings', ['GPS status', 'Who can see my location?', 'Battery saver', 'Stop sharing location']],
    ['Safe places', ['Name of safe place', 'Save latest location', 'Push notifications:']],
  ]
  const swedish = /[åäöÅÄÖ]|Trygghetslarm|Platshistorik|Sparar|Stäng/
  for (const [card, texts] of checks) {
    const button = cards.filter({ hasText: card }).first()
    await button.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: card })
    await expect(dialog).toBeVisible()
    for (const text of texts) await expect(dialog).toContainText(text)
    expect(await dialog.innerText(), `${card}: Swedish text in English`).not.toMatch(swedish)
    // Choice buttons are reachable with the keyboard and show focus.
    await page.keyboard.press('Tab')
    await expectFocusVisible(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()
  }
  await expectNoBlockingAxeViolations(page, testInfo, 'place-english', { include: '#app-section-place' })
})

test.describe('8X dialog edge (8Y C-8Y-N1)', () => {
  const modes = [
    // Normal mode keeps its design: the subtle 1 px border.
    ['normal', null, null, { style: 'solid', width: '1px' }],
    // App high contrast: a 2 px solid edge in the high contrast border colour.
    ['app high contrast', { highContrast: true }, null, { color: 'rgb(148, 163, 184)', style: 'solid', width: '2px' }],
    // Forced colors: the system draws the border (CanvasText).
    ['forced colors', null, 'active', { style: 'solid', width: '1px' }],
  ]
  for (const [label, preferences, forcedColors, expected] of modes) {
    test(`${label}: the confirm dialog has a visible edge and no axe findings`, async ({ page }, testInfo) => {
      if (forcedColors) await page.emulateMedia({ forcedColors, reducedMotion: 'reduce' })
      await openApp(page, { preferences, reducedMotion: 'reduce' })
      await openAccessibilityFolder(page)
      const reset = page.getByRole('button', { name: 'Återställ tillgänglighetsinställningar' })
      await reset.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('alertdialog', { name: 'Återställ tillgänglighetsinställningar' })
      await expect(dialog).toBeVisible()
      const border = await dialog.evaluate((element) => {
        const style = getComputedStyle(element)
        return { color: style.borderTopColor, style: style.borderTopStyle, width: style.borderTopWidth }
      })
      expect(border.style).toBe(expected.style)
      expect(border.width).toBe(expected.width)
      if (expected.color) expect(border.color).toBe(expected.color)
      if (label === 'normal') expect(border.color).toBe('rgba(120, 150, 255, 0.28)')
      if (forcedColors) {
        // As in forced-colors.spec.js: axe's color-contrast rule reads the
        // authored colours, not the forced system colours that are painted.
        const violations = await runAxe(page, { include: '.confirm-dialog' })
        await testInfo.attach(`axe-confirm-dialog-${label}.json`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })
        expect(violations.filter((violation) => moderate.includes(violation.impact) && violation.id !== 'color-contrast').map((violation) => violation.id)).toEqual([])
      } else {
        await expectNoBlockingAxeViolations(page, testInfo, `confirm-dialog-${label}`, { block: moderate, include: '.confirm-dialog' })
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(reset).toBeFocused()
    })
  }
})
