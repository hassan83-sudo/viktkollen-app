import { expect, test } from '@playwright/test'
import { bottomNavLink, goToSection, openAccessibilityFolder, openApp, supabaseUrl } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { expectBackgroundInert, expectFocusInside, expectFocusNotOnBody, expectTabTrappedIn, intentionallyInert, leftoverInertCount } from './support/focus.js'

// A11Y-8F: keyboard-only flows through the real app (no mouse clicks).

test.describe('keyboard: navigation', () => {
  test('skip link is the first Tab stop and moves focus to the main content heading', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Hoppa till huvudinnehåll' })
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeInViewport()
    const target = await skipLink.getAttribute('href')
    expect(await page.locator(target).count(), 'skip link destination exists').toBe(1)

    await page.keyboard.press('Enter')
    const homeHeading = page.locator('#app-section-home').getByRole('heading', { level: 1, name: 'Hem' })
    await expect(homeHeading).toBeFocused()
    await expect(page).toHaveTitle('Hem – Viktkollen')
  })

  test('bottom navigation moves focus to each new view heading and updates the title', async ({ page }) => {
    await openApp(page)
    await goToSection(page, 'Mer', 'more')
    await expect(page.locator('#app-section-more').getByRole('heading', { level: 1 }).first()).toBeFocused()
    await expect(page).toHaveTitle('Mer – Viktkollen')

    const folder = page.locator('#app-section-more').getByRole('button', { name: /^Tillgänglighet & hjälpmedel/ })
    await folder.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: 'Tillgänglighet & hjälpmedel' })).toBeFocused()
    await expect(page).toHaveTitle('Tillgänglighet & hjälpmedel – Viktkollen')

    await page.locator('#app-section-more').getByRole('button', { name: /Tillbaka/ }).first().focus()
    await page.keyboard.press('Enter')
    await expect(folder).toBeFocused()
    await expect(page).toHaveTitle('Mer – Viktkollen')

    await bottomNavLink(page, 'Hem').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#app-section-home').getByRole('heading', { level: 1, name: 'Hem' })).toBeFocused()
    await expect(page).toHaveTitle('Hem – Viktkollen')
  })
})

test.describe('keyboard: AI Coach dialog', () => {
  test('opens, traps Tab/Shift+Tab, blocks the background, closes on Escape and returns focus', async ({ page }) => {
    await openApp(page)
    const opener = page.getByRole('button', { name: 'Öppna Coach' }).first()
    await opener.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'AI Coach' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expectFocusInside(page, dialog)
    await expectBackgroundInert(page)
    await expectTabTrappedIn(page, dialog, 24)

    // The background cannot be reached: focusing it programmatically fails too.
    await bottomNavLink(page, 'Mer').evaluate((element) => element.focus())
    await expectFocusInside(page, dialog)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await expectFocusNotOnBody(page)
    expect(await leftoverInertCount(page)).toBe(0)
    // The dialog system restored, not removed, the pre-existing inert state.
    await expect(page.locator(intentionallyInert)).toHaveAttribute('inert', '')
  })
})

test.describe('keyboard: Tal & kommunikation', () => {
  test('type a phrase, read it aloud and stop, using only the keyboard (speech mocked)', async ({ page }) => {
    await openApp(page, { speech: true })
    await openAccessibilityFolder(page)
    const communication = page.locator('#app-section-more').getByRole('button', { name: /^Tal & kommunikation/ })
    await communication.focus()
    await page.keyboard.press('Enter')

    const field = page.getByRole('textbox', { name: /Säg detta åt mig/ })
    await field.focus()
    await page.keyboard.type('Jag behöver en paus')

    const speak = page.getByRole('button', { name: 'Läs upp', exact: true })
    await speak.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.__a11ySpokenTexts.join(' '))).toContain('Jag behöver en paus')
    await expect(page.getByText('Läser upp').first()).toBeVisible()

    const stop = page.getByRole('button', { name: 'Stoppa', exact: true })
    await stop.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Uppläsningen stoppades. Texten finns kvar.')).toBeVisible()
    await expect(field).toHaveValue('Jag behöver en paus')
    // Stoppa disappears when speech stops; focus returns to Läs upp.
    await expect(speak).toBeFocused()
    await expectFocusNotOnBody(page)
  })
})

test.describe('keyboard: walkie-talkie', () => {
  const me = '00000000-0000-4000-8000-000000000001'

  test('reach the toggle without a mouse, start with Enter, stop with Space, status follows', async ({ page }, testInfo) => {
    await openApp(page)
    const call = { answered_at: '2026-09-24T10:00:00.000Z', callee_user_id: 'anna', caller_user_id: me, created_at: '2026-09-24T10:00:00.000Z', family_id: 'family-1', id: 'call-1', status: 'accepted' }
    // Registered after openApp's catch-all abort, so these two tables answer.
    await page.route(`${supabaseUrl}/rest/v1/place_voice_calls**`, (route) => route.fulfill({ body: JSON.stringify([call]), contentType: 'application/json', status: 200 }))
    await page.route(`${supabaseUrl}/rest/v1/place_voice_call_signals**`, (route) => route.fulfill({ body: '[]', contentType: 'application/json', status: route.request().method() === 'GET' ? 200 : 201 }))
    await page.evaluate(async () => {
      const { mountWalkie } = await import('/tests/a11y/fixtures/walkieHarness.js')
      mountWalkie({ familyId: 'family-1', familyMembers: [{ display_name: 'Anna', family_id: 'family-1', user_id: 'anna' }], targetUserId: 'anna' })
    })
    const panel = page.locator('#walkie-host')
    await expect(panel.getByText(/Samtal pågår med/)).toBeVisible({ timeout: 15000 })

    const walkieSwitch = panel.getByRole('checkbox', { name: 'Walkie-talkie' })
    await walkieSwitch.focus()
    await page.keyboard.press('Space')
    await expect(walkieSwitch).toBeChecked()
    const status = panel.locator('.family-map-walkie').getByRole('status')
    await expect(status).toHaveText('Walkie-talkie redo. Din mikrofon är av.')

    await page.keyboard.press('Tab')
    const toggle = panel.getByRole('button', { name: 'Börja prata' })
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('button', { name: 'Sluta prata' })).toBeFocused()
    await expect(status).toHaveText('Du sänder. Familjemedlemmen hör dig.')
    await expect(panel.getByRole('button', { name: /Pratar…/ })).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('Space')
    await expect(panel.getByRole('button', { name: 'Börja prata' })).toBeFocused()
    await expect(status).toHaveText('Walkie-talkie redo. Din mikrofon är av.')

    // The push-to-talk button also works from the keyboard (Enter toggles).
    await page.keyboard.press('Tab')
    const hold = panel.getByRole('button', { name: /Håll inne för att prata/ })
    await expect(hold).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(status).toHaveText('Du sänder. Familjemedlemmen hör dig.')
    await page.keyboard.press('Enter')
    await expect(status).toHaveText('Walkie-talkie redo. Din mikrofon är av.')

    await expectNoBlockingAxeViolations(page, testInfo, 'walkie', { include: '#walkie-host' })
  })
})

// A11Y-8I (8H A6/A7, C8/C9): real keyboard in Chromium. jsdom never moves
// focus on Tab itself, so a focus trap is only proven here.
test.describe('keyboard: GlobalSearch dialog', () => {
  async function openSearch(page) {
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Mer', 'more')
    const folder = page.locator('#app-section-more').getByRole('button', { name: /^Inställningar/ })
    await folder.focus()
    await page.keyboard.press('Enter')
    const opener = page.getByRole('button', { name: 'Öppna global sökning' })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Global sökning' })
    await expect(dialog).toBeVisible()
    return { dialog, opener }
  }

  test('named modal: focus in the search field, background blocked, Tab/Shift+Tab trapped', async ({ page }) => {
    const { dialog } = await openSearch(page)
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('searchbox', { name: 'Sök i Viktkollen' })).toBeFocused()

    // Background: inert, and cannot be focused programmatically either.
    const background = bottomNavLink(page, 'Hem')
    expect(await background.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(true)
    await background.evaluate((element) => element.focus())
    await expectFocusInside(page, dialog)

    // More presses than the dialog has tab stops, both directions.
    const stops = await dialog.evaluate((element) => element.querySelectorAll('button, input').length)
    expect(stops).toBeGreaterThan(5)
    await expectTabTrappedIn(page, dialog, stops * 2 + 6)
    for (let index = 0; index < stops + 3; index += 1) {
      await page.keyboard.press('Shift+Tab')
      await expectFocusInside(page, dialog)
    }
  })

  test('Escape closes from any element in the dialog and focus returns to the opener', async ({ page }) => {
    const { dialog, opener } = await openSearch(page)
    await dialog.getByRole('button', { name: 'Stäng' }).focus()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(await leftoverInertCount(page)).toBe(0)

    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('searchbox', { name: 'Sök i Viktkollen' })).not.toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await expectFocusNotOnBody(page)
  })

  test('search keyboard behaviour is unchanged: arrows move the selection, Enter navigates', async ({ page }) => {
    const { dialog } = await openSearch(page)
    const field = dialog.getByRole('searchbox', { name: 'Sök i Viktkollen' })
    await page.keyboard.type('vikt')
    const first = await field.getAttribute('aria-activedescendant')
    await page.keyboard.press('ArrowDown')
    expect(await field.getAttribute('aria-activedescendant')).not.toBe(first)
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expectFocusNotOnBody(page)
  })
})

test.describe('keyboard: Redo! "Jag glömde något" confirmation', () => {
  async function askForgot(page) {
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Redo!', 'redo')
    const field = page.getByRole('textbox', { name: 'Beskriv vad du glömde' })
    await field.focus()
    await page.keyboard.type('Jag glömde nycklarna')
    await page.keyboard.press('Enter')
    const question = page.getByRole('group', { name: /Vill du lägga till .* på checklistan\?/ })
    return { field, question }
  }

  test('the question takes focus; Yes adds, announces once and returns focus to the field', async ({ page }) => {
    const { field, question } = await askForgot(page)
    await expect(question).toBeFocused()
    const status = page.locator('.ready-forgot-card').getByRole('status')
    await expect(status).toHaveText('')

    await page.keyboard.press('Tab')
    await expect(question.getByRole('button', { name: 'Ja' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(question).toHaveCount(0)
    await expect(field).toBeFocused()
    await expect(status).toHaveText(/har lagts till på checklistan\.$/)
    // One announcement: the result is in the single status region only; the
    // question itself is not a live region.
    expect(await page.locator('.ready-forgot-card [role=status], .ready-forgot-card [aria-live]').count()).toBe(1)
    await expectFocusNotOnBody(page)

    // Typing again clears the old result.
    await page.keyboard.type('x')
    await expect(status).toHaveText('')
  })

  test('No closes the question without adding and returns focus to the field', async ({ page }) => {
    const { field, question } = await askForgot(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(question.getByRole('button', { name: 'Nej' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(question).toHaveCount(0)
    await expect(field).toBeFocused()
    await expect(page.locator('.ready-forgot-card').getByRole('status')).toHaveText('')
  })
})
