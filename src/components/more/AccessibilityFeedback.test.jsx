/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AccessibilityFeedback from './AccessibilityFeedback.jsx'

describe('AccessibilityFeedback', () => {
  afterEach(() => cleanup())

  it('renders text-bearing polite status for success, warning, and errors', () => {
    const { rerender } = render(<AccessibilityFeedback message="Klar" tone="success" />)
    expect(screen.getByRole('status').textContent).toBe('Klar')
    expect(screen.getByRole('status').className).toContain('is-success')
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')

    rerender(<AccessibilityFeedback message="Stoppad" tone="warning" />)
    expect(screen.getByRole('status').className).toContain('is-warning')

    rerender(<AccessibilityFeedback message="Fel vid uppläsning." tone="error" />)
    expect(screen.getByRole('status').textContent).toBe('Fel vid uppläsning.')
    expect(screen.getByRole('status').className).toContain('is-error')
  })

  it('does not create a live region without visible status text', () => {
    render(<AccessibilityFeedback />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
