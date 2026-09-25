import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { goToSection, openApp } from './support/app.js'
import { inspectFocusedElement, settleFocus, tabStops } from './support/hiddenFocus.js'

// A11Y-8N (8M A-N4 / C-N2).
//
// 1. The hidden-focus gate itself, on a fixed fixture: it must fail visually
//    hidden, transparent and off-screen Tab stops and controls without a
//    focus indicator, and must not fail screen reader only text, live
//    regions, a skip link that appears on focus, or a hidden input that is
//    not a Tab stop.
// 2. The import buttons that open a hidden native file input (Dataimport,
//    Framsteg and Mat import): the visible button is the only Tab stop, it
//    shows focus, is named, and opens the file chooser exactly once with
//    Enter, Space and a pointer click.

const fixture = `<!doctype html>
<html lang="sv"><head><style>
  body { margin: 0; padding: 16px; font: 16px sans-serif; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid #0ea5e9; outline-offset: 2px; }
  .skip-link { position: absolute; left: -9999px; }
  .skip-link:focus { left: 16px; top: 16px; }
  .offscreen { position: absolute; left: -9999px; }
  .transparent { opacity: 0; }
  .no-ring:focus-visible { outline: none; box-shadow: none; }
  .clip-box { width: 1px; height: 1px; overflow: hidden; }
</style></head><body>
  <a class="skip-link" href="#main" data-case="ok">Hoppa till huvudinnehåll</a>
  <main id="main">
    <p class="sr-only" data-case="ok">Endast skärmläsartext</p>
    <p role="status" class="sr-only" data-case="ok">3 träffar</p>
    <div aria-live="polite" class="visually-hidden" data-case="ok">Sparat</div>
    <button type="button" data-case="ok">Synlig knapp</button>
    <input type="file" class="sr-only" tabindex="-1" aria-hidden="true" data-case="ok">
    <input type="file" class="sr-only" aria-label="Dold filväljare" data-case="self-visually-hidden">
    <button type="button" class="visually-hidden" data-case="self-visually-hidden">Visuellt dold knapp</button>
    <div class="sr-only"><button type="button" data-case="inside-visually-hidden">Knapp i sr-only</button></div>
    <div class="clip-box"><button type="button" data-case="inside-visually-hidden">Knapp i 1px-ruta</button></div>
    <button type="button" class="transparent" data-case="transparent">Genomskinlig knapp</button>
    <button type="button" class="offscreen" data-case="off-screen">Knapp utanför skärmen</button>
    <button type="button" class="no-ring" data-case="no-focus-indicator">Knapp utan fokusring</button>
    <button type="button" data-case="ok">Sista knappen</button>
  </main>
</body></html>`

test.describe('hidden-focus gate (fixture)', () => {
  test('fails hidden or ring-less Tab stops, not screen reader only text, live regions or a skip link', async ({ page }) => {
    await page.setContent(fixture)
    const results = []
    await page.evaluate(() => document.activeElement?.blur())
    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press('Tab')
      await settleFocus(page)
      const expected = await page.evaluate(() => document.activeElement?.dataset.case || null)
      if (!expected) break
      const { problems } = await page.evaluate(inspectFocusedElement)
      results.push({ expected, problems })
      if (expected === 'ok' && (await page.evaluate(() => document.activeElement.textContent)) === 'Sista knappen') break
    }

    // Every Tab stop in the fixture was reached, in order.
    expect(results.map((result) => result.expected)).toEqual(['ok', 'ok', 'self-visually-hidden', 'self-visually-hidden', 'inside-visually-hidden', 'inside-visually-hidden', 'transparent', 'off-screen', 'no-focus-indicator', 'ok'])
    for (const { expected, problems } of results) {
      if (expected === 'ok') expect(problems).toEqual([])
      else expect(problems.some((problem) => problem.startsWith(expected)), `${expected}: got ${problems.join(', ')}`).toBe(true)
    }
  })
})

async function openMoreFolder(page, title) {
  await goToSection(page, 'Mer', 'more')
  const button = page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${title}`) }).first()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: title }).first()).toBeVisible()
}

async function tabUntilFocused(page, locator, maxStops = 120) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  for (let index = 0; index < maxStops; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(locator).toBeFocused()
}

// Counts native file chooser openings and clicks on the file input.
async function watchFileChooser(page, input) {
  const state = { choosers: 0 }
  page.on('filechooser', () => { state.choosers += 1 })
  await input.evaluate((element) => {
    window.__a11yFileInputClicks = 0
    element.addEventListener('click', () => { window.__a11yFileInputClicks += 1 })
  })
  return {
    async expectOpenedOnce(activate) {
      const before = { choosers: state.choosers, clicks: await page.evaluate(() => window.__a11yFileInputClicks) }
      const chooser = page.waitForEvent('filechooser')
      await activate()
      await chooser
      // Give a possible second activation time to arrive.
      await page.waitForTimeout(300)
      expect(state.choosers - before.choosers, 'file chooser openings').toBe(1)
      expect(await page.evaluate(() => window.__a11yFileInputClicks) - before.clicks, 'clicks on the file input').toBe(1)
    },
  }
}

async function expectVisibleFocus(page, button) {
  await settleFocus(page)
  const { problems, rect } = await page.evaluate(inspectFocusedElement)
  expect(problems).toEqual([])
  expect(rect.width).toBeGreaterThanOrEqual(24)
  expect(rect.height).toBeGreaterThanOrEqual(24)
  const ring = await button.evaluate((element) => {
    const style = getComputedStyle(element)
    return { outline: style.outlineStyle !== 'none' ? Number.parseFloat(style.outlineWidth) : 0, shadow: style.boxShadow }
  })
  expect(ring.outline >= 2 || ring.shadow !== 'none', `focus ring: ${JSON.stringify(ring)}`).toBe(true)
}

test.describe('Dataimport (8M A-N4)', () => {
  test('the visible "Välj fil" button is the only Tab stop and opens the file chooser once with Enter, Space and click', async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await openMoreFolder(page, 'Import & Export')
    const panel = page.locator('#data-import')
    const button = panel.getByRole('button', { name: 'Välj fil', exact: true })
    const input = panel.locator('input[type=file]')

    // Named by its visible text and described by the help text. The native
    // input keeps its own name and accepted types, but is not a Tab stop.
    await expect(button).toBeVisible()
    await expect(button).toHaveAccessibleDescription(/förhandsgranskning/)
    await expect(input).toHaveAttribute('tabindex', '-1')
    await expect(input).toHaveAttribute('aria-label', 'Välj Viktkollen-backup eller CSV-fil för säker import')
    await expect(input).toHaveAttribute('accept', '.json,.csv,.tsv,.txt,application/json,text/csv,text/plain')

    // 1-2: Tab reaches the visible button and its focus is visible.
    await tabUntilFocused(page, button)
    await expectVisibleFocus(page, button)

    // 3: the hidden input is not the next Tab stop, nor any Tab stop.
    await page.keyboard.press('Tab')
    expect(await input.evaluate((element) => element === document.activeElement)).toBe(false)
    const stops = await tabStops(page, 200)
    expect(stops.filter((stop) => stop.name.startsWith('input[type=file]'))).toEqual([])
    expect(stops.filter((stop) => stop.problems.length)).toEqual([])

    // 5-8: Enter, Space and click each open the chooser exactly once.
    const chooser = await watchFileChooser(page, input)
    await button.focus()
    await chooser.expectOpenedOnce(() => page.keyboard.press('Enter'))
    await button.focus()
    await chooser.expectOpenedOnce(() => page.keyboard.press('Space'))
    await chooser.expectOpenedOnce(() => button.click())

    // The import flow behind the input is unchanged: a chosen file is read
    // and previewed, nothing is saved.
    const picked = page.waitForEvent('filechooser')
    await button.click()
    await (await picked).setFiles({ buffer: Buffer.from('{"not":"a backup"}'), mimeType: 'application/json', name: 'test.json' })
    await expect(panel.getByRole('status')).toContainText(/Filen kunde inte|Förhandsgranskning klar/)
  })
})

// The same hidden-input pattern elsewhere in Claude-owned folders.
const otherImports = [
  {
    name: 'Framsteg → Historik & verktyg',
    button: 'Importera JSON',
    open: async (page) => {
      await openMoreFolder(page, 'Framsteg')
      await page.locator('#app-section-more').getByRole('button', { name: /^Historik & verktyg/ }).first().click()
    },
  },
  {
    name: 'Mat → Import, recension och mer',
    button: 'Välj säkerhetskopia',
    open: async (page) => {
      await openMoreFolder(page, 'Mat')
      await page.locator('#app-section-more summary', { hasText: 'Verktyg' }).click()
      await page.locator('#app-section-more').getByRole('button', { name: 'Import, recension och mer' }).click()
    },
  },
]

for (const { name, button: buttonName, open } of otherImports) {
  test(`${name}: the import button is the only Tab stop and opens the file chooser once`, async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await open(page)
    const button = page.locator('#app-section-more').getByRole('button', { name: buttonName, exact: true })
    await expect(button).toBeVisible()
    const input = button.locator('xpath=following-sibling::input[@type="file"]')
    await expect(input).toHaveAttribute('tabindex', '-1')
    await expect(input).toHaveAttribute('aria-hidden', 'true')

    await button.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
    await expectVisibleFocus(page, button)
    await page.keyboard.press('Tab')
    await settleFocus(page)
    // The next stop is the next visible control, or the bottom navigation.
    const next = await page.evaluate(inspectFocusedElement)
    expect(next.body, 'focus fell back to <body>').toBeUndefined()
    if (!next.nav) {
      expect(next.name.startsWith('input[type=file]'), `next Tab stop: ${next.name}`).toBe(false)
      expect(next.problems).toEqual([])
    }

    const chooser = await watchFileChooser(page, input)
    await button.focus()
    await chooser.expectOpenedOnce(() => page.keyboard.press('Enter'))
  })
}
