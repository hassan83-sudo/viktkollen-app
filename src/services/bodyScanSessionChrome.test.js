import { describe, expect, it } from 'vitest'

import {
  BODY_SCAN_SESSION_CLASS,
  setBodyScanSessionActive,
} from './bodyScanSessionChrome.js'

function createDom() {
  const html = { classList: { tokens: new Set(), toggle(name, on) { if (on) this.tokens.add(name); else this.tokens.delete(name) }, contains(name) { return this.tokens.has(name) } } }
  const body = {
    dataset: {},
    style: { overflow: '', position: 'relative' },
    classList: { tokens: new Set(), toggle(name, on) { if (on) this.tokens.add(name); else this.tokens.delete(name) }, contains(name) { return this.tokens.has(name) } },
  }
  const root = {
    documentElement: html,
    body,
    defaultView: { scrollY: 40, scrollTo(x, y) { this.scrolledTo = y } },
  }
  return { root, html, body }
}

describe('bodyScanSessionChrome', () => {
  it('toggles a single session class and does not lock body position or overflow', () => {
    const { root, html, body } = createDom()
    const result = setBodyScanSessionActive(true, root)
    expect(result.active).toBe(true)
    expect(result.navHidden).toBe(true)
    expect(html.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(true)
    expect(body.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(true)
    expect(body.style.overflow).toBe('')
    expect(body.style.position).toBe('relative')
    expect(body.dataset.vkBodyScanLock).toBeUndefined()
  })

  it('restores the session class when the scan session ends without scrolling', () => {
    const { root, html, body } = createDom()
    setBodyScanSessionActive(true, root)
    setBodyScanSessionActive(false, root)
    expect(html.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(false)
    expect(body.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(false)
    expect(root.defaultView.scrolledTo).toBeUndefined()
  })

  it('can start, cancel, and start again with a clean session class', () => {
    const { root, html } = createDom()
    setBodyScanSessionActive(true, root)
    setBodyScanSessionActive(false, root)
    setBodyScanSessionActive(true, root)
    expect(html.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(true)
    setBodyScanSessionActive(false, root)
    expect(html.classList.contains(BODY_SCAN_SESSION_CLASS)).toBe(false)
  })
})
