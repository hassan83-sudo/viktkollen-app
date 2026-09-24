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

  // A11Y-8A: the region must exist before the first message, otherwise many
  // screen readers never announce that first message.
  it('keeps an empty, visually hidden live region mounted before the first message', () => {
    const { rerender } = render(<AccessibilityFeedback />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.className).toBe('sr-only')
    expect(region.className).not.toContain('accessibility-feedback')

    rerender(<AccessibilityFeedback message="Klar" tone="success" />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe('Klar')
    expect(region.className).toContain('accessibility-feedback')

    rerender(<AccessibilityFeedback />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe('')
  })

  it('replaces an old message in the same region', () => {
    const { rerender } = render(<AccessibilityFeedback message="Läser upp" />)
    const region = screen.getByRole('status')

    rerender(<AccessibilityFeedback message="Uppläsningen stoppades." tone="warning" />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(region.textContent).toBe('Uppläsningen stoppades.')
  })

  it('re-announces an identical message only when the announcement id changes', () => {
    const { rerender } = render(<AccessibilityFeedback announcementId={1} message="Sparad" tone="success" />)
    const region = screen.getByRole('status')
    const firstNode = region.firstChild

    rerender(<AccessibilityFeedback announcementId={1} message="Sparad" tone="success" />)
    expect(region.firstChild).toBe(firstNode)

    rerender(<AccessibilityFeedback announcementId={2} message="Sparad" tone="success" />)
    expect(region.textContent).toBe('Sparad')
    expect(region.firstChild).not.toBe(firstNode)
  })

  it('can be referenced from a field with aria-describedby', () => {
    render(<AccessibilityFeedback id="field-status" message="Fel" tone="error" />)
    expect(screen.getByRole('status').id).toBe('field-status')
  })
})
