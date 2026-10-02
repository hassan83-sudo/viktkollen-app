import { expect, test } from '@playwright/test'
import { bottomNavLink, goToSection, horizontalOverflow, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8F: 200 % zoom / reflow.
// - 640x400 CSS px with deviceScaleFactor 2 is a 1280x800 window at 200 %.
// - 320x640 is the WCAG 1.4.10 reflow width (1280 px at 400 %).

const viewports = {
  'zoom-200': { deviceScaleFactor: 2, viewport: { height: 400, width: 640 } },
  'reflow-320': { deviceScaleFactor: 1, viewport: { height: 640, width: 320 } },
}

async function expectNoHorizontalScroll(page) {
  expect(await horizontalOverflow(page), 'page scrolls horizontally').toBeLessThanOrEqual(1)
}

async function expectNavigationUsable(page) {
  for (const label of ['Hem', 'Mer']) {
    const link = bottomNavLink(page, label)
    await expect(link).toBeVisible()
    await expect(link).toBeInViewport()
  }
}

// A dialog must fit the viewport, or its content must be reachable by
// scrolling: every focusable control can be scrolled into view.
async function expectDialogReachable(page, dialog) {
  const unreachable = await dialog.evaluate((element) => {
    const selector = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    return [...element.querySelectorAll(selector)]
      .filter((control) => control.getClientRects().length)
      .filter((control) => {
        control.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const rect = control.getBoundingClientRect()
        return rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth
      })
      .map((control) => control.getAttribute('aria-label') || control.textContent.trim().slice(0, 40))
  })
  expect(unreachable, 'dialog controls that cannot be scrolled into view').toEqual([])
}

for (const [name, { deviceScaleFactor, viewport }] of Object.entries(viewports)) {
  test.describe(`${name}`, () => {
    test.use({ deviceScaleFactor, viewport })

    test('Hem: no horizontal scroll, navigation and main actions usable', async ({ page }) => {
      await openApp(page)
      await expectNoHorizontalScroll(page)
      await expectNavigationUsable(page)
      const coach = page.getByRole('button', { name: 'Öppna Coach' }).first()
      await coach.scrollIntoViewIfNeeded()
      await expect(coach).toBeInViewport()
    })

    test('Mer and Tillgänglighet: no horizontal scroll, folders usable', async ({ page }) => {
      await openApp(page)
      await goToSection(page, 'Mer', 'more')
      await expectNoHorizontalScroll(page)
      await expectNavigationUsable(page)
      await openAccessibilityFolder(page)
      await expectNoHorizontalScroll(page)
      const back = page.locator('#app-section-more').getByRole('button', { name: /Tillbaka/ }).first()
      await back.scrollIntoViewIfNeeded()
      await expect(back).toBeInViewport()
    })

    test('AI Coach dialog fits or scrolls; every control is reachable', async ({ page }) => {
      await openApp(page)
      await page.getByRole('button', { name: 'Öppna Coach' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'AI Coach' })
      await expect(dialog).toBeVisible()
      await expectNoHorizontalScroll(page)
      await expectDialogReachable(page, dialog)
      await expect(dialog.getByRole('textbox', { name: 'Fråga till AI Coach' })).toBeVisible()
    })
  })
}

// 8C finding: at 200 % the Place "Trygghetslarm" content slid under the
// (inert) bottom navigation. It no longer reproduces at 640x400 (8F), so this
// is now a regression guard: no control may be covered once scrolled to.
test.describe('Trygghetslarm at 200 % (8C finding)', () => {
  test.use(viewports['zoom-200'])

  test('every Trygghetslarm control can be scrolled to and is not covered', async ({ page }, testInfo) => {
    await openApp(page)
    await goToSection(page, 'Plats', 'place')
    await page.locator('#app-section-place input[type=checkbox]').first().check()
    await page.locator('#app-section-place .place-feature-card.is-openable', { hasText: 'Trygghetslarm' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Trygghetslarm' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    const overflow = await horizontalOverflow(page)
    // Controls that, scrolled into view, are still covered by another element
    // (the 8C finding: content slides under the inert bottom navigation).
    const covered = await dialog.evaluate((element) => [...element.querySelectorAll('button, a[href], input, textarea, select')]
      .filter((control) => control.getClientRects().length)
      .filter((control) => {
        control.scrollIntoView({ block: 'nearest' })
        const rect = control.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, Math.min(rect.top + rect.height / 2, window.innerHeight - 1))
        return !hit || !(control === hit || control.contains(hit))
      })
      .map((control) => control.getAttribute('aria-label') || control.textContent.trim().slice(0, 40)))
    const navTop = await page.locator('.bottom-nav').evaluate((nav) => Math.round(nav.getBoundingClientRect().top))
    testInfo.annotations.push({ description: JSON.stringify({ coveredControls: covered, dialogBottom: Math.round(box.y + box.height), horizontalOverflow: overflow, navTop, viewportHeight: 400 }), type: 'Trygghetslarm 200 %' })
    expect(covered, 'controls covered by other elements').toEqual([])
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
