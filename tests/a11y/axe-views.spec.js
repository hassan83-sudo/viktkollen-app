import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'

// A11Y-8F: axe scans of the real app views and dialogs, in default mode and
// in the accessibility modes from 8B.

const modes = {
  default: null,
  'high-contrast': { highContrast: true },
  'large-text-and-controls': { largeControls: true, textSize: 'extra-large' },
}

for (const [modeName, preferences] of Object.entries(modes)) {
  test.describe(`axe views (${modeName})`, () => {
    test('Hem', async ({ page }, testInfo) => {
      await openApp(page, { preferences })
      await expectNoBlockingAxeViolations(page, testInfo, `home-${modeName}`)
    })

    test('Mer', async ({ page }, testInfo) => {
      await openApp(page, { preferences })
      await goToSection(page, 'Mer', 'more')
      await expectNoBlockingAxeViolations(page, testInfo, `more-${modeName}`)
    })

    test('Tillgänglighet', async ({ page }, testInfo) => {
      await openApp(page, { preferences })
      await openAccessibilityFolder(page)
      await expectNoBlockingAxeViolations(page, testInfo, `accessibility-${modeName}`)
    })

    test('AI Coach-dialog', async ({ page }, testInfo) => {
      await openApp(page, { preferences })
      await page.getByRole('button', { name: 'Öppna Coach' }).first().click()
      await expect(page.getByRole('dialog', { name: 'AI Coach' })).toBeVisible()
      await expectNoBlockingAxeViolations(page, testInfo, `ai-coach-${modeName}`)
    })
  })
}

test.describe('axe views (default, more surfaces)', () => {
  test('Tal & kommunikation', async ({ page }, testInfo) => {
    await openApp(page)
    await openAccessibilityFolder(page)
    await page.locator('#app-section-more').getByRole('button', { name: /^Tal & kommunikation/ }).click()
    await expect(page.getByRole('textbox', { name: /Säg detta åt mig/ })).toBeVisible()
    await expectNoBlockingAxeViolations(page, testInfo, 'communication')
  })

  test('Social-dialog', async ({ page }, testInfo) => {
    await openApp(page)
    await page.locator('#app-section-home').getByRole('button', { name: 'Lägg till vän' }).click()
    await expect(page.getByRole('dialog', { name: 'Vänner' })).toBeVisible()
    await expectNoBlockingAxeViolations(page, testInfo, 'social-dialog')
  })

  test('Ready-dialog', async ({ page }, testInfo) => {
    await openApp(page)
    await goToSection(page, 'Redo!', 'redo')
    await page.locator('#app-section-redo').getByRole('button', { name: /Minnesträning/ }).first().click()
    await expect(page.getByRole('dialog', { name: 'Alla tekniker' })).toBeVisible()
    await expectNoBlockingAxeViolations(page, testInfo, 'ready-dialog')
  })

  test('Place-dialog', async ({ page }, testInfo) => {
    await openApp(page)
    await goToSection(page, 'Plats', 'place')
    await page.locator('#app-section-place input[type=checkbox]').first().check()
    await page.locator('#app-section-place .place-feature-card.is-openable', { hasText: 'Batterisnålt' }).first().click()
    await expect(page.getByRole('dialog', { name: /Batterisnålt/ })).toBeVisible()
    await expectNoBlockingAxeViolations(page, testInfo, 'place-dialog')
  })
})

// A11Y-8I (8H C1/C4): every main section with the bottom navigation visible,
// so the navigation (active and inactive labels) is scanned in each section's
// own theme. These views had no moderate findings in the 8H audit, so the gate
// also blocks moderate here (landmark-unique, heading-order, page-has-heading-
// one, ...). Mer's subfolders are not in this gate yet (known 8H B1-B3).
// Plats is scanned without consent; its consent state belongs to 8H A8.
test.describe('axe main sections with visible navigation (blocks moderate)', () => {
  const block = ['critical', 'serious', 'moderate']
  const sections = [
    ['Hem', null],
    ['Redo!', 'redo'],
    ['Plats', 'place'],
    ['Min resa', 'journey'],
    ['Stället', 'social'],
    ['Mer', 'more'],
  ]

  for (const [label, sectionId] of sections) {
    test(label, async ({ page }, testInfo) => {
      await openApp(page)
      if (sectionId) await goToSection(page, label, sectionId)
      await expect(page.locator('.bottom-nav')).toBeVisible()
      await expectNoBlockingAxeViolations(page, testInfo, `section-${sectionId || 'home'}`, { block })
    })
  }

  test('Tillgänglighet', async ({ page }, testInfo) => {
    await openApp(page)
    await openAccessibilityFolder(page)
    await expectNoBlockingAxeViolations(page, testInfo, 'section-accessibility', { block })
  })

  test('Notis', async ({ page }, testInfo) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Alla notiser' }).click()
    await expect(page.locator('#app-section-notices')).toHaveClass(/is-active/)
    await expectNoBlockingAxeViolations(page, testInfo, 'section-notices', { block })
  })
})
