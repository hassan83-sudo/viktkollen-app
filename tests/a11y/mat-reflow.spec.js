import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from './support/app.js'

// A11Y-8P (8M A-N1): Mer → Mat reflow (WCAG 1.4.10).
//
// Before 8P, .nutrition-actions was a wrapping flex column on narrow screens
// with buttons at flex-basis 100 %, so each button started a new column to
// the right: 286 px sideways scroll at 390 px (the "Dölj" buttons in the
// recommendation cards), and up to 665 px in the goal, import, plan and
// add-meal panels. Every panel with .nutrition-actions is checked here.

const modes = {
  '390': { deviceScaleFactor: 1, preferences: null, viewport: { height: 844, width: 390 } },
  'reflow-320': { deviceScaleFactor: 1, preferences: null, viewport: { height: 640, width: 320 } },
  'zoom-200': { deviceScaleFactor: 2, preferences: null, viewport: { height: 400, width: 640 } },
  'large-text-390': { deviceScaleFactor: 1, preferences: { largeControls: true, textSize: 'extra-large' }, viewport: { height: 844, width: 390 } },
  'large-text-320': { deviceScaleFactor: 1, preferences: { largeControls: true, textSize: 'extra-large' }, viewport: { height: 640, width: 320 } },
}

// Panels of Mat that are opened from the overview ([fold, button]).
const panels = [
  ['Verktyg', 'Näringsmål'],
  ['Verktyg', 'Import, recension och mer'],
  [null, 'Planera dagen'],
  [null, 'Lägg till måltid'],
  ['Mönster & historik', 'Öppna historik och veckomönster'],
]

async function openMat(page, preferences) {
  await openApp(page, { preferences, reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: /^Mat/ }).first()
  await folder.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: 'Mat' }).first()).toBeVisible()
  await expect(page.locator('#app-section-more .nutrition-recommendation-card').first()).toBeVisible({ timeout: 15000 })
}

async function openPanel(page, [fold, button]) {
  const more = page.locator('#app-section-more')
  if (fold) {
    const summary = more.locator('summary', { hasText: fold }).first()
    if (!(await summary.evaluate((element) => element.parentElement.open))) await summary.click()
  }
  await more.getByRole('button', { name: button }).first().click()
}

// Layout problems of the visible Mat content: controls outside the page,
// and text that is cut off (ellipsis, fixed height or nowrap overflow).
function layoutProblems() {
  const width = document.documentElement.clientWidth
  const problems = []
  const visible = (element) => element.getClientRects().length && getComputedStyle(element).visibility === 'visible' && !element.closest('.sr-only')
  for (const control of document.querySelectorAll('#app-section-more :is(button, a[href], input:not([type=hidden]), select, textarea, summary)')) {
    if (!visible(control)) continue
    const rect = control.getBoundingClientRect()
    if (rect.left < -1 || rect.right > width + 1) problems.push(`outside page: ${control.tagName.toLowerCase()} "${(control.innerText || control.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(rect.left)}-${Math.round(rect.right)}`)
  }
  for (const element of document.querySelectorAll('#app-section-more :is(.nutrition-recommendation-card, .nutrition-actions) *')) {
    if (!visible(element) || !element.textContent.trim()) continue
    const style = getComputedStyle(element)
    const clipsX = element.scrollWidth > element.clientWidth + 1 && style.overflowX !== 'visible'
    const clipsY = element.scrollHeight > element.clientHeight + 1 && style.overflowY !== 'visible'
    if (clipsX || clipsY) problems.push(`clipped text: ${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 30)}"`)
  }
  return problems
}

for (const [modeName, { deviceScaleFactor, preferences, viewport }] of Object.entries(modes)) {
  test.describe(`Mat reflow (${modeName})`, () => {
    test.use({ deviceScaleFactor, viewport })

    test('overview and panels: no horizontal scroll, no control outside the page, no clipped text', async ({ page }) => {
      await openMat(page, preferences)
      const failures = []
      const check = async (label) => {
        const overflow = await horizontalOverflow(page)
        if (overflow > 1) failures.push(`${label}: page scrolls ${overflow} px sideways`)
        for (const problem of await page.evaluate(layoutProblems)) failures.push(`${label}: ${problem}`)
      }
      await check('overview')
      for (const panel of panels) {
        await openPanel(page, panel)
        await check(panel[1])
      }
      expect(failures).toEqual([])
    })

    test('"Dölj" is visible, inside its own recommendation card and hides that card', async ({ page }) => {
      await openMat(page, preferences)
      const cards = page.locator('#app-section-more .nutrition-recommendation-card')
      const dismissible = cards.filter({ has: page.getByRole('button', { name: 'Dölj', exact: true }) })
      const count = await dismissible.count()
      expect(count).toBeGreaterThan(0)

      for (let index = 0; index < count; index += 1) {
        const card = dismissible.nth(index)
        const button = card.getByRole('button', { name: 'Dölj', exact: true })
        await button.scrollIntoViewIfNeeded()
        await expect(button).toBeInViewport({ ratio: 1 })
        const [cardBox, buttonBox] = [await card.boundingBox(), await button.boundingBox()]
        expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x - 1)
        expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1)
        expect(buttonBox.y).toBeGreaterThanOrEqual(cardBox.y - 1)
        expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1)
      }

      // Activating "Dölj" with the keyboard hides exactly that card (the
      // list shows the first two recommendations, so the next one moves up).
      const titles = await cards.locator('h4').allInnerTexts()
      const first = dismissible.first()
      const title = (await first.locator('h4').innerText()).trim()
      await first.getByRole('button', { name: 'Dölj', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('#app-section-more .nutrition-recommendation-card h4').filter({ hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).toHaveCount(0)
      for (const other of titles.filter((candidate) => candidate.trim() !== title)) {
        await expect(page.locator('#app-section-more .nutrition-recommendation-card h4', { hasText: other.trim() })).toHaveCount(1)
      }
    })
  })
}
