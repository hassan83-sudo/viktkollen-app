import { expect } from 'vitest'

// A11Y-8F: small focus assertions for component tests.

export function expectFocusOn(element) {
  expect(document.activeElement, 'expected element to have focus').toBe(element)
}

export function expectFocusInside(container) {
  expect(container.contains(document.activeElement), 'focus is outside the expected container').toBe(true)
}

// Important actions must leave focus on a meaningful element, never <body>.
export function expectFocusNotOnBody() {
  expect(document.activeElement, 'focus fell back to <body>').not.toBe(document.body)
  expect(document.activeElement).not.toBeNull()
}
