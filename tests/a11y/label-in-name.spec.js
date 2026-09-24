import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
import { bottomNavLink, goToSection, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8G: WCAG 2.5.3 Label in Name and unique landmarks in the running app.
//
// axe's label-content-name-mismatch rule is tagged "experimental", so the
// general axe gate (axe-views.spec.js, WCAG tag sets) does not include it.
// It is run here on its own, enabled explicitly by rule id, together with
// landmark-unique. It is deterministic: fixed data, no network, no timers
// involved. It fails the run on any finding.
//
// The one exclusion: the Home Body Scan card keeps its existing label because
// Body Scan is outside the accessibility sprints' scope (owned elsewhere).

const require = createRequire(import.meta.url)
const axeSourcePath = require.resolve('axe-core/axe.min.js')
const bodyScanCard = '.overview-primary-action.is-body .overview-primary-action-hit'

async function nameAndLandmarkFindings(page) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: axeSourcePath })
  return page.evaluate(async (exclude) => {
    const result = await window.axe.run({ exclude: [[exclude]] }, { resultTypes: ['violations'], runOnly: { type: 'rule', values: ['label-content-name-mismatch', 'landmark-unique'] } })
    return result.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`))
  }, bodyScanCard)
}

// Chrome's own computed accessible names (what screen readers and voice
// control receive), read through the DevTools accessibility tree.
async function chromeNames(page, selector) {
  const cdp = await page.context().newCDPSession(page)
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
  const names = []
  for (const nodeId of nodeIds) {
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { fetchRelatives: false, nodeId })
    names.push(String(nodes[0]?.name?.value || '').replace(/\s+/g, ' ').trim())
  }
  await cdp.detach()
  return names
}

function visibleLabels(page, selector, labelSelector) {
  return page.locator(selector).evaluateAll((elements, inner) => elements.map((element) => element.querySelector(inner).textContent.trim()), labelSelector)
}

test.describe('label in name (WCAG 2.5.3)', () => {
  test('bottom navigation: each link is named by its visible label', async ({ page }) => {
    await openApp(page)
    const labels = await visibleLabels(page, '.bottom-nav a', 'strong')
    expect(await chromeNames(page, '.bottom-nav a')).toEqual(labels)
    for (const label of ['Hem', 'Mer']) await expect(bottomNavLink(page, label)).toBeVisible()
  })

  test('Mer folders: name starts with the visible title and contains the description', async ({ page }) => {
    await openApp(page)
    await goToSection(page, 'Mer', 'more')
    const titles = await visibleLabels(page, '.more-hub-folder', 'strong')
    const descriptions = await visibleLabels(page, '.more-hub-folder', 'small')
    const names = await chromeNames(page, '.more-hub-folder')
    expect(names).toEqual(titles.map((title, index) => `${title} ${descriptions[index]}`))
  })

  test('Home cards: names contain the visible card text', async ({ page }) => {
    await openApp(page)
    const cards = await page.locator('.overview-mood-card:is(button), .overview-primary-action:not(.is-body) .overview-primary-action-hit').evaluateAll((elements) => elements.length)
    expect(cards).toBe(6)
    // Chrome's name follows the rendering: CSS text-transform (MÅ BRA) and
    // CSS-generated arrows (›) are included, so matching is case-insensitive.
    const names = await chromeNames(page, '.overview-mood-card:is(button)')
    expect(names[0]).toMatch(/^Må bra Hur känns dagen\? .*Öppna Må bra( ›)?$/i)
    expect(names[1]).toMatch(/^AI Coach Fråga din coach Skriv eller prata Öppna Coach( ›)?$/i)
    expect(names[2]).toMatch(/^Nästa påminnelse /i)
    expect(names[3]).toMatch(/^Notis /i)
    const primary = await chromeNames(page, '.overview-primary-action:not(.is-body) .overview-primary-action-hit')
    expect(primary[0]).toMatch(/AI Ögon Minne, kläder och sista kollen Tryck på bilden$/i)
    expect(primary[1]).toMatch(/Matscanning Skanna maten och uppskatta näringen Tryck på bilden$/i)
  })

  const views = [
    ['Hem', null],
    ['Redo!', 'redo'],
    ['Plats', 'place'],
    ['Mer', 'more'],
  ]
  for (const [label, sectionId] of views) {
    test(`axe label-content-name-mismatch + landmark-unique: ${label}`, async ({ page }) => {
      await openApp(page)
      if (sectionId) await goToSection(page, label, sectionId)
      expect(await nameAndLandmarkFindings(page)).toEqual([])
    })
  }

  test('axe label-content-name-mismatch + landmark-unique: Min resa, Stället, Tillgänglighet', async ({ page }) => {
    await openApp(page)
    for (const [label, sectionId] of [['Min resa', 'journey'], ['Stället', 'social']]) {
      await goToSection(page, label, sectionId)
      expect(await nameAndLandmarkFindings(page), label).toEqual([])
    }
    await openAccessibilityFolder(page)
    expect(await nameAndLandmarkFindings(page), 'Tillgänglighet').toEqual([])
  })
})

test.describe('landmarks on Hem', () => {
  test('Dagens läge and Viktkollen Live are each one named region', async ({ page }) => {
    await openApp(page)
    const home = page.locator('#app-section-home')
    await expect(home.getByRole('region', { name: 'Dagens läge', exact: true })).toHaveCount(1)
    await expect(home.getByRole('region', { name: 'Viktkollen Live', exact: true })).toHaveCount(1)
    await expect(home.getByRole('region', { name: 'Dagens läge', exact: true })).toHaveAttribute('aria-labelledby', 'overview-today-title')
  })
})
