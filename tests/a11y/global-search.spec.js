import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8W (8M B4): GlobalSearch is a combobox with a listbox popup
// (docs/accessibility/A11Y_8W_GLOBAL_SEARCH.md). DOM focus stays in the
// field, the arrow keys move aria-activedescendant, the options are not Tab
// stops, and a small status region announces the number of matches.

const moderate = ['critical', 'serious', 'moderate']

async function openSearch(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: /^Inställningar/ })
  await folder.focus()
  await page.keyboard.press('Enter')
  const opener = page.getByRole('button', { name: 'Öppna global sökning' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const combobox = page.getByRole('combobox', { name: 'Sök i Viktkollen' })
  await expect(combobox).toBeFocused()
  return { combobox, opener }
}

// Chromium's accessibility tree for the combobox, its popup and the status.
async function axState(page) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const raw = (node, name) => node?.properties?.find((entry) => entry.name === name)?.value
  const prop = (node, name) => raw(node, name)?.value
  const combobox = nodes.find((node) => node.role?.value === 'combobox')
  const listbox = nodes.find((node) => node.role?.value === 'listbox')
  const options = nodes.filter((node) => node.role?.value === 'option' && !node.ignored)
  const active = raw(combobox, 'activedescendant')?.relatedNodes?.[0]
  const controls = raw(combobox, 'controls')?.relatedNodes?.map((related) => related.backendDOMNodeId) || []
  const namedGeneric = nodes.filter((node) => !node.ignored && ['generic', 'none'].includes(node.role?.value) && node.name?.value).map((node) => node.name.value)
  const status = nodes.find((node) => node.role?.value === 'status')
  const statusText = status ? (status.childIds || []).map((id) => byId.get(id)?.name?.value || '').join('').trim() : null
  await cdp.detach()
  return {
    active: active ? options.find((option) => option.backendDOMNodeId === active.backendDOMNodeId)?.name?.value : null,
    controlsListbox: controls.includes(listbox?.backendDOMNodeId),
    expanded: prop(combobox, 'expanded'),
    listboxName: listbox?.name?.value,
    name: combobox?.name?.value,
    namedGeneric,
    options: options.map((option) => ({ name: option.name.value, selected: prop(option, 'selected') })),
    statusText,
  }
}

// aria-activedescendant is either absent or points to an existing option.
async function activeDescendant(page) {
  return page.evaluate(() => {
    const input = document.querySelector('.global-search-field input')
    const id = input.getAttribute('aria-activedescendant')
    if (!id) return null
    const target = document.getElementById(id)
    return { exists: Boolean(target), role: target?.getAttribute('role'), selected: target?.getAttribute('aria-selected'), text: target?.querySelector('strong')?.textContent }
  })
}

test.describe('GlobalSearch combobox (8M B4)', () => {
  test('A + G + F: combobox semantics, expanded state, status and 0 matches', async ({ page }, testInfo) => {
    const { combobox } = await openSearch(page)
    await expect(combobox).toHaveAttribute('aria-autocomplete', 'list')
    await expect(combobox).toHaveAttribute('aria-controls', 'global-search-results')
    await expect(page.locator('#global-search-results')).toHaveAttribute('role', 'listbox')

    // Opened: suggestions are shown, nothing is active, the status is quiet.
    let state = await axState(page)
    expect(state).toMatchObject({ active: null, controlsListbox: true, expanded: true, listboxName: 'Sökresultat', name: 'Sök i Viktkollen', namedGeneric: [], statusText: '' })
    expect(state.options.length).toBeGreaterThan(3)
    expect(state.options.every((option) => option.selected === false)).toBe(true)
    await expect(page.locator('#global-search-results [role="group"]').first()).toHaveAccessibleName(/.+/)
    await expectNoBlockingAxeViolations(page, testInfo, 'global-search-open', { block: moderate, include: '.global-search-dialog' })

    // Typed search: the status gives the number of matches.
    await page.keyboard.type('vikt')
    const count = await page.locator('#global-search-results [role="option"]').count()
    expect(count).toBeGreaterThan(1)
    const status = page.locator('#global-search-status')
    await expect(status).toHaveAttribute('role', 'status')
    await expect(status).toHaveText(`${count} träffar`)
    await expect(combobox).toHaveAttribute('aria-expanded', 'true')
    state = await axState(page)
    expect(state.statusText).toBe(`${count} träffar`)
    // Only the small status is live; the list is not.
    const live = await page.locator('.global-search-dialog').evaluate((dialog) => [...dialog.querySelectorAll('[role="status"], [role="alert"], [aria-live]')].map((element) => element.id))
    expect(live).toEqual(['global-search-status'])
    await expect(page.locator('#global-search-results')).not.toHaveAttribute('aria-live', /.*/)
    await expectNoBlockingAxeViolations(page, testInfo, 'global-search-typed', { block: moderate, include: '.global-search-dialog' })

    // 0 matches: understandable feedback in the status; the nearby
    // alternatives are a labelled group of options, so the popup stays open.
    await combobox.fill('zzqx')
    await expect(status).toHaveText('Inga exakta träffar för "zzqx". Här är närliggande alternativ.')
    await expect(page.getByRole('group', { name: /Inga exakta träffar/ }).getByRole('option').first()).toBeVisible()
    await expect(combobox).toHaveAttribute('aria-expanded', 'true')
    await expectNoBlockingAxeViolations(page, testInfo, 'global-search-empty', { block: moderate, include: '.global-search-dialog' })

    // Cleared: back to suggestions, the status is quiet again.
    await combobox.fill('')
    await expect(status).toHaveText('')
    await expect(combobox).not.toHaveAttribute('aria-activedescendant', /.*/)
  })

  test('B + H: ArrowDown/ArrowUp move the active option; aria-activedescendant never dangles', async ({ page }, testInfo) => {
    const { combobox } = await openSearch(page)
    await page.keyboard.type('vikt')
    const options = page.locator('#global-search-results [role="option"]')
    const count = await options.count()
    expect(await activeDescendant(page)).toBeNull()

    await page.keyboard.press('ArrowDown')
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')
    expect(await activeDescendant(page)).toMatchObject({ exists: true, role: 'option', selected: 'true' })
    await page.keyboard.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(options.nth(count - 1)).toHaveAttribute('aria-selected', 'true')
    await expect(combobox).toBeFocused()
    const state = await axState(page)
    expect(state.active).toBe(state.options.find((option) => option.selected === true).name)
    expect(state.options.filter((option) => option.selected === true)).toHaveLength(1)
    await expectNoBlockingAxeViolations(page, testInfo, 'global-search-active', { block: moderate, include: '.global-search-dialog' })

    // Changing the query or clearing it drops the active option.
    await page.keyboard.type('x')
    expect(await activeDescendant(page)).toBeNull()
    await page.keyboard.press('ArrowDown')
    expect(await activeDescendant(page)).toMatchObject({ exists: true })
    await combobox.fill('')
    expect(await activeDescendant(page)).toBeNull()
    await expect(page.locator('#global-search-results [aria-selected="true"]')).toHaveCount(0)
  })

  test('C: Enter opens the active option and focus lands on a visible element', async ({ page }) => {
    await openSearch(page)
    await page.keyboard.type('vikt')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const target = await activeDescendant(page)
    await page.keyboard.press('Enter')
    await expect(page.locator('.global-search-dialog')).toHaveCount(0)
    expect(target.text).toBeTruthy()
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
    await settleFocus(page)
    const focused = await page.evaluate(inspectFocusedElement)
    expect(focused.body, 'focus on <body>').toBeUndefined()
  })

  test('D + I: Tab order is field, Close, field (no option Tab stops); Escape closes and returns focus', async ({ page }) => {
    const { combobox, opener } = await openSearch(page)
    await page.keyboard.type('vikt')
    await expect(page.locator('#global-search-results [role="option"][tabindex="0"], #global-search-results [role="option"]:not([tabindex])')).toHaveCount(0)
    const close = page.locator('.global-search-field').getByRole('button', { name: 'Stäng' })

    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(combobox).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(combobox).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(page.locator('.global-search-dialog')).toHaveCount(0)
    await expect(opener).toBeFocused()

    // Reopened: fresh state, nothing active.
    await page.keyboard.press('Enter')
    await expect(combobox).toBeFocused()
    await expect(combobox).toHaveValue('')
    expect(await activeDescendant(page)).toBeNull()
  })
})
