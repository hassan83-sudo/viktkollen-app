import { expect, test } from '@playwright/test'
import { openApp } from './support/app.js'

// A11Y-8L (8H A2): the Home header actions ("Visa smarta notiser", "Lägg
// till profilbild") are visually hidden in the current design. While hidden
// they must not be Tab stops, not focusable, and not exposed as controls to
// assistive technology. When shown, they must be ordinary controls again.
//
// axe does not detect focusable controls inside a visually hidden container,
// so this Chromium spec (plus focus-visibility.spec.js) is the gate for A2.

const hiddenNames = ['Visa smarta notiser', 'Lägg till profilbild']

async function tabOrder(page, maxStops = 60) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  const stops = []
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const element = document.activeElement
      if (!element || element === document.body) return null
      if (element.closest('.bottom-nav')) return { end: true }
      let hiddenAncestor = null
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        const box = node.getBoundingClientRect()
        if (node.classList.contains('sr-only') || style.clip === 'rect(0px, 0px, 0px, 0px)' || (box.width <= 1 && box.height <= 1 && style.overflow === 'hidden')) {
          hiddenAncestor = String(node.className)
          break
        }
      }
      const rect = element.getBoundingClientRect()
      return { hiddenAncestor, name: (element.getAttribute('aria-label') || element.innerText || '').trim().split('\n')[0], size: [Math.round(rect.width), Math.round(rect.height)] }
    })
    if (!stop) continue
    if (stop.end) break
    stops.push(stop)
  }
  return stops
}

async function chromeButtonNames(page) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  return nodes.filter((node) => !node.ignored && node.role?.value === 'button').map((node) => node.name?.value)
}

// The DOM that <OverviewDashboard showHeaderActions /> renders (see
// src/components/a11y/hiddenHeaderActions.test.jsx): no sr-only, no inert.
// No app state shows them today, so the visible state is created in place.
// React only rewrites attributes when the prop changes, so it stays.
function showHeaderActions(page) {
  return page.evaluate(() => {
    const container = document.querySelector('#app-section-home .overview-header-actions')
    container.classList.remove('sr-only')
    container.removeAttribute('inert')
  })
}

test.describe('Home header actions (8H A2)', () => {
  test('A: while visually hidden they are inert, not Tab stops and not exposed as controls', async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    const container = page.locator('#app-section-home .overview-header-actions')
    await expect(container).toHaveClass(/sr-only/)
    await expect(container).toHaveAttribute('inert', '')

    const stops = await tabOrder(page)
    expect(stops.length).toBeGreaterThan(10)
    const names = stops.map((stop) => stop.name)
    for (const name of hiddenNames) expect(names).not.toContain(name)
    // No invisible Tab stop anywhere on Hem.
    expect(stops.filter((stop) => stop.hiddenAncestor)).toEqual([])

    // Not focusable programmatically either.
    for (const name of hiddenNames) {
      await container.locator(`button[aria-label="${name}"]`).evaluate((element) => element.focus())
      expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).not.toBe(name)
    }

    // Not in Chrome's accessibility tree as buttons.
    const buttons = await chromeButtonNames(page)
    for (const name of hiddenNames) expect(buttons).not.toContain(name)
  })

  test('B: when shown they are normal controls: Tab stops, visible, named, focus shown, activate', async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await showHeaderActions(page)
    const container = page.locator('#app-section-home .overview-header-actions')

    const stops = await tabOrder(page)
    const shown = stops.filter((stop) => hiddenNames.includes(stop.name))
    expect(shown.map((stop) => stop.name)).toEqual(hiddenNames)
    shown.forEach((stop) => {
      expect(stop.hiddenAncestor).toBeNull()
      expect(stop.size[0]).toBeGreaterThanOrEqual(24)
      expect(stop.size[1]).toBeGreaterThanOrEqual(24)
    })

    const buttons = await chromeButtonNames(page)
    for (const name of hiddenNames) expect(buttons).toContain(name)

    const notices = container.getByRole('button', { name: 'Visa smarta notiser' })
    const avatar = container.getByRole('button', { name: 'Lägg till profilbild' })
    await expect(notices).toBeVisible()
    await expect(avatar).toBeVisible()

    // Keyboard focus is visible (outline or ring).
    await page.evaluate(() => document.activeElement?.blur())
    for (let index = 0; index < 10 && !(await notices.evaluate((element) => element === document.activeElement)); index += 1) await page.keyboard.press('Tab')
    await expect(notices).toBeFocused()
    const ring = await notices.evaluate((element) => {
      const style = getComputedStyle(element)
      return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none'
    })
    expect(ring).toBe(true)

    // Activation works as before: the profile photo button opens the file
    // picker (no photo yet), and the notices button goes to Notis.
    await page.keyboard.press('Tab')
    await expect(avatar).toBeFocused()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await chooser

    await notices.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#app-section-notices')).toHaveClass(/is-active/)
  })
})
