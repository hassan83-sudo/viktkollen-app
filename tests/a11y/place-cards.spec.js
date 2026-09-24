import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations, runAxe } from './support/axe.js'

// A11Y-8K (8H A8, C2, C10): Plats cards in real Chromium with consent given
// and no dialog open. Covers activation by a plain element.click() (voice
// control, switch access), mouse, Enter and Space; the separate Batterisnålt
// checkbox; target size; heading semantics; and axe.

// 'Skola' is the status card, renamed by SchoolCardEnhancer (Plats UI).
const openableTitles = ['Familjekarta', 'Barnets plats', 'Skola', 'Trygga platser', 'Trygghetslarm', 'Allt är okej', 'Platshistorik', 'Batterisnålt läge', 'Inställningar för platsdelning']
const batteryToggleName = 'Aktivera batterisnålt läge (förberedd)'

async function openPlaceWithConsent(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Plats', 'place')
  await page.locator('#app-section-place').getByRole('checkbox', { name: 'Jag godkänner frivillig platsdelning' }).check()
  await expect(page.locator('#app-section-place .place-feature-card.is-openable')).toHaveCount(9)
  return page.locator('#app-section-place .place-feature-grid')
}

function openDialogs(page) {
  return page.locator('[role="dialog"][aria-modal="true"]')
}

async function closeDialog(page) {
  await page.keyboard.press('Escape')
  await expect(openDialogs(page)).toHaveCount(0)
}

// Counts click events on a card's open button, to prove single activation.
async function countClicks(button) {
  await button.evaluate((element) => {
    element.__clicks = 0
    element.addEventListener('click', () => { element.__clicks += 1 })
  })
  return () => button.evaluate((element) => element.__clicks)
}

test.describe('Plats cards (consent given)', () => {
  test('axe: no critical/serious findings, no nested-interactive, no target-size, no aria-allowed-role', async ({ page }, testInfo) => {
    await openPlaceWithConsent(page)
    await expect(openDialogs(page)).toHaveCount(0)
    await expectNoBlockingAxeViolations(page, testInfo, 'place-consent')
    const ids = (await runAxe(page, { include: '#app-section-place' })).map((violation) => violation.id)
    expect(ids).not.toContain('nested-interactive')
    expect(ids).not.toContain('target-size')
    expect(ids).not.toContain('aria-allowed-role')
  })

  test('each card is opened by a plain element.click() on its native button, exactly once', async ({ page }) => {
    const grid = await openPlaceWithConsent(page)
    for (const title of openableTitles) {
      const button = grid.getByRole('heading', { level: 3, name: title }).getByRole('button', { name: title })
      expect(await button.evaluate((element) => element.tagName)).toBe('BUTTON')
      const clicks = await countClicks(button)
      await button.evaluate((element) => element.click())
      await expect(openDialogs(page)).toHaveCount(1)
      expect(await clicks(), title).toBe(1)
      await closeDialog(page)
    }
  })

  test('mouse (anywhere on the card), Enter and Space each open the card once', async ({ page }) => {
    const grid = await openPlaceWithConsent(page)
    const card = grid.locator('.place-feature-card.is-openable', { hasText: 'Familjekarta' })
    const button = card.getByRole('button', { name: 'Familjekarta' })
    const clicks = await countClicks(button)

    // Real pointer on the card body text, not on the heading. (The card's
    // stretched button receives the pointer there, as intended, so the mouse
    // is moved to the paragraph's coordinates.)
    await card.scrollIntoViewIfNeeded()
    const paragraph = await card.locator('p').boundingBox()
    await page.mouse.click(paragraph.x + paragraph.width / 2, paragraph.y + paragraph.height / 2)
    await expect(openDialogs(page)).toHaveCount(1)
    expect(await clicks()).toBe(1)
    await closeDialog(page)

    await expect(button).toBeFocused() // focus returned by the 8C dialog system
    await page.keyboard.press('Enter')
    await expect(openDialogs(page)).toHaveCount(1)
    expect(await clicks()).toBe(2)
    await closeDialog(page)

    await button.focus()
    await page.keyboard.press('Space')
    await expect(openDialogs(page)).toHaveCount(1)
    expect(await clicks()).toBe(3)
    await closeDialog(page)
  })

  test('the card button is named by its heading and described by status and text', async ({ page }) => {
    const grid = await openPlaceWithConsent(page)
    const button = grid.getByRole('button', { name: 'Familjekarta', exact: true })
    await expect(button).toHaveAccessibleName('Familjekarta')
    await expect(button).toHaveAccessibleDescription(/Se var familjemedlemmar befinner sig/)
  })

  test('headings keep their semantics in Chrome\'s accessibility tree', async ({ page }) => {
    await openPlaceWithConsent(page)
    const cdp = await page.context().newCDPSession(page)
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const headings = nodes
      .filter((node) => !node.ignored && node.role?.value === 'heading')
      .filter((node) => node.properties?.some((property) => property.name === 'level' && property.value.value === 3))
      .map((node) => node.name?.value)
    for (const title of openableTitles) expect(headings, title).toContain(title)
    await cdp.detach()
  })

  test('Batterisnålt checkbox: separate Tab stop, named, Space and click toggle once, never opens the card', async ({ page }) => {
    const grid = await openPlaceWithConsent(page)
    const card = grid.locator('.place-feature-card', { hasText: 'Batterisnålt läge' })
    const cardButton = card.getByRole('button', { name: 'Batterisnålt läge' })
    const checkbox = card.getByRole('checkbox', { name: batteryToggleName })

    // Keyboard order: the card's button, then its checkbox.
    await cardButton.focus()
    await page.keyboard.press('Tab')
    await expect(checkbox).toBeFocused()

    const initial = await checkbox.isChecked()
    await page.keyboard.press('Space')
    await expect(checkbox).toBeChecked({ checked: !initial })
    await expect(openDialogs(page)).toHaveCount(0)

    await checkbox.evaluate((element) => element.click())
    await expect(checkbox).toBeChecked({ checked: initial })
    await expect(openDialogs(page)).toHaveCount(0)

    await checkbox.click()
    await expect(checkbox).toBeChecked({ checked: !initial })
    await expect(openDialogs(page)).toHaveCount(0)

    // Clicking the label text toggles too, and does not open the card.
    await card.locator('.place-toggle span').click()
    await expect(checkbox).toBeChecked({ checked: initial })
    await expect(openDialogs(page)).toHaveCount(0)
  })

  test('Batterisnålt checkbox target is at least 24x24 px (WCAG 2.5.8)', async ({ page }) => {
    const grid = await openPlaceWithConsent(page)
    const box = await grid.getByRole('checkbox', { name: batteryToggleName }).boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(24)
    expect(box.height).toBeGreaterThanOrEqual(24)
  })

  test('keyboard focus on a card button is shown around the card', async ({ page }) => {
    const grid = await openPlaceWithConsent(page)
    const card = grid.locator('.place-feature-card.is-openable', { hasText: 'Familjekarta' })
    // Keyboard focus (so :focus-visible applies): Tab onto the button.
    const button = card.getByRole('button', { name: 'Familjekarta' })
    await page.locator('#app-section-place').getByRole('checkbox', { name: 'Jag godkänner frivillig platsdelning' }).focus()
    for (let index = 0; index < 20 && !(await button.evaluate((element) => element === document.activeElement)); index += 1) await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
    const outline = await card.evaluate((element) => {
      const style = getComputedStyle(element)
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
  })
})
