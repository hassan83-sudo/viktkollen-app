import { expect, test } from '@playwright/test'
import { goToSection, openAccessibilityFolder, openApp } from './support/app.js'

// A11Y-8I (8H A1): the bottom-navigation labels must reach 4.5:1 (WCAG
// 1.4.3, the labels are 9px bold) in every section, active and inactive, in
// each section's own theme.
//
// The colour the user sees is computed by compositing the layers: page
// background -> navigation background -> link background colour -> each
// linear-gradient colour stop of the link (worst stop wins) -> label colour
// (alpha). Radial highlights are left out: on Hem the only one is centred on
// the icon, above the label.

// Measures the settled state: waits for running transitions (e.g. the active
// label's colour) to finish and for a frame to be drawn.
async function labelContrasts(page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  return page.evaluate(() => {
    const parse = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const [r, g, b, a = 1] = match[1].split(',').map((part) => Number.parseFloat(part))
      return { a, b, g, r }
    }
    const over = (top, bottom) => ({ a: 1, b: top.b * top.a + bottom.b * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), r: top.r * top.a + bottom.r * (1 - top.a) })
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const ratio = (one, two) => {
      const [light, dark] = [luminance(one), luminance(two)].sort((x, y) => y - x)
      return (light + 0.05) / (dark + 0.05)
    }
    const page = parse(getComputedStyle(document.body).backgroundColor) || { a: 1, b: 31, g: 17, r: 7 }
    const nav = document.querySelector('.bottom-nav')
    const navBackground = over(parse(getComputedStyle(nav).backgroundColor) || { a: 0, b: 0, g: 0, r: 0 }, { ...page, a: 1 })
    return [...nav.querySelectorAll('a')].map((link) => {
      const style = getComputedStyle(link)
      const base = over(parse(style.backgroundColor) || { a: 0, b: 0, g: 0, r: 0 }, navBackground)
      const linear = style.backgroundImage.match(/linear-gradient\((.*)\)/)?.[1] || ''
      const stops = [...linear.matchAll(/rgba?\([^)]+\)/g)].map((match) => over(parse(match[0]), base))
      const backgrounds = stops.length ? stops : [base]
      const label = link.querySelector('strong')
      const foreground = parse(getComputedStyle(label).color)
      const worst = Math.min(...backgrounds.map((background) => ratio(over(foreground, background), background)))
      return { active: link.classList.contains('is-active'), label: label.textContent.trim(), ratio: Math.round(worst * 100) / 100 }
    })
  })
}

const sections = [['Hem', null], ['Redo!', 'redo'], ['Plats', 'place'], ['Min resa', 'journey'], ['Stället', 'social'], ['Mer', 'more']]

for (const [modeName, preferences] of Object.entries({ default: null, 'high-contrast': { highContrast: true } })) {
  test(`bottom navigation labels reach 4.5:1 in every section (${modeName})`, async ({ page }, testInfo) => {
    await openApp(page, { preferences, reducedMotion: 'reduce' })
    const results = {}
    for (const [label, sectionId] of sections) {
      if (sectionId) await goToSection(page, label, sectionId)
      results[label] = await labelContrasts(page)
    }
    await openAccessibilityFolder(page)
    results.Tillgänglighet = await labelContrasts(page)
    await testInfo.attach(`nav-contrast-${modeName}.json`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' })

    const failures = Object.entries(results).flatMap(([section, links]) => links
      .filter((link) => link.ratio < 4.5)
      .map((link) => `${section}: ${link.active ? 'active' : 'inactive'} "${link.label}" ${link.ratio}:1`))
    expect(failures).toEqual([])
    // Every section has exactly one active link.
    Object.entries(results).forEach(([section, links]) => expect(links.filter((link) => link.active).length, section).toBe(1))
  })
}
