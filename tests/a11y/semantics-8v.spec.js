import { expect, test } from '@playwright/test'
import { moreHubFolders } from '../../src/services/more/moreFolders.js'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'

// A11Y-8V: semantics and page structure (docs/accessibility/
// A11Y_8V_SEMANTICS_STRUCTURE.md), fixes for 8T B-8T-N5, B-8T-N6, B-8T-N7 and
// the 8M findings B2 (Mat heading order) and B3 (Ekonomi landmarks).
//
// The structure gate runs in every main section and every Mer folder:
// - no element has a name that is dropped because it has no role (a named
//   `generic` in Chromium's accessibility tree; axe misses these when the
//   element has content), 8T C-8T-N2;
// - exactly one visible h1;
// - region landmark names are unique.

const mainSections = [['Hem', 'home'], ['Redo!', 'redo'], ['Plats', 'place'], ['Min resa', 'journey'], ['Stället', 'social']]

async function openFolder(page, folder) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const title = folder.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const button = page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${title}`) }).first()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: folder.title }).first()).toBeVisible()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
  if (folder.id === 'ai-coach') await expect(page.locator('#achievements .achievement-card').first()).toBeVisible({ timeout: 15000 })
}

async function namedGenerics(page) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const found = []
  for (const node of nodes.filter((candidate) => !candidate.ignored && ['generic', 'none'].includes(candidate.role?.value) && candidate.name?.value)) {
    const { node: dom } = await cdp.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId })
    const className = (dom.attributes || []).find((_, index, list) => list[index - 1] === 'class') || ''
    found.push(`${dom.localName}.${className.split(' ')[0]} "${node.name.value}"`)
  }
  await cdp.detach()
  return found
}

async function structure(page) {
  return page.evaluate(() => {
    const visible = (element) => element.getClientRects().length > 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]')
    const h1 = [...document.querySelectorAll('h1')].filter(visible).map((element) => element.textContent.trim())
    const name = (element) => element.getAttribute('aria-label')
      || (element.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent.trim()).join(' ').trim()
    const regions = [...document.querySelectorAll('section, [role="region"]')]
      .filter(visible)
      .filter((element) => element.getAttribute('role') === 'region' || element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'))
      .map(name)
      .filter(Boolean)
    return { duplicateRegions: regions.filter((region, index) => regions.indexOf(region) !== index), h1 }
  })
}

async function expectStructure(page, label) {
  expect(await namedGenerics(page), `${label}: named generic`).toEqual([])
  const { duplicateRegions, h1 } = await structure(page)
  expect(h1, `${label}: one visible h1`).toHaveLength(1)
  expect(duplicateRegions, `${label}: duplicate region names`).toEqual([])
}

test.describe('structure gate: named generics, one h1, unique regions (8T B-8T-N5, B-8T-N7, B3)', () => {
  test('main sections', async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    for (const [label, id] of mainSections) {
      if (id !== 'home') await goToSection(page, label, id)
      await expectStructure(page, label)
    }
  })

  test('every Mer folder', async ({ page }) => {
    test.setTimeout(240000)
    expect(moreHubFolders).toHaveLength(17)
    for (const folder of moreHubFolders) {
      await openFolder(page, folder)
      await expectStructure(page, folder.title)
    }
  })

  test('the named groups are real groups, and value text is not renamed', async ({ page }) => {
    await openApp(page, { reducedMotion: 'reduce' })
    await expect(page.getByRole('group', { name: 'Styr Viktkollen Live' }).getByRole('button')).toHaveCount(3)
    await expect(page.getByRole('group', { name: 'Viktiga snabbknappar' }).getByRole('button').first()).toBeVisible()

    await goToSection(page, 'Redo!', 'redo')
    const ring = page.locator('.ready-progress-ring')
    await expect(ring).not.toHaveAttribute('aria-label', /.*/)
    await expect(ring).toHaveText(/\d+ av \d+ klara/)

    await goToSection(page, 'Stället', 'social')
    for (const name of ['Välj ljudmiljö', 'Välj avstängningstimer']) {
      const group = page.getByRole('group', { name })
      await expect(group.getByRole('button').first()).toBeVisible()
      await expect(group.getByRole('button', { pressed: true })).toHaveCount(1)
    }

    await openFolder(page, moreHubFolders.find((folder) => folder.id === 'import-export'))
    await expect(page.getByRole('group', { name: 'Valbara exportsektioner' }).getByRole('checkbox').first()).toBeVisible()
  })
})

test.describe('AI Coach live regions (8T B-8T-N6)', () => {
  test('no large or nested live regions; the filter result is announced in one small status', async ({ page }) => {
    await openFolder(page, moreHubFolders.find((folder) => folder.id === 'ai-coach'))
    const live = await page.evaluate(() => [...document.querySelectorAll('#app-section-more :is([aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"], [role="log"])')]
      .map((element) => ({
        className: String(element.className),
        length: element.textContent.trim().length,
        nested: Boolean(element.parentElement.closest('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"], [role="log"]')),
      })))
    expect(live.length).toBeGreaterThan(0)
    expect(live.filter((region) => region.length > 200), 'live region over 200 characters').toEqual([])
    expect(live.filter((region) => region.nested), 'live region inside another live region').toEqual([])
    for (const selector of ['.coach-suggestions', '.insight-overview', '.insight-plan', '.reminder-summary-grid']) {
      await expect(page.locator(`#app-section-more ${selector}[aria-live]`), selector).toHaveCount(0)
    }

    const journey = page.locator('#health-journey-center')
    const status = journey.locator('p.sr-only[role="status"]')
    await expect(status).toHaveText(/^\d+ journey-händelser visas\.$/)
    const before = await status.innerText()
    await journey.getByRole('combobox', { name: 'Period' }).selectOption('7d')
    await journey.getByRole('combobox', { name: 'Tema' }).selectOption('weight')
    await expect(status).not.toHaveText(before)
    const count = await journey.locator('.reminder-card-list > li').count()
    await expect(status).toHaveText(`${count} journey-händelser visas.`)
    const regions = await page.evaluate((text) => [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].filter((element) => element.textContent.includes(text)).length, `${count} journey-händelser`)
    expect(regions).toBe(1)
  })
})

test.describe('Mat heading order (8M B2) and Ekonomi landmarks (8M B3)', () => {
  test('Mat: h1 "Mat", then h2 "Mat", then h3; no skipped level', async ({ page }, testInfo) => {
    await openFolder(page, moreHubFolders.find((folder) => folder.id === 'mat'))
    const levels = await page.locator('#app-section-more').evaluate((section) => [...section.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ level: Number(element.tagName[1]), text: element.textContent.trim() })))
    expect(levels.slice(0, 2)).toEqual([{ level: 1, text: 'Mat' }, { level: 2, text: 'Mat' }])
    const skips = levels.filter((heading, index) => index > 0 && heading.level > levels[index - 1].level + 1)
    expect(skips).toEqual([])
    await expect(page.locator('#nutrition-action-plan-title')).toHaveJSProperty('tagName', 'H3')
    await expectNoBlockingAxeViolations(page, testInfo, 'mat-8v', { block: ['critical', 'serious', 'moderate'], include: '#app-section-more' })
  })

  test('Ekonomi: one region named "Ekonomi"', async ({ page }, testInfo) => {
    await openFolder(page, moreHubFolders.find((folder) => folder.id === 'ekonomi'))
    await expect(page.getByRole('region', { name: 'Ekonomi', exact: true })).toHaveCount(1)
    await expect(page.locator('#app-section-more').getByRole('heading', { level: 2, name: 'Ekonomi' })).toBeVisible()
    await expectNoBlockingAxeViolations(page, testInfo, 'ekonomi-8v', { block: ['critical', 'serious', 'moderate'] })
  })
})
