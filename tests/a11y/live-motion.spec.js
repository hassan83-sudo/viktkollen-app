import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8J (8H A4/A5/B9, C7): Viktkollen Live rotation, reduced motion and
// live-region semantics in Chromium, with Playwright's fake clock so the
// 10-second rotation is deterministic and fast.

const start = new Date('2026-09-24T10:00:00+02:00')

// Index of the visible Live item (the footer dots mirror activeIndex).
function activeIndex(page) {
  return page.locator('#viktkollen-live .smart-feed-dots span').evaluateAll((dots) => dots.findIndex((dot) => dot.classList.contains('is-active')))
}

async function advance(page, seconds) {
  await page.clock.runFor(seconds * 1000)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}

// Uses the app's own preference store (the same save path as the toggle in
// Tillgänglighet), while Hem stays mounted.
async function setReduceMotionSetting(page, value) {
  await page.evaluate(async (reduceMotion) => {
    const store = await import('/src/services/accessibilityPreferences.js')
    store.saveAccessibilityPreferences({ ...store.readAccessibilityPreferences().preferences, reduceMotion })
  }, value)
  if (value) await expect(page.locator('html')).toHaveAttribute('data-a11y-reduced-motion', 'true')
  else await expect(page.locator('html')).not.toHaveAttribute('data-a11y-reduced-motion', 'true')
}

// Counts text changes inside any live region (aria-live, status, alert, log).
async function watchLiveRegions(page) {
  await page.evaluate(() => {
    window.__liveChanges = []
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const node = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement
        const region = node?.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')
        if (region) window.__liveChanges.push(region.textContent.trim().slice(0, 80))
      })
    })
    observer.observe(document.body, { characterData: true, childList: true, subtree: true })
  })
}

test.describe('Viktkollen Live and reduced motion', () => {
  test('A: normal settings rotate once every 10 s (one timer)', async ({ page }) => {
    await openApp(page, { clockAt: start, reducedMotion: 'no-preference' })
    const first = await activeIndex(page)
    await advance(page, 10.5)
    expect(await activeIndex(page)).toBe(first + 1)
    await advance(page, 10)
    expect(await activeIndex(page)).toBe(first + 2)
    await expect(page.getByRole('button', { name: 'Pausa Viktkollen Live' })).toBeVisible()
  })

  test('B: OS prefers-reduced-motion stops the automatic rotation', async ({ page }) => {
    await openApp(page, { clockAt: start, reducedMotion: 'reduce' })
    const first = await activeIndex(page)
    await advance(page, 35)
    expect(await activeIndex(page)).toBe(first)
  })

  test('C: the app setting "Minska rörelse" stops the automatic rotation', async ({ page }) => {
    await openApp(page, { clockAt: start, preferences: { reduceMotion: true }, reducedMotion: 'no-preference' })
    const first = await activeIndex(page)
    await advance(page, 35)
    expect(await activeIndex(page)).toBe(first)
    await expect(page.getByRole('button', { name: 'Spela Viktkollen Live' })).toBeVisible()
  })

  test('D/E: turning the setting on during the session stops rotation; off again resumes it with a single timer', async ({ page }) => {
    await openApp(page, { clockAt: start, reducedMotion: 'no-preference' })
    const first = await activeIndex(page)
    await advance(page, 10.5)
    expect(await activeIndex(page)).toBe(first + 1)

    await setReduceMotionSetting(page, true)
    await advance(page, 35)
    expect(await activeIndex(page)).toBe(first + 1)

    await setReduceMotionSetting(page, false)
    await advance(page, 10.5)
    expect(await activeIndex(page)).toBe(first + 2)
    // Exactly one step per interval: a duplicated timer would jump two.
    await advance(page, 10)
    expect(await activeIndex(page)).toBe(first + 3)
  })

  test('D (via the real toggle in Tillgänglighet): the setting reaches Live', async ({ page }) => {
    await openApp(page, { clockAt: start, reducedMotion: 'no-preference' })
    await openAccessibilityFolder(page)
    await page.locator('#app-section-more').getByRole('button', { name: /^Syn/ }).first().click()
    const toggle = page.getByRole('button', { name: 'Minska animationer' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await goToSection(page, 'Hem', 'home')
    const first = await activeIndex(page)
    await advance(page, 35)
    expect(await activeIndex(page)).toBe(first)
  })

  test('F: Pausa stops the rotation and Spela resumes it', async ({ page }) => {
    await openApp(page, { clockAt: start, reducedMotion: 'no-preference' })
    const first = await activeIndex(page)
    const pause = page.getByRole('button', { name: 'Pausa Viktkollen Live' })
    await pause.focus()
    await page.keyboard.press('Enter')
    const play = page.getByRole('button', { name: 'Spela Viktkollen Live' })
    await expect(play).toHaveAttribute('aria-pressed', 'true')
    await advance(page, 35)
    expect(await activeIndex(page)).toBe(first)
    await page.keyboard.press('Enter')
    await advance(page, 10.5)
    expect(await activeIndex(page)).toBe(first + 1)
  })

  test('G: automatic changes are silent; a manual change is announced once', async ({ page }) => {
    await openApp(page, { clockAt: start, reducedMotion: 'no-preference' })
    const live = page.locator('#viktkollen-live')
    // The rotating card is no longer a live region; one status exists.
    expect(await live.locator('[aria-live]:not([aria-live="off"])').count()).toBe(0)
    await expect(live.getByRole('status')).toHaveCount(1)
    await expect(live.getByRole('status')).toHaveText('')

    await watchLiveRegions(page)
    await advance(page, 35) // 3 rotations and the 30 s local-time refresh
    expect(await page.evaluate(() => window.__liveChanges)).toEqual([])

    const next = live.getByRole('button', { name: 'Visa nästa feed-kort' }).first()
    await next.focus()
    await page.keyboard.press('Enter')
    const title = await live.locator('.smart-feed-active-card strong').textContent()
    await expect(live.getByRole('status')).toContainText(title)
    const changes = await page.evaluate(() => window.__liveChanges)
    expect(changes.length).toBeGreaterThan(0)
    expect(new Set(changes).size).toBe(1)
  })

  for (const [name, options, expected] of [
    ['normal', { reducedMotion: 'no-preference' }, 'smooth'],
    ['OS reduced motion', { reducedMotion: 'reduce' }, 'auto'],
    ['app "Minska rörelse"', { preferences: { reduceMotion: true }, reducedMotion: 'no-preference' }, 'auto'],
  ]) {
    test(`H: AI Coach chat scrolling (${name}) uses behavior "${expected}"`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__chatScrolls = []
        const original = Element.prototype.scrollTo
        Element.prototype.scrollTo = function scrollTo(...args) {
          if (this.classList?.contains('chat-thread') && typeof args[0] === 'object') window.__chatScrolls.push(args[0].behavior)
          return original.apply(this, args)
        }
      })
      await openApp(page, options)
      await page.getByRole('button', { name: /Öppna Coach/ }).first().click()
      const field = page.getByRole('textbox', { name: 'Fråga till AI Coach' })
      await field.fill('Hur mycket protein behöver jag?')
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate(() => window.__chatScrolls.length)).toBeGreaterThan(0)
      const behaviors = await page.evaluate(() => [...new Set(window.__chatScrolls)])
      expect(behaviors).toEqual([expected])
    })
  }
})
