import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

// A11Y-8K: source guards for the Plats card semantics. Behaviour (click(),
// mouse, Enter/Space, checkbox, target size, headings, axe) is proven in
// Chromium: tests/a11y/place-cards.spec.js.

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const place = source('src/components/sections/PlaceSection.jsx')
const schoolEnhancer = source('src/components/place/SchoolCardEnhancer.js')
const css = source('src/styles/accessibility.css')

describe('Plats cards (A11Y-8K)', () => {
  it('opens cards with a native button and one onClick, not an emulated role="button"', () => {
    expect(place).toContain('className="place-feature-open" type="button" onClick={openFeature}')
    expect(place).not.toMatch(/onPointerUp/)
    expect(place).not.toContain("role: 'button'")
    expect(place).not.toMatch(/<article[^>]*\{\.\.\.openableProps\}/)
  })

  it('keeps the checkbox outside the open button (no nested interactive control)', () => {
    const card = place.slice(place.indexOf('<article className={`place-feature-card'), place.indexOf('</article>'))
    const button = card.slice(card.indexOf('<button'), card.indexOf('</button>'))
    expect(button).not.toContain('<input')
    expect(card.indexOf('className="place-toggle"')).toBeGreaterThan(card.indexOf('</h3>'))
  })

  it('keeps the School rename from replacing the card button', () => {
    expect(schoolEnhancer).toContain("heading.querySelector('.place-feature-open') || heading")
  })

  it('stretches the button over the card and gives the checkbox a 24x24 box above it', () => {
    expect(css).toMatch(/\.place-feature-open::after \{\s*content: '';\s*position: absolute;\s*inset: 0;/)
    expect(css).toMatch(/\.place-feature-card \.place-toggle \{\s*position: relative;\s*z-index: 1;/)
    expect(css).toMatch(/\.place-feature-card \.place-toggle input \{[^}]*width: 24px;\s*height: 24px;/)
  })
})
