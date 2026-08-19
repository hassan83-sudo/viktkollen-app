import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const nonHomeSections = ['nutrition', 'coach', 'progress', 'more']

function getCssBlock(selectorStart) {
  const start = appCss.indexOf(selectorStart)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = appCss.indexOf('{', start)
  const bodyEnd = appCss.indexOf('}', bodyStart)
  return appCss.slice(bodyStart + 1, bodyEnd)
}

describe('app scroll architecture', () => {
  it('uses document scrolling as the defined owner for every main section', () => {
    const shellBlock = getCssBlock('.app-shell:has(#app-section-nutrition.is-active)')
    const bodyBlock = getCssBlock('body:has(#app-section-nutrition.is-active)')

    nonHomeSections.forEach((section) => {
      expect(appCss).toContain(`.app-shell:has(#app-section-${section}.is-active)`)
      expect(appCss).toContain(`body:has(#app-section-${section}.is-active)`)
    })

    expect(shellBlock).toContain('min-height: 100dvh')
    expect(shellBlock).toContain('overflow: visible')
    expect(shellBlock).not.toMatch(/(^|\s)height:\s*100dvh\b/)
    expect(shellBlock).not.toContain('overflow: hidden')
    expect(bodyBlock).toContain('overflow-y: auto')
    expect(bodyBlock).not.toContain('overflow-y: hidden')
  })

  it('does not lock both document and shell without a scroll container', () => {
    const bodyLock = /body:has\(#app-section-(nutrition|coach|progress|more)\.is-active\)[\s\S]*?overflow-y:\s*hidden/.test(appCss)
    const shellLock = /\.app-shell:has\(#app-section-(nutrition|coach|progress|more)\.is-active\)[\s\S]*?overflow:\s*hidden/.test(appCss)

    expect(bodyLock && shellLock).toBe(false)
    expect(appSource).not.toContain('TouchBlockDiagnostics')
    expect(appSource).not.toContain('__VIKTKOLLEN_TOUCH_DIAGNOSTICS__')
  })

  it('keeps bottom navigation reachable without owning page scroll', () => {
    const bottomNavBlock = getCssBlock('.bottom-nav {')
    const nonHomeShellBlock = getCssBlock('.app-shell:has(#app-section-nutrition.is-active)')

    expect(bottomNavBlock).toContain('position: fixed')
    expect(nonHomeShellBlock).toContain('padding: 0 14px calc(104px + env(safe-area-inset-bottom))')
    expect(nonHomeShellBlock).toContain('overflow: visible')
  })
})
