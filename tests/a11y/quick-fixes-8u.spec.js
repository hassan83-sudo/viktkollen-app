import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from './support/app.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8U: fixes for the 8T gap audit (docs/accessibility/
// A11Y_8T_POST_8S_GAP_AUDIT.md): focus recovery (B-8T-N1), Home advice with
// large text (B-8T-N3), 65+ form feedback (B-8T-N4) and the "Ring 112" hit
// area (B-8T-N8). Må bra reflow (B-8T-N2) is gated for every Mer folder in
// more-folders.spec.js (C-8T-N1).

async function openFolder(page, title, preferences = null) {
  await openApp(page, { preferences, reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${title}`) }).first()
  await folder.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

async function expectVisibleFocusNotBody(page) {
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.body, 'focus on <body>').toBeUndefined()
  expect(focused.problems, focused.name).toEqual([])
}

test.describe('focus recovery (8T B-8T-N1)', () => {
  test('AI Coach: "Markera sedd" moves focus to its card, not <body>', async ({ page }) => {
    await openFolder(page, 'AI Coach')
    const button = page.locator('#achievements .achievement-card-unlocked button', { hasText: 'Markera sedd' }).first()
    await expect(button).toBeVisible()
    // Located by its title: the button, and anything relative to it, goes away.
    const title = await button.locator('xpath=ancestor::article[1]//h3').innerText()
    const card = page.locator('#achievements article.achievement-card').filter({ has: page.getByRole('heading', { exact: true, name: title }) })
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(button).toHaveCount(0)
    await expect(card).toBeFocused()
    await expect(card).toHaveAttribute('tabindex', '-1')
    await expectVisibleFocusNotBody(page)
  })

  test('Redo: after "Ja, radera" focus goes to the next item, else the previous one, else the add field', async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Redo!', 'redo')
    const field = page.getByRole('textbox', { name: 'Lägg till sak' })
    for (const label of ['Nycklar', 'Plånbok', 'Mobil']) {
      await field.fill(label)
      await page.keyboard.press('Enter')
    }
    const remove = async (label) => {
      await page.getByRole('button', { name: `Radera ${label}` }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('dialog').getByRole('button', { name: 'Ja, radera' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    // Middle item: the next one takes its place.
    await remove('Plånbok')
    await expect(page.getByRole('button', { name: 'Radera Mobil' })).toBeFocused()
    await expectVisibleFocusNotBody(page)
    // Last item: the previous one.
    await remove('Mobil')
    await expect(page.getByRole('button', { name: 'Radera Nycklar' })).toBeFocused()
    // Only item: the add field.
    await remove('Nycklar')
    await expect(field).toBeFocused()
    await expectVisibleFocusNotBody(page)
  })
})

test.describe('Home advice with enlarged text (8T B-8T-N3)', () => {
  test.use({ viewport: { height: 640, width: 320 } })

  test('the coach advice and notification text are not clamped with extra large text', async ({ page }) => {
    await openApp(page, { preferences: { largeControls: true, textSize: 'extra-large' }, reducedMotion: 'reduce' })
    const texts = page.locator('#app-section-home :is(.daily-coach-advice, .smart-notifications-content > span)')
    expect(await texts.count()).toBeGreaterThan(1)
    const clipped = await texts.evaluateAll((elements) => elements
      .filter((element) => element.scrollHeight > element.clientHeight + 1 || getComputedStyle(element).webkitLineClamp !== 'none')
      .map((element) => element.textContent.trim().slice(0, 40)))
    expect(clipped).toEqual([])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('65+ medicine form feedback (8T B-8T-N4)', () => {
  test('empty and blank name: visible message in one status region, field invalid and described; correction clears it', async ({ page }) => {
    await openFolder(page, '65+')
    const field = page.getByRole('textbox', { name: 'Medicin' })
    const message = page.locator('#senior-medicine-error')
    const add = page.locator('#senior-65-plus form').getByRole('button', { name: 'Lägg till' })
    const error = 'Skriv namnet på medicinen innan du lägger till.'
    await expect(message).toHaveAttribute('role', 'status')
    await expect(message).toHaveText('')

    await field.focus()
    await page.keyboard.press('Enter')
    await expect(message).toHaveText(error)
    await expect(message).toBeVisible()
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAccessibleDescription(error)
    const regions = await page.evaluate((text) => [...document.querySelectorAll('[role=status], [role=alert], [aria-live]')].filter((element) => element.textContent.includes(text)).length, error)
    expect(regions).toBe(1)

    await field.fill('   ')
    await expect(message).toHaveText('')
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(message).toHaveText(error)
    await expect(add).toBeFocused()

    await field.fill('Alvedon')
    await expect(message).toHaveText('')
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Enter')
    await expect(page.locator('#senior-65-plus')).toContainText('Alvedon')
  })
})

test.describe('"Ring 112" (8T B-8T-N8)', () => {
  test('emergency link: hit area at least 24 px high, keyboard focus visible', async ({ page }) => {
    await openFolder(page, 'Graviditet')
    const link = page.getByRole('link', { name: 'Ring 112' })
    await expect(link).toHaveAttribute('href', 'tel:112')
    await link.scrollIntoViewIfNeeded()
    const box = await link.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(24)
    expect(box.width).toBeGreaterThanOrEqual(24)
    // The points just inside the top and bottom edge hit the link itself.
    const reaches = await link.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      return [rect.top + 1, rect.bottom - 1].every((y) => element.contains(document.elementFromPoint(x, y)))
    })
    expect(reaches).toBe(true)
    await link.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    await expectVisibleFocusNotBody(page)
  })
})
