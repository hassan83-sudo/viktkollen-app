import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8F: landmarks, headings, skip-link target and dialog naming on the
// central views. Rules are deliberately about what is exposed (visible,
// not hidden/inert), so legitimate hidden or nested markup is allowed.

function structure(page) {
  return page.evaluate(() => {
    const exposed = (element) => element.getClientRects().length > 0 && !element.closest('[hidden], [aria-hidden="true"]')
    const mains = [...document.querySelectorAll('main, [role="main"]')].filter(exposed)
    const activeSection = document.querySelector('.app-section.is-active')
    const h1s = activeSection ? [...activeSection.querySelectorAll('h1')].filter(exposed).map((heading) => heading.textContent.trim()) : []
    const skip = document.querySelector('a.skip-link')
    const skipTarget = skip ? document.querySelector(skip.getAttribute('href')) : null
    return {
      activeSectionId: activeSection?.id || null,
      h1s,
      mainCount: mains.length,
      navigationNames: [...document.querySelectorAll('nav, [role="navigation"]')].filter(exposed).map((nav) => nav.getAttribute('aria-label') || ''),
      skipTargetIsActiveSection: Boolean(skipTarget && skipTarget === activeSection),
      skipTargetInMain: Boolean(skipTarget && mains[0]?.contains(skipTarget)),
    }
  })
}

async function expectSoundStructure(page, expectedHeading) {
  const result = await structure(page)
  expect(result.mainCount, 'exactly one exposed main landmark').toBe(1)
  expect(result.h1s, 'one primary heading in the active view').toEqual([expectedHeading])
  expect(result.skipTargetIsActiveSection, 'skip link points to the active view').toBe(true)
  expect(result.skipTargetInMain, 'skip link target is inside main').toBe(true)
  expect(result.navigationNames.every(Boolean), 'navigation landmarks are named').toBe(true)
}

test('Hem, Mer and Tillgänglighet have one main, one h1 and a valid skip-link target', async ({ page }) => {
  await openApp(page)
  await expectSoundStructure(page, 'Hem')
  await goToSection(page, 'Mer', 'more')
  await expectSoundStructure(page, 'Mer')
  await openAccessibilityFolder(page)
  await expectSoundStructure(page, 'Tillgänglighet & hjälpmedel')
})

test('open dialogs are named, modal and the only exposed layer', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Öppna Coach' }).first().click()
  const dialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')]
    .filter((dialog) => dialog.getClientRects().length)
    .map((dialog) => {
      const labelledBy = dialog.getAttribute('aria-labelledby')
      const name = dialog.getAttribute('aria-label') || (labelledBy ? labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent.trim() || '').join(' ') : '')
      return { inert: Boolean(dialog.closest('[inert]')), modal: dialog.getAttribute('aria-modal'), name: name.trim() }
    }))
  expect(dialogs).toEqual([{ inert: false, modal: 'true', name: 'AI Coach' }])
  expect(await page.evaluate(() => Boolean(document.querySelector('main.app-shell').closest('[inert]')))).toBe(true)
})
