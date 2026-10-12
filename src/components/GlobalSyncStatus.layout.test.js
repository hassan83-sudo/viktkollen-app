import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8').replace(/\r\n/g, '\n')

function cssBlock(selector) {
  const start = appCss.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = appCss.indexOf('{', start)
  return appCss.slice(bodyStart + 1, appCss.indexOf('}', bodyStart))
}

describe('Global sync status on Home', () => {
  it('floats over the top of Home instead of pushing Home down when "Synkar..." appears', () => {
    const pill = cssBlock('.app-shell:has(#app-section-home.is-active) > .global-sync-status')
    expect(pill).toMatch(/position:\s*absolute/)
    expect(pill).toMatch(/top:\s*0/)
    expect(pill).toMatch(/margin:\s*0/)
  })

  it('anchors the floating status to the app shell on Home', () => {
    const shellRules = appCss.split('.app-shell:has(#app-section-home.is-active) {').slice(1)
      .map((rest) => rest.slice(0, rest.indexOf('}')))
    expect(shellRules.some((rule) => /position:\s*relative/.test(rule))).toBe(true)
  })
})
