import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const cloudBackupSource = readFileSync(resolve(process.cwd(), 'src/components/CloudBackupPanel.jsx'), 'utf8')
const moreSectionSource = readFileSync(resolve(process.cwd(), 'src/components/sections/MoreSection.jsx'), 'utf8')
const mainSections = ['home', 'nutrition', 'coach', 'progress', 'more']

function getCssBlock(selectorStart) {
  const start = appCss.indexOf(selectorStart)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = appCss.indexOf('{', start)
  const bodyEnd = appCss.indexOf('}', bodyStart)
  return appCss.slice(bodyStart + 1, bodyEnd)
}

function getCombinedCssBlocks(selectorStart) {
  const blocks = []
  let searchStart = 0

  while (searchStart < appCss.length) {
    const start = appCss.indexOf(selectorStart, searchStart)
    if (start < 0) {
      break
    }

    const bodyStart = appCss.indexOf('{', start)
    const bodyEnd = appCss.indexOf('}', bodyStart)
    blocks.push(appCss.slice(bodyStart + 1, bodyEnd))
    searchStart = bodyEnd + 1
  }

  expect(blocks.length).toBeGreaterThan(0)
  return blocks.join('\n')
}

describe('app scroll architecture', () => {
  it('uses document scrolling as the defined owner for every main section', () => {
    const shellBlock = getCssBlock('.app-shell:has(#app-section-nutrition.is-active)')
    const bodyBlock = getCssBlock('body:has(#app-section-nutrition.is-active)')

    mainSections.forEach((section) => {
      expect(appCss).toContain(`.app-shell:has(#app-section-${section}.is-active)`)
      expect(appCss).toContain(`body:has(#app-section-${section}.is-active)`)
    })

    mainSections.forEach((section) => {
      const sectionShellBlock = getCssBlock(`.app-shell:has(#app-section-${section}.is-active)`)
      const sectionBodyBlock = getCssBlock(`body:has(#app-section-${section}.is-active)`)

      expect(sectionShellBlock).toContain('min-height: 100dvh')
      expect(sectionShellBlock).toContain('overflow: visible')
      expect(sectionShellBlock).not.toMatch(/(^|\s)height:\s*100dvh\b/)
      expect(sectionShellBlock).not.toContain('overflow: hidden')
      expect(sectionBodyBlock).toContain('overflow-y: auto')
      expect(sectionBodyBlock).not.toContain('overflow-y: hidden')
    })

    expect(appSource).not.toContain('appScrollRef')
    expect(shellBlock).toContain('min-height: 100dvh')
    expect(shellBlock).toContain('overflow: visible')
    expect(shellBlock).not.toMatch(/(^|\s)height:\s*100dvh\b/)
    expect(shellBlock).not.toContain('overflow: hidden')
    expect(bodyBlock).toContain('overflow-y: auto')
    expect(bodyBlock).not.toContain('overflow-y: hidden')
  })

  it('does not lock both document and shell without a scroll container', () => {
    const bodyLock = /body:has\(#app-section-(home|nutrition|coach|progress|more)\.is-active\)[\s\S]*?overflow-y:\s*hidden/.test(appCss)
    const shellLock = /\.app-shell:has\(#app-section-(home|nutrition|coach|progress|more)\.is-active\)[\s\S]*?overflow:\s*hidden/.test(appCss)

    expect(bodyLock && shellLock).toBe(false)
    expect(appSource).not.toContain('TouchBlockDiagnostics')
    expect(appSource).not.toContain('__VIKTKOLLEN_TOUCH_DIAGNOSTICS__')
  })

  it('keeps bottom navigation reachable without owning page scroll', () => {
    const bottomNavBlock = getCssBlock('.bottom-nav {')
    const nonHomeShellBlock = getCssBlock('.app-shell:has(#app-section-nutrition.is-active)')
    const activeHomeShellBlock = getCssBlock('.app-shell:has(#app-section-home.is-active)')
    const homeSectionBlock = getCssBlock('#app-section-home.is-active {')
    const homeShellBlock = getCssBlock('#app-section-home.is-active .home-overview-shell')

    expect(bottomNavBlock).toContain('position: fixed')
    expect(nonHomeShellBlock).toContain('padding: 0 14px calc(104px + env(safe-area-inset-bottom))')
    expect(nonHomeShellBlock).toContain('overflow: visible')
    expect(activeHomeShellBlock).toContain('height: auto')
    expect(activeHomeShellBlock).toContain('max-height: none')
    expect(homeSectionBlock).toContain('calc(var(--vk-nav-height) + 112px + env(safe-area-inset-bottom))')
    expect(homeSectionBlock).toContain('display: grid')
    expect(homeSectionBlock).toContain('height: auto')
    expect(homeSectionBlock).toContain('max-height: none')
    expect(homeSectionBlock).toContain('min-height: 100dvh')
    expect(homeShellBlock).not.toContain('position: absolute')
    expect(homeShellBlock).not.toContain('position: fixed')
    expect(homeShellBlock).toContain('height: auto')
    expect(homeShellBlock).toContain('max-height: none')
    expect(homeShellBlock).toContain('overflow: visible')
    expect(homeShellBlock).toContain('contain: none')
    expect(homeShellBlock).not.toContain('overflow: hidden')
  })

  it('keeps More in normal document flow for mobile PWA scrolling', () => {
    const moreHtmlBlock = getCombinedCssBlocks('html:has(#app-section-more.is-active)')
    const moreRootBlock = getCombinedCssBlocks('#root:has(#app-section-more.is-active)')
    const moreShellBlock = getCombinedCssBlocks('.app-shell:has(#app-section-more.is-active)')
    const moreGridBlock = getCombinedCssBlocks('.app-shell:has(#app-section-more.is-active) .content-grid')
    const moreSectionBlock = getCombinedCssBlocks('#app-section-more.is-active')
    const flowBlocks = [moreHtmlBlock, moreRootBlock, moreShellBlock, moreGridBlock, moreSectionBlock]

    flowBlocks.forEach((block) => {
      expect(block).toContain('height: auto')
      expect(block).toContain('max-height: none')
      expect(block).toContain('overflow: visible')
      expect(block).toContain('contain: none')
      expect(block).not.toMatch(/(^|\n)\s*height:\s*100(?:dvh|vh|%)\b/)
      expect(block).not.toContain('overflow: hidden')
    })

    expect(moreShellBlock).toContain('min-height: 100dvh')
    expect(moreGridBlock).toContain('align-content: start')
    expect(moreSectionBlock).toContain('min-height: 100dvh')
    expect(moreSectionSource).toContain('<CloudBackupPanel')
    expect(moreSectionSource).toContain('account-settings-panel')
    expect(moreSectionSource).toContain('<MoreHub')
    expect(moreSectionSource).toContain('onBack={handleBackToHub}')
    expect(cloudBackupSource).not.toMatch(/maxHeight|overflowY|style=\{\{/)
  })
})
