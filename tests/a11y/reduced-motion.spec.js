import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8F: reduced motion, from the OS setting (prefers-reduced-motion) and
// from Viktkollen's own "Minska rörelse" preference.

const sources = {
  'OS prefers-reduced-motion': { preferences: null, reducedMotion: 'reduce' },
  'Viktkollen setting': { preferences: { reduceMotion: true }, reducedMotion: 'no-preference' },
}

// Infinite (decorative, looping) animations that are still running.
function runningInfiniteAnimations(page) {
  return page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity)
    .filter((animation) => animation.effect.target?.getClientRects().length)
    .map((animation) => `${animation.animationName || 'effect'} on .${String(animation.effect.target.className).split(' ')[0]}`))
}

// Content must not stay invisible when entrance animations are removed.
function invisibleContent(page, sectionSelector) {
  return page.evaluate((selector) => {
    const section = document.querySelector(selector)
    const candidates = [...section.querySelectorAll('h1, h2, button, a[href]')].filter((element) => element.getClientRects().length).slice(0, 40)
    const effectiveOpacity = (element) => {
      let opacity = 1
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
      return opacity
    }
    return candidates.filter((element) => effectiveOpacity(element) < 0.1 || getComputedStyle(element).visibility === 'hidden')
      .map((element) => (element.getAttribute('aria-label') || element.textContent).trim().slice(0, 40))
  }, sectionSelector)
}

for (const [sourceName, { preferences, reducedMotion }] of Object.entries(sources)) {
  test.describe(`reduced motion via ${sourceName}`, () => {
    test('no infinite decorative animation, no smooth scrolling, content visible (Hem, Mer, Tillgänglighet)', async ({ page }) => {
      await openApp(page, { preferences, reducedMotion })
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce')
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
      await page.waitForTimeout(600)
      expect(await runningInfiniteAnimations(page), 'Hem').toEqual([])
      expect(await invisibleContent(page, '#app-section-home'), 'Hem').toEqual([])

      await goToSection(page, 'Mer', 'more')
      await page.waitForTimeout(600)
      expect(await runningInfiniteAnimations(page), 'Mer').toEqual([])
      expect(await invisibleContent(page, '#app-section-more'), 'Mer').toEqual([])

      await openAccessibilityFolder(page)
      await page.waitForTimeout(600)
      expect(await runningInfiniteAnimations(page), 'Tillgänglighet').toEqual([])
      expect(await invisibleContent(page, '#app-section-more'), 'Tillgänglighet').toEqual([])
    })
  })
}

test('control case: without reduced motion the detector does see looping animations', async ({ page }) => {
  await openApp(page, { reducedMotion: 'no-preference' })
  await page.waitForTimeout(600)
  // Proves the assertions above are not vacuous: the same detector finds
  // running infinite animations on Hem when reduced motion is off.
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-a11y-reduced-motion'))).not.toBe('true')
  expect((await runningInfiniteAnimations(page)).length).toBeGreaterThan(0)
})
