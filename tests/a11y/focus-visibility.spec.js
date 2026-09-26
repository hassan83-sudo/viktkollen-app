import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'
import { tabThroughView } from './support/obscuredFocus.js'

// A11Y-8I: WCAG 2.4.7 / 2.4.11 in real Chromium (geometry cannot be proven in
// jsdom). For every Tab stop in a view, the focused control must be inside
// the viewport, above the fixed bottom navigation and not covered by any
// other element, and it must not sit inside a visually hidden (clipped or
// 1px) container. That last rule is the A2 gate (8L): the 8I exception for the
// hidden Home header buttons is gone, because they are inert while hidden.
// A11Y-8N (8M C-N2): the generic hidden-focus gate also runs on every stop, so
// a control that is itself visually hidden (e.g. an sr-only file input),
// transparent, off-screen or without a focus indicator fails too.

const modes = {
  normal: { preferences: null, viewport: { height: 844, width: 390 } },
  'zoom-200': { preferences: null, viewport: { height: 400, width: 640 } },
  'reflow-320': { preferences: null, viewport: { height: 640, width: 320 } },
  'large-text-and-controls': { preferences: { largeControls: true, textSize: 'extra-large' }, viewport: { height: 844, width: 390 } },
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
