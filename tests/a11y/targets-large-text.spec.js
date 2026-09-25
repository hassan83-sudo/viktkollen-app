import { expect, test } from '@playwright/test'
import { goToSection, horizontalOverflow, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8R: target size (WCAG 2.5.8) for the controls found in 8M (B5, B-N2,
// B-N3) and large-text robustness of the Redo tiles (B8, WCAG 1.4.4/1.4.10).
//
// A target's hit area is what a pointer actually reaches: the control's box,
// or for a checkbox inside a <label>, the label's box (clicking the label
// toggles the box). Each hit area must be at least 24 x 24 CSS px, and the
// points just inside its top and bottom edges must hit the control itself
// (nothing may cover the enlarged area).

const minimum = 24
const moderate = ['critical', 'serious', 'moderate']

// Runs in the page: the hit area of one control.
function hitArea(element) {
  const label = element.matches('input[type=checkbox], input[type=radio]') ? element.closest('label') || (element.id && document.querySelector(`label[for="${element.id}"]`)) : null
  const area = label || element
  const rect = area.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const reaches = (y) => {
    if (y < 0 || y >= window.innerHeight) return true
    const hit = document.elementFromPoint(x, y)
    return Boolean(hit && (area === hit || area.contains(hit) || element === hit))
  }
  return {
    coveredEdge: !reaches(rect.top + 1) || !reaches(rect.bottom - 1),
    height: Math.round(rect.height * 10) / 10,
    name: (label?.innerText || element.innerText || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    via: label ? 'label' : element.tagName.toLowerCase(),
    width: Math.round(rect.width * 10) / 10,
  }
}

function smallTargets(areas) {
  return areas.filter((area) => area.width < minimum || area.height < minimum || area.coveredEdge)
    .map((area) => `${area.name} (${area.via}) ${area.width}x${area.height}${area.coveredEdge ? ' edge covered' : ''}`)
}

async function scrollIntoViewAll(page, selector) {
  await page.locator(selector).first().scrollIntoViewIfNeeded()
}

async function openFolder(page, title, preferences = null) {
  await openApp(page, { preferences, reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${title}`) }).first()
  await folder.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: title }).first()).toBeVisible()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

// Each target, one at a time scrolled into view so elementFromPoint works.
async function measureEach(page, selector) {
  const targets = page.locator(selector)
  const areas = []
  for (let index = 0; index < await targets.count(); index += 1) {
    const target = targets.nth(index)
    if (!(await target.isVisible())) continue
    await target.scrollIntoViewIfNeeded()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    areas.push(await target.evaluate(hitArea))
  }
  return areas
}

async function expectKeyboardFocusVisible(page, locator) {
  await locator.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(locator).toBeFocused()
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.problems, focused.name).toEqual([])
}

test.describe('Target size (8M B5, B-N2, B-N3)', () => {
  test('Home: "Visa fler råd" and "Visa alla" are at least 24 px high, work with Enter/Space and show focus', async ({ page }, testInfo) => {
    await openApp(page, { reducedMotion: 'reduce' })
    const targets = '#app-section-home :is(.daily-coach-more, .smart-notifications-meta .secondary-button)'
    const areas = await measureEach(page, targets)
    expect(areas.map((area) => area.name)).toEqual(['Visa fler råd', 'Visa alla'])
    expect(smallTargets(areas)).toEqual([])

    const more = page.getByRole('button', { name: 'Visa fler råd' })
    const advice = page.locator('.daily-coach-advice')
    await expectKeyboardFocusVisible(page, more)
    const first = await advice.innerText()
    await page.keyboard.press('Enter')
    await expect(advice).not.toHaveText(first)
    const second = await advice.innerText()
    await page.keyboard.press('Space')
    await expect(advice).not.toHaveText(second)
    await expectKeyboardFocusVisible(page, page.getByRole('button', { name: 'Visa alla' }))
    await expectNoBlockingAxeViolations(page, testInfo, 'home-targets', { block: moderate })
  })

  test('checkboxes: every label hit area in Må bra, Mat, Teckenspråk, Import & Export, AI Coach and Plats is at least 24 x 24', async ({ page }, testInfo) => {
    const failures = []
    for (const title of ['Må bra', 'Mat', 'Teckenspråk', 'Import & Export', 'AI Coach']) {
      await openFolder(page, title)
      const areas = await measureEach(page, '#app-section-more input[type=checkbox]')
      expect(areas.length, `${title} has checkboxes`).toBeGreaterThan(0)
      failures.push(...smallTargets(areas).map((failure) => `${title}: ${failure}`))
      if (title === 'Må bra') {
        // Keyboard: Space toggles, focus is visible.
        const box = page.locator('.wellbeing-reasons input[type=checkbox]').first()
        await expectKeyboardFocusVisible(page, box)
        await page.keyboard.press('Space')
        await expect(box).toBeChecked()
        await page.keyboard.press('Space')
        await expect(box).not.toBeChecked()
        await expectNoBlockingAxeViolations(page, testInfo, 'mabra-targets', { block: moderate })
      }
    }
    await openApp(page, { reducedMotion: 'reduce' })
    await goToSection(page, 'Plats', 'place')
    const place = await measureEach(page, '#app-section-place input[type=checkbox]')
    expect(place.length).toBeGreaterThan(0)
    failures.push(...smallTargets(place).map((failure) => `Plats: ${failure}`))
    expect(failures).toEqual([])
  })

  test('AI Coach: "Varför detta råd?" and "Varför visas detta?" are at least 24 px high and toggle with Enter and Space', async ({ page }, testInfo) => {
    await openFolder(page, 'AI Coach')
    const selector = '#app-section-more :is(.coach-v2-recommendation summary, .insight-card details summary)'
    const areas = await measureEach(page, selector)
    expect(areas.map((area) => area.name)).toEqual(expect.arrayContaining(['Varför detta råd?', 'Varför visas detta?']))
    expect(smallTargets(areas)).toEqual([])
    // Every summary in the folder, not only these two.
    expect(smallTargets(await measureEach(page, '#app-section-more summary'))).toEqual([])

    const summary = page.locator(selector).first()
    const details = summary.locator('xpath=..')
    await expectKeyboardFocusVisible(page, summary)
    await expect(details).not.toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(details).toHaveAttribute('open', '')
    await page.keyboard.press('Space')
    await expect(details).not.toHaveAttribute('open', '')
    await expectNoBlockingAxeViolations(page, testInfo, 'ai-coach-targets', { block: moderate })
  })
})

// B8: Redo tiles must show their whole text with large text.
const largeModes = {
  'large-text-390': { deviceScaleFactor: 1, preferences: { largeControls: true, textSize: 'extra-large' }, viewport: { height: 844, width: 390 } },
  'large-text-320': { deviceScaleFactor: 1, preferences: { largeControls: true, textSize: 'extra-large' }, viewport: { height: 640, width: 320 } },
  'text-large-390': { deviceScaleFactor: 1, preferences: { textSize: 'large' }, viewport: { height: 844, width: 390 } },
  'zoom-200': { deviceScaleFactor: 2, preferences: null, viewport: { height: 400, width: 640 } },
  'reflow-320': { deviceScaleFactor: 1, preferences: null, viewport: { height: 640, width: 320 } },
  standard: { deviceScaleFactor: 1, preferences: null, viewport: { height: 844, width: 390 } },
}

// Runs in the page: text in the Redo tiles that is cut (ellipsis, clipped by
// an ancestor, or outside the page) or covered.
function tileTextProblems() {
  const shell = document.querySelector('#app-section-redo .ready-shell')
  const limit = shell.getBoundingClientRect()
  const problems = []
  const tiles = document.querySelectorAll('#app-section-redo :is(.ready-action-tile, .ready-info-tile)')
  for (const tile of tiles) {
    const tileRect = tile.getBoundingClientRect()
    for (const element of tile.querySelectorAll('strong, span, small, p')) {
      if (!element.getClientRects().length || !element.textContent.trim() || element.getAttribute('aria-hidden') === 'true') continue
      const style = getComputedStyle(element)
      const text = element.textContent.trim().slice(0, 40)
      // The rendered text width, measured with a Range: scrollWidth is
      // rounded and misses an ellipsis that cuts less than one pixel.
      const range = document.createRange()
      range.selectNodeContents(element)
      const textWidth = range.getBoundingClientRect().width
      const cutX = element.scrollWidth > element.clientWidth + 1 || (style.whiteSpace === 'nowrap' && textWidth > element.clientWidth + 0.5)
      if (style.textOverflow === 'ellipsis' && cutX) problems.push(`ellipsis: "${text}"`)
      if (style.overflowX !== 'visible' && cutX) problems.push(`clipped horizontally: "${text}"`)
      if (style.overflowY !== 'visible' && element.scrollHeight > element.clientHeight + 1) problems.push(`clipped vertically: "${text}"`)
      for (const rect of range.getClientRects()) {
        if (!rect.width) continue
        if (rect.left < tileRect.left - 1 || rect.right > tileRect.right + 1) problems.push(`outside its tile: "${text}" ${Math.round(rect.left)}-${Math.round(rect.right)} tile ${Math.round(tileRect.left)}-${Math.round(tileRect.right)}`)
        if (rect.right > limit.right + 1 || rect.left < limit.left - 1) problems.push(`cut by the page: "${text}"`)
      }
    }
  }
  return { problems: [...new Set(problems)], tiles: tiles.length }
}

for (const [modeName, { deviceScaleFactor, preferences, viewport }] of Object.entries(largeModes)) {
  test.describe(`Redo tiles, large text (8M B8, ${modeName})`, () => {
    test.use({ deviceScaleFactor, viewport })

    test('every tile shows its whole text: no ellipsis, no clipping, no sideways scroll', async ({ page }, testInfo) => {
      await openApp(page, { preferences, reducedMotion: 'reduce' })
      await goToSection(page, 'Redo!', 'redo')
      const nothingPlanned = page.locator('#app-section-redo .ready-info-tile-copy span', { hasText: 'Inget planerat ännu' })
      await expect(nothingPlanned).toBeVisible()
      await expect(page.locator('#app-section-redo .ready-action-tile strong', { hasText: 'Minnesträning' })).toBeVisible()
      await scrollIntoViewAll(page, '#app-section-redo .ready-bottom-row')
      const { problems, tiles } = await page.evaluate(tileTextProblems)
      expect(tiles).toBeGreaterThanOrEqual(5)
      expect(problems).toEqual([])
      expect(await horizontalOverflow(page), 'page scrolls sideways').toBeLessThanOrEqual(1)
      if (modeName === 'large-text-390') await expectNoBlockingAxeViolations(page, testInfo, 'redo-large-text', { block: moderate })
    })
  })
}
