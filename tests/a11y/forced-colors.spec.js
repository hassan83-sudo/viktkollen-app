import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { runAxe } from './support/axe.js'
import { tabStops } from './support/hiddenFocus.js'

// A11Y-8S (8M B11): forced colors (Windows contrast themes), emulated in
// Chromium with emulateMedia({ forcedColors: 'active' }).
//
// The gate reads computed styles, which Chromium reports after forcing:
// backgrounds become Canvas (alpha kept), gradients and box shadows are
// removed, text/border/outline colours become system colours. It is not a
// pixel test, so it does not depend on a Chromium version's rendering. What
// it cannot prove: the real colours of a user's Windows theme, and SVGs or
// images inside a real Windows session (manual test, see
// docs/accessibility/A11Y_8S_FORCED_COLORS.md).

async function forced(page) {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
}

async function openForced(page) {
  await forced(page)
  await openApp(page, { reducedMotion: 'reduce' })
  await forced(page)
}

async function openFolderForced(page, title) {
  await openForced(page)
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${title}`) }).first()
  await folder.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: title }).first()).toBeVisible()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

// No focus and no hover, so only the state itself is compared.
async function settle(page) {
  await page.evaluate(() => document.activeElement?.blur())
  await page.mouse.move(0, 0)
}

// Runs in the page. A selected item (current navigation link, pressed
// toggle, selected tab/option, checked custom control) must differ from an
// unselected sibling in something forced colors keeps: borders, outline,
// text decoration, font weight/style or text colour. Backgrounds do not
// count, since they all become Canvas.
function forcedStateProblems() {
  const selected = '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]'
  const signature = (element) => {
    const style = getComputedStyle(element)
    const border = (side) => `${style[`border${side}Style`]} ${style[`border${side}Width`]} ${style[`border${side}Color`]}`
    return [border('Top'), border('Right'), border('Bottom'), border('Left'), `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`, style.textDecorationLine, style.fontWeight, style.fontStyle, style.color].join(' | ')
  }
  const problems = []
  let compared = 0
  for (const element of document.querySelectorAll(selected)) {
    if (!element.getClientRects().length || element.matches('input')) continue
    const sibling = [...(element.parentElement?.children || [])].find((other) => other !== element && other.tagName === element.tagName && !other.matches(selected) && other.getClientRects().length)
    if (!sibling) continue
    compared += 1
    if (signature(element) === signature(sibling)) problems.push(`${element.tagName.toLowerCase()} "${(element.innerText || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" looks like its unselected sibling`)
  }
  return { compared, problems }
}

// Runs in the page. Every visible progress bar has a visible track (a border)
// and, when its value is above zero, a fill that is not Canvas.
function forcedProgressProblems() {
  const problems = []
  let checked = 0
  const canvas = getComputedStyle(document.body).backgroundColor
  for (const bar of document.querySelectorAll('[role="progressbar"], .achievement-progress, .report-progressbar, .achievement-preview-progress')) {
    if (!bar.getClientRects().length) continue
    checked += 1
    const style = getComputedStyle(bar)
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].some((side) => style[`border${side}Style`] !== 'none' && Number.parseFloat(style[`border${side}Width`]) > 0)
    const label = bar.getAttribute('aria-label') || bar.className
    if (!bordered) problems.push(`progress "${label}": no visible track`)
    const fill = bar.querySelector('span')
    if (fill && fill.getBoundingClientRect().width > 0) {
      const background = getComputedStyle(fill).backgroundColor
      const alpha = Number.parseFloat((background.match(/rgba?\(([^)]+)\)/)?.[1] || '0,0,0,0').split(',')[3] ?? '1')
      if (!alpha || background === canvas) problems.push(`progress "${label}": fill is invisible (${background})`)
    }
  }
  return { checked, problems }
}

// Runs in the page. Boundaries that carry meaning keep a visible border.
function forcedBorderProblems(selectors) {
  return selectors.flatMap((selector) => {
    const element = [...document.querySelectorAll(selector)].find((candidate) => candidate.getClientRects().length)
    if (!element) return [`${selector}: not rendered`]
    const style = getComputedStyle(element)
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((side) => style[`border${side}Style`] !== 'none' && Number.parseFloat(style[`border${side}Width`]) > 0)
    return sides.length === 4 ? [] : [`${selector}: border on ${sides.length} of 4 sides`]
  })
}

// Runs in the page. Visible controls keep visible text: a non-empty box and
// a text colour that differs from the Canvas background.
function forcedControlProblems(root) {
  const canvas = getComputedStyle(document.body).backgroundColor
  return [...document.querySelectorAll(`${root} :is(button, a[href], summary, select, input:not([type=hidden]))`)]
    .filter((element) => element.getClientRects().length && !element.closest('.sr-only, [aria-hidden="true"]'))
    .flatMap((element) => {
      const rect = element.getBoundingClientRect()
      const color = getComputedStyle(element).color
      const name = (element.innerText || element.getAttribute('aria-label') || element.value || '').trim().slice(0, 30)
      if (rect.width < 1 || rect.height < 1) return [`${name}: no box`]
      if (color === canvas) return [`${name}: text colour equals the background`]
      return []
    })
}

test.describe('forced colors (8M B11)', () => {
  test('bottom navigation: the current section is marked, in every section; focus stays visible', async ({ page }) => {
    await openForced(page)
    for (const [label, id] of [['Hem', null], ['Redo!', 'redo'], ['Plats', 'place'], ['Min resa', 'journey'], ['Stället', 'social'], ['Mer', 'more']]) {
      if (id) await goToSection(page, label, id)
      await settle(page)
      const { compared, problems } = await page.evaluate(forcedStateProblems)
      expect(compared, label).toBeGreaterThan(0)
      expect(problems, label).toEqual([])
    }
    // The current link keeps a focus ring distinct from its selected mark.
    const current = page.locator('.bottom-nav a[aria-current="page"]')
    await current.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(current).toBeFocused()
    const outline = (element) => { const style = getComputedStyle(element); return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}` }
    const focusedOutline = await current.evaluate(outline)
    await settle(page)
    const selectedOutline = await current.evaluate(outline)
    expect(focusedOutline).not.toMatch(/^none/)
    expect(focusedOutline).not.toBe(selectedOutline)
  })

  test('every Tab stop has a visible focus indicator in Hem, Redo, Min resa, Mat, AI Coach and Må bra', async ({ page }) => {
    const failures = []
    const check = async (label) => {
      const stops = await tabStops(page, 260)
      expect(stops.length, label).toBeGreaterThan(0)
      failures.push(...stops.filter((stop) => stop.problems.length).map((stop) => `${label}: ${stop.name}: ${stop.problems.join(', ')}`))
    }
    await openForced(page)
    await check('Hem')
    await goToSection(page, 'Redo!', 'redo')
    await check('Redo')
    await goToSection(page, 'Min resa', 'journey')
    await check('Min resa')
    for (const title of ['Mat', 'AI Coach', 'Må bra']) {
      await openFolderForced(page, title)
      await check(title)
    }
    expect(failures).toEqual([])
  })

  test('selected chips, tabs, segments and toggles are marked (Min resa, Stället, AI Coach, Tillgänglighet)', async ({ page }) => {
    await openForced(page)
    for (const [label, id] of [['Min resa', 'journey'], ['Stället', 'social']]) {
      await goToSection(page, label, id)
      await settle(page)
      const { compared, problems } = await page.evaluate(forcedStateProblems)
      expect(compared, label).toBeGreaterThan(1)
      expect(problems, label).toEqual([])
    }
    // Min resa: the selected view is also programmatic.
    await goToSection(page, 'Min resa', 'journey')
    await expect(page.getByRole('group', { name: 'Min resa - navigering' }).getByRole('button', { name: 'Översikt' })).toHaveAttribute('aria-pressed', 'true')
    for (const title of ['AI Coach', 'Tillgänglighet & hjälpmedel']) {
      await openFolderForced(page, title)
      await settle(page)
      const { compared, problems } = await page.evaluate(forcedStateProblems)
      expect(compared, title).toBeGreaterThan(0)
      expect(problems, title).toEqual([])
    }
  })

  test('progress bars keep a track and a fill; cards and status keep their borders; controls keep text', async ({ page }) => {
    await openFolderForced(page, 'AI Coach')
    const progress = await page.evaluate(forcedProgressProblems)
    expect(progress.checked).toBeGreaterThan(2)
    expect(progress.problems).toEqual([])
    expect(await page.evaluate(forcedBorderProblems, ['.achievement-card', '.achievement-section', '.coach-v2-recommendation', '.social-card'])).toEqual([])
    expect(await page.evaluate(forcedControlProblems, '#achievements')).toEqual([])

    await openFolderForced(page, 'Mat')
    expect(await page.evaluate(forcedBorderProblems, ['.nutrition-card', '.nutrition-recommendation-card'])).toEqual([])
    expect(await page.evaluate(forcedControlProblems, '#app-section-more .nutrition-action-plan')).toEqual([])

    await openForced(page)
    expect(await page.evaluate(forcedBorderProblems, ['.daily-coach-card', '.smart-notifications-card', '.smart-feed-card', '.overview-weather-empty', '.bottom-nav'])).toEqual([])
    // Live feed dots: drawn, and the current one is wider.
    const dots = await page.locator('.smart-feed-dots span').evaluateAll((spans) => spans.map((span) => ({ active: span.classList.contains('is-active'), background: getComputedStyle(span).backgroundColor, width: span.getBoundingClientRect().width })))
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(dots.length).toBeGreaterThan(1)
    dots.forEach((dot) => expect(dot.background).not.toBe(canvas))
    expect(Math.min(...dots.filter((dot) => dot.active).map((dot) => dot.width))).toBeGreaterThan(Math.max(...dots.filter((dot) => !dot.active).map((dot) => dot.width)))

    await goToSection(page, 'Redo!', 'redo')
    expect(await page.evaluate(forcedBorderProblems, ['.ready-checklist-card', '.ready-action-tile', '.ready-info-tile', '.ready-add-form input'])).toEqual([])
    // Validation error: text stays readable (not only colour).
    await page.locator('.ready-add-form input').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#ready-add-error')).toHaveText(/Skriv vad/)
    await expect(page.locator('.ready-add-form input')).toHaveAttribute('aria-invalid', 'true')
    expect(await page.evaluate(forcedControlProblems, '#app-section-redo')).toEqual([])

    await openFolderForced(page, 'Må bra')
    expect(await page.evaluate(forcedControlProblems, '#app-section-more')).toEqual([])
  })

  test('dialog: bordered box, focus inside and visible, Escape closes', async ({ page }) => {
    await openForced(page)
    await goToSection(page, 'Redo!', 'redo')
    await page.locator('.ready-add-form input').fill('Nycklar')
    await page.keyboard.press('Enter')
    // Opened with the keyboard, so the initial focus is :focus-visible.
    await page.getByRole('button', { name: 'Radera Nycklar' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const box = await dialog.evaluate((element) => {
      const style = getComputedStyle(element)
      return ['Top', 'Right', 'Bottom', 'Left'].filter((side) => style[`border${side}Style`] !== 'none' && Number.parseFloat(style[`border${side}Width`]) > 0).length
    })
    expect(box, 'dialog border sides').toBe(4)
    const focused = await page.evaluate(() => {
      const element = document.activeElement
      const style = getComputedStyle(element)
      return { inside: Boolean(element.closest('[role="dialog"]')), outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 }
    })
    expect(focused).toEqual({ inside: true, outline: true })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  // axe's color-contrast rule reads the authored colours, not the forced
  // ones: it reported the "Online" pill as #5cff9a on white (1.29:1) while
  // Chromium renders it rgb(0, 0, 0). That one rule is off in this scan;
  // forcedControlProblems checks forced text colours instead.
  test('axe in forced colors: no critical, serious or moderate violations on Hem, Redo and AI Coach', async ({ page }, testInfo) => {
    const moderate = ['critical', 'serious', 'moderate']
    const scan = async () => {
      await runAxe(page)
      return page.evaluate(async () => {
        const result = await window.axe.run(document, {
          resultTypes: ['violations'],
          rules: { 'color-contrast': { enabled: false } },
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        })
        return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target.join(' ')) }))
      })
    }
    const results = {}
    await openForced(page)
    results.Hem = await scan()
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.pwa-network-pill')).color)).not.toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    await goToSection(page, 'Redo!', 'redo')
    results.Redo = await scan()
    await openFolderForced(page, 'AI Coach')
    results['AI Coach'] = await scan()
    await testInfo.attach('axe-forced-colors.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
    const blocking = Object.entries(results).flatMap(([view, violations]) => violations.filter((violation) => moderate.includes(violation.impact)).map((violation) => `${view}: [${violation.impact}] ${violation.id} ${violation.targets.join(', ')}`))
    expect(blocking).toEqual([])
  })
})
