import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')

describe('GlobalSearch layout', () => {
  it('keeps a compact Home trigger that can wrap at 390px and 430px', () => {
    expect(css).toContain('.overview-search-row')
    expect(css).toContain('overflow-x: hidden')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('.global-search-trigger kbd')
    expect(css).toContain('display: none')
    expect(css).toContain('width: min(640px, 100%)')
    expect(css).toContain('max-height: calc(100dvh - 18px)')
  })
})
