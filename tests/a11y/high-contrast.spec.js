import { expect, test } from '@playwright/test'
import { openApp } from './support/app.js'

// A11Y-8F: browser check of the 8B high-contrast tokens as the browser
// actually resolves them (the numeric unit tests check the declared values;
// the axe scans in axe-views.spec.js check contrast on whole views).

function contrastRatio(foreground, background) {
  const luminance = ([r, g, b]) => {
    const channel = (value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

function parseRgb(value) {
  return value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
}

test('high contrast: resolved text tokens reach 7:1 and 4.5:1 on the page background', async ({ page }) => {
  await openApp(page, { preferences: { highContrast: true } })
  const tokens = await page.evaluate(() => {
    const probe = document.createElement('span')
    document.body.appendChild(probe)
    const resolve = (name) => {
      probe.style.color = `var(${name})`
      return getComputedStyle(probe).color
    }
    const result = { background: getComputedStyle(document.body).backgroundColor, muted: resolve('--muted'), text: resolve('--text'), textHeading: resolve('--text-h') }
    probe.remove()
    return result
  })
  const background = parseRgb(tokens.background)
  expect(contrastRatio(parseRgb(tokens.textHeading), background)).toBeGreaterThanOrEqual(7)
  expect(contrastRatio(parseRgb(tokens.text), background)).toBeGreaterThanOrEqual(7)
  expect(contrastRatio(parseRgb(tokens.muted), background)).toBeGreaterThanOrEqual(4.5)
})

for (const [modeName, preferences] of Object.entries({ default: null, 'high-contrast': { highContrast: true } })) {
  test(`${modeName}: keyboard focus is clearly visible (outline ≥ 2px, ≥ 3:1)`, async ({ page }) => {
    await openApp(page, { preferences })
    await page.evaluate(() => document.activeElement?.blur())
    const samples = []
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Tab')
      samples.push(await page.evaluate(() => {
        const element = document.activeElement
        const style = getComputedStyle(element)
        let node = element
        let background = 'rgba(0, 0, 0, 0)'
        while (node && /rgba\(0, 0, 0, 0\)|transparent/.test(background)) {
          background = getComputedStyle(node).backgroundColor
          node = node.parentElement
        }
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(background)) background = getComputedStyle(document.body).backgroundColor
        return { background, name: (element.getAttribute('aria-label') || element.textContent).trim().slice(0, 30), outlineColor: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), shadow: style.boxShadow }
      }))
    }
    for (const sample of samples) {
      expect(sample.outlineStyle, `${sample.name}: focus outline`).not.toBe('none')
      expect(sample.outlineWidth, `${sample.name}: outline width`).toBeGreaterThanOrEqual(2)
      expect(contrastRatio(parseRgb(sample.outlineColor), parseRgb(sample.background)), `${sample.name}: outline contrast`).toBeGreaterThanOrEqual(3)
    }
  })
}
