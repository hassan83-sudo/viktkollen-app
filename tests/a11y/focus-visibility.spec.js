import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8I: WCAG 2.4.7 / 2.4.11 in real Chromium (geometry cannot be proven in
// jsdom). For every Tab stop in a view, the focused control must be inside
// the viewport, above the fixed bottom navigation and not covered by any
// other element.
//
// Known, separately tracked exception (8H A2, awaiting a product decision):
// the two visually hidden Home header buttons inside `.overview-header-actions`
// (sr-only). They are skipped by selector here and nowhere else.
const knownHiddenFocusTargets = '.overview-header-actions.sr-only'

const modes = {
  normal: { preferences: null, viewport: { height: 844, width: 390 } },
  'zoom-200': { preferences: null, viewport: { height: 400, width: 640 } },
  'reflow-320': { preferences: null, viewport: { height: 640, width: 320 } },
  'large-text-and-controls': { preferences: { largeControls: true, textSize: 'extra-large' }, viewport: { height: 844, width: 390 } },
}

// Measures the focused element. Returns null when focus is in the bottom nav
// (the end of the view's own content) or on <body>.
function measureFocus(page) {
  return page.evaluate((skipSelector) => {
    const element = document.activeElement
    if (!element || element === document.body) return { body: true }
    if (element.closest('.bottom-nav')) return { nav: true }
    const name = (element.getAttribute('aria-label') || element.innerText || element.value || element.tagName).trim().split('\n')[0].slice(0, 40)
    if (element.closest(skipSelector)) return { name, skipped: true }
    const rect = element.getBoundingClientRect()
    const navTop = document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? window.innerHeight
    const problems = []
    if (rect.width < 2 || rect.height < 2) problems.push('zero-size')
    if (rect.top < 0 || rect.left < 0 || rect.right > window.innerWidth + 1) problems.push('outside-viewport')
    if (rect.bottom > navTop + 1) problems.push(`below-nav-top(${Math.round(rect.bottom)}>${Math.round(navTop)})`)
    // Covered: probe the centre and a point near the bottom edge.
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1)
    for (const y of [rect.top + rect.height / 2, rect.bottom - Math.min(4, rect.height / 4)]) {
      if (y < 0 || y >= window.innerHeight) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) {
        problems.push(`covered-by:${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`)
        break
      }
    }
    return { name, problems }
  }, knownHiddenFocusTargets)
}

async function tabThroughView(page, maxStops = 70) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  const failures = []
  let stops = 0
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press('Tab')
    // Let focus scrolling (browser + app) and focus transitions settle.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
    const result = await measureFocus(page)
    if (result.nav) break
    if (result.body || result.skipped) continue
    stops += 1
    if (result.problems.length) failures.push(`${result.name}: ${result.problems.join(', ')}`)
  }
  return { failures, stops }
}

const views = {
  Hem: async () => {},
  'Redo!': (page) => goToSection(page, 'Redo!', 'redo'),
  'Min resa': (page) => goToSection(page, 'Min resa', 'journey'),
  Stället: (page) => goToSection(page, 'Stället', 'social'),
  Mer: (page) => goToSection(page, 'Mer', 'more'),
  Tillgänglighet: (page) => openAccessibilityFolder(page),
}

for (const [modeName, { preferences, viewport }] of Object.entries(modes)) {
  test.describe(`focus not obscured (${modeName})`, () => {
    test.use({ viewport })

    for (const [viewName, open] of Object.entries(views)) {
      test(`${viewName}: every Tab stop is visible and above the bottom navigation`, async ({ page }) => {
        // Instant scrolling: smooth scrolling would be measured mid-animation.
        await openApp(page, { preferences, reducedMotion: 'reduce' })
        await open(page)
        const { failures, stops } = await tabThroughView(page)
        expect(stops, 'the view has keyboard stops').toBeGreaterThan(0)
        expect(failures).toEqual([])
      })
    }
  })
}
