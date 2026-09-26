import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8Z1 (8Y A-8Y-N1, B-8Y-N1, C-8Y-N3): the tablists in Stället and
// Ekonomi follow the ARIA tabs pattern (docs/accessibility/
// A11Y_8Z1_TAB_KEYBOARD.md): one Tab stop (the selected tab), ArrowLeft/
// ArrowRight with wrap, Home/End, automatic activation, and a tabpanel
// labelled by the selected tab.

const moderate = ['critical', 'serious', 'moderate']

async function focusedTab(page) {
  return page.evaluate(() => (document.activeElement.getAttribute('role') === 'tab' ? document.activeElement.textContent.trim() : `not a tab: ${document.activeElement.tagName}`))
}

async function expectFocusVisible(page) {
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.body, 'focus on <body>').toBeUndefined()
  expect(focused.problems, focused.name).toEqual([])
}

// The tab contract, run for each tablist.
async function expectTabsPattern(page, tablist, testInfo, label) {
  const tabs = tablist.getByRole('tab')
  const names = await tabs.allInnerTexts()
  expect(names.length).toBeGreaterThan(2)

  // Semantics: exactly one selected tab, the only Tab stop, controlling the
  // tabpanel that is labelled by it.
  const semantics = async () => page.evaluate((listSelector) => {
    const list = document.querySelector(listSelector)
    const all = [...list.querySelectorAll('[role=tab]')]
    const selected = all.filter((tab) => tab.getAttribute('aria-selected') === 'true')
    const panel = selected[0] && document.getElementById(selected[0].getAttribute('aria-controls'))
    return {
      labelledBy: panel?.getAttribute('aria-labelledby'),
      panelRole: panel?.getAttribute('role'),
      selected: selected.map((tab) => tab.textContent.trim()),
      selectedId: selected[0]?.id,
      tabStops: all.filter((tab) => tab.tabIndex === 0).map((tab) => tab.textContent.trim()),
    }
  }, await tablist.evaluate((element) => `[role=tablist][aria-label="${element.getAttribute('aria-label')}"]`))
  let state = await semantics()
  expect(state.selected).toEqual([names[0]])
  expect(state.tabStops).toEqual([names[0]])
  expect(state.panelRole).toBe('tabpanel')
  expect(state.labelledBy).toBe(state.selectedId)

  // Arrow keys, wrap, Home and End; selection and the Tab stop follow focus.
  await tabs.first().focus()
  const steps = [
    ['ArrowRight', names[1]],
    ['ArrowRight', names[2]],
    ['ArrowLeft', names[1]],
    ['End', names.at(-1)],
    ['ArrowRight', names[0]],
    ['ArrowLeft', names.at(-1)],
    ['Home', names[0]],
  ]
  for (const [key, expected] of steps) {
    await page.keyboard.press(key)
    expect(await focusedTab(page), `${label}: ${key}`).toBe(expected)
    state = await semantics()
    expect(state.selected, `${label}: ${key} selects`).toEqual([expected])
    expect(state.tabStops).toEqual([expected])
    expect(state.panelRole).toBe('tabpanel')
    expect(state.labelledBy).toBe(state.selectedId)
  }
  await expectFocusVisible(page)

  // Every tab is reachable with the keyboard.
  const reached = new Set([names[0]])
  for (let index = 1; index < names.length; index += 1) {
    await page.keyboard.press('ArrowRight')
    reached.add(await focusedTab(page))
  }
  expect([...reached].sort()).toEqual([...names].sort())
  await page.keyboard.press('Home')

  // Tab enters the tablist once: from the selected tab, Tab leaves the list,
  // Shift+Tab comes back to the selected tab.
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement.getAttribute('role'))).not.toBe('tab')
  await expectFocusVisible(page)
  await page.keyboard.press('Shift+Tab')
  expect(await focusedTab(page)).toBe(names[0])

  // A selected tab by mouse keeps working and becomes the Tab stop.
  await tabs.nth(2).click()
  state = await semantics()
  expect(state.selected).toEqual([names[2]])
  expect(state.tabStops).toEqual([names[2]])
  await tabs.first().click()

  await expectNoBlockingAxeViolations(page, testInfo, `${label}-tabs`, { block: moderate })
}

test.describe('tab keyboard navigation (8Y A-8Y-N1, B-8Y-N1)', () => {
  test('Stället: every tab is reachable; arrows, Home, End and wrap', async ({ page }, testInfo) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Stället', 'social')
    const tablist = page.locator('#app-section-social [role=tablist]')
    await expect(tablist).toHaveAccessibleName(/.+/)
    await expectTabsPattern(page, tablist, testInfo, 'social')
    // The panel content follows the tab.
    await tablist.getByRole('tab').first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#app-section-social [role=tabpanel]')).toHaveAttribute('id', 'social-room-panel-chat')
  })

  test('Ekonomi: one Tab stop, arrows, Home, End, wrap and a labelled tabpanel', async ({ page }, testInfo) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Mer', 'more')
    await page.locator('#app-section-more').getByRole('button', { name: /^Ekonomi/ }).first().click()
    const activate = page.locator('.economy-activation').getByRole('button')
    await activate.click()
    const tablist = page.locator('#app-section-more .economy-tabs[role=tablist]')
    await expect(tablist).toBeVisible()
    await expectTabsPattern(page, tablist, testInfo, 'economy')
    await tablist.getByRole('tab').first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#economy-tabpanel')).toHaveAttribute('aria-labelledby', 'economy-tab-purchases')
    await expect(page.locator('#economy-tabpanel').getByRole('heading', { level: 2 }).first()).toHaveText('Köp')
    // The shared tabpanel wrapper does not change the layout: no sideways
    // scroll at 320 px in the tabs. Known exception, found in 8Z1 and the
    // same without the wrapper: "Översikt" scrolls 25 px (8Z1 B-8Z1-N1,
    // planned for 8Z3). When it is fixed this check fails; remove the entry.
    const knownOverflow = { Översikt: 'B-8Z1-N1' }
    await page.setViewportSize({ height: 640, width: 320 })
    for (const name of await tablist.getByRole('tab').allInnerTexts()) {
      await tablist.getByRole('tab', { name, exact: true }).click()
      if (knownOverflow[name]) {
        await expect.poll(() => horizontalOverflow(page), { message: `stale: ${knownOverflow[name]} no longer reproduces; remove it` }).toBeGreaterThan(1)
      } else {
        await expect.poll(() => horizontalOverflow(page), { message: `${name}: sideways scroll at 320 px` }).toBeLessThanOrEqual(1)
      }
    }
  })
})
