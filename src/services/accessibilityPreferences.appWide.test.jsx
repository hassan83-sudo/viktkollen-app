/* @vitest-environment jsdom */
import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.js'
import AccessibilityHub from '../components/more/AccessibilityHub.jsx'
import MoreHub from '../components/more/MoreHub.jsx'
import {
  defaultAccessibilityPreferences,
  getEffectiveAccessibilityPreferences,
  resetAccessibilityPreferences,
  saveAccessibilityPreferences,
  useAccessibilityPreferences,
} from './accessibilityPreferences.js'

// A11Y-7B: this harness mirrors exactly what App.jsx now does on the real
// <main className="app-shell">, so these tests exercise the real live-update
// mechanism (hook + shared store) without mounting the full, heavyweight App
// component - consistent with how App.jsx itself is tested elsewhere
// (source-text checks in App.sectionRouting.test.js).
function AppRootHarness({ mountCountRef }) {
  const preferences = useAccessibilityPreferences()
  const effective = getEffectiveAccessibilityPreferences(preferences)

  useEffect(() => {
    if (mountCountRef) mountCountRef.current += 1
  }, [mountCountRef])

  return (
    <main
      className="app-shell"
      data-a11y-high-contrast={effective.highContrast || undefined}
      data-a11y-large-controls={effective.largeControls || undefined}
      data-a11y-line-spacing={effective.lineSpacing || undefined}
      data-a11y-reduced-motion={effective.reduceMotion || undefined}
      data-a11y-text-size={effective.textSize}
      data-testid="app-root"
    />
  )
}

describe('getEffectiveAccessibilityPreferences (A11Y-7B)', () => {
  it('passes normal preferences through unchanged', () => {
    expect(getEffectiveAccessibilityPreferences({ ...defaultAccessibilityPreferences, highContrast: true })).toMatchObject({
      highContrast: true,
      largeControls: false,
      textSize: 'normal',
    })
  })

  it('bundles senior mode into every effective flag, matching AccessibilityHub scope logic', () => {
    const effective = getEffectiveAccessibilityPreferences({ ...defaultAccessibilityPreferences, seniorMode: true })
    expect(effective).toEqual({
      highContrast: true,
      largeControls: true,
      lineSpacing: true,
      reduceMotion: true,
      simpleReading: true,
      textSize: 'extra-large',
    })
  })

  it('is safe with undefined/null input', () => {
    expect(getEffectiveAccessibilityPreferences(undefined).textSize).toBe('normal')
    expect(getEffectiveAccessibilityPreferences(null).textSize).toBe('normal')
  })
})

describe('app root live accessibility preferences (A11Y-7B)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('loads the existing stored preference at startup', () => {
    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, textSize: 'large' })
    render(<AppRootHarness />)

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-text-size')).toBe('large')
  })

  it('applies text size to the root', () => {
    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, textSize: 'extra-large' })
    render(<AppRootHarness />)

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-text-size')).toBe('extra-large')
  })

  it('applies high contrast to the root', () => {
    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, highContrast: true })
    render(<AppRootHarness />)

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-high-contrast')).toBe('true')
  })

  it('applies reduced motion to the root', () => {
    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, reduceMotion: true })
    render(<AppRootHarness />)

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-reduced-motion')).toBe('true')
  })

  it('applies large controls to the root', () => {
    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, largeControls: true })
    render(<AppRootHarness />)

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-large-controls')).toBe('true')
  })

  it('applies multiple preferences at once without interference', () => {
    saveAccessibilityPreferences({
      ...defaultAccessibilityPreferences,
      highContrast: true,
      largeControls: true,
      lineSpacing: true,
      reduceMotion: true,
      textSize: 'extra-large',
    })
    render(<AppRootHarness />)

    const root = screen.getByTestId('app-root')
    expect(root.getAttribute('data-a11y-text-size')).toBe('extra-large')
    expect(root.getAttribute('data-a11y-high-contrast')).toBe('true')
    expect(root.getAttribute('data-a11y-large-controls')).toBe('true')
    expect(root.getAttribute('data-a11y-line-spacing')).toBe('true')
    expect(root.getAttribute('data-a11y-reduced-motion')).toBe('true')
  })

  it('updates the already-mounted root live, without a remount, when a preference changes elsewhere', () => {
    const mountCountRef = { current: 0 }
    render(<AppRootHarness mountCountRef={mountCountRef} />)
    const root = screen.getByTestId('app-root')

    expect(root.getAttribute('data-a11y-high-contrast')).toBeNull()
    expect(mountCountRef.current).toBe(1)

    act(() => {
      saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, highContrast: true })
    })

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-high-contrast')).toBe('true')
    // Same DOM node, same mount - a live update, not a reload/remount.
    expect(screen.getByTestId('app-root')).toBe(root)
    expect(mountCountRef.current).toBe(1)
  })

  it('resets the root state live, without reload, when preferences are reset', () => {
    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, highContrast: true, textSize: 'large' })
    render(<AppRootHarness />)
    expect(screen.getByTestId('app-root').getAttribute('data-a11y-high-contrast')).toBe('true')

    act(() => {
      resetAccessibilityPreferences()
    })

    const root = screen.getByTestId('app-root')
    expect(root.getAttribute('data-a11y-high-contrast')).toBeNull()
    expect(root.getAttribute('data-a11y-text-size')).toBe('normal')
  })

  it('stays on safe defaults when stored preference data is malformed', () => {
    window.localStorage.setItem('viktkollen.accessibility.preferences.v1', '{not valid json')
    expect(() => render(<AppRootHarness />)).not.toThrow()

    const root = screen.getByTestId('app-root')
    expect(root.getAttribute('data-a11y-text-size')).toBe('normal')
    expect(root.getAttribute('data-a11y-high-contrast')).toBeNull()
  })

  it('gives a default (no preferences stored) user the normal, unmodified UI', () => {
    render(<AppRootHarness />)
    const root = screen.getByTestId('app-root')

    expect(root.getAttribute('data-a11y-text-size')).toBe('normal')
    expect(root.getAttribute('data-a11y-high-contrast')).toBeNull()
    expect(root.getAttribute('data-a11y-large-controls')).toBeNull()
    expect(root.getAttribute('data-a11y-line-spacing')).toBeNull()
    expect(root.getAttribute('data-a11y-reduced-motion')).toBeNull()
  })

  it('causes no network call when preferences are read, saved, or reset', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network calls expected')
    })

    render(<AppRootHarness />)
    act(() => {
      saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, highContrast: true })
      resetAccessibilityPreferences()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('reflects a real AccessibilityHub preference change live, proving both consumers share one state', async () => {
    await i18n.changeLanguage('sv')

    render(
      <>
        <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
          <AccessibilityHub />
        </MoreHub>
        <AppRootHarness />
      </>,
    )

    const root = screen.getByTestId('app-root')
    expect(root.getAttribute('data-a11y-high-contrast')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Syn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tydligare kontrast' }))

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-high-contrast')).toBe('true')
  })

  it('keeps reflecting correct state across unrelated re-renders (survives normal in-app navigation)', () => {
    function Wrapper() {
      return (
        <div>
          <AppRootHarness />
        </div>
      )
    }

    saveAccessibilityPreferences({ ...defaultAccessibilityPreferences, largeControls: true })
    const { rerender } = render(<Wrapper />)
    expect(screen.getByTestId('app-root').getAttribute('data-a11y-large-controls')).toBe('true')

    // Simulate an unrelated parent re-render (e.g. navigation state change).
    rerender(<Wrapper />)

    expect(screen.getByTestId('app-root').getAttribute('data-a11y-large-controls')).toBe('true')
  })
})
