import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')

// A11Y-7B: source-text check for the app-root wiring, matching how App.jsx is
// already tested elsewhere (App.sectionRouting.test.js) rather than mounting
// the full, heavyweight App component. The actual live-update behavior of
// the hook/helper this wiring calls is covered by
// accessibilityPreferences.appWide.test.jsx.
describe('app-wide accessibility preference wiring (A11Y-7B)', () => {
  it('reads live preferences from the existing shared store, not a duplicate state source', () => {
    expect(appSource).toContain("from './services/accessibilityPreferences.js'")
    expect(appSource).toContain('getEffectiveAccessibilityPreferences,')
    expect(appSource).toContain('useAccessibilityPreferences,')
    expect(appSource).toContain('const accessibilityPreferences = useAccessibilityPreferences()')
    expect(appSource).toContain('const effectiveAccessibility = getEffectiveAccessibilityPreferences(accessibilityPreferences)')
  })

  // A11Y-8B: the resolved preferences are exposed on <html> through
  // useAccessibilityDocumentScope, so portals outside <main> inherit them.
  it('applies the resolved preferences globally on <html>, not on <main>', () => {
    expect(appSource).toContain("from './services/accessibilityDocumentScope.js'")
    expect(appSource).toContain('useAccessibilityDocumentScope(effectiveAccessibility)')

    expect(appSource.match(/<main\s/g)?.length).toBe(1)
    const mainTagStart = appSource.indexOf('<main')
    const mainTagEnd = appSource.indexOf('>', mainTagStart)
    const mainOpenTag = appSource.slice(mainTagStart, mainTagEnd)
    expect(mainOpenTag).toContain('className="app-shell"')
    expect(mainOpenTag).not.toContain('data-a11y-')
    expect(appSource).not.toContain('data-a11y-text-size={')
  })

  it('calls the document scope hook before any early return, so auth and onboarding are covered too', () => {
    const hookIndex = appSource.indexOf('useAccessibilityDocumentScope(effectiveAccessibility)')
    const firstEarlyReturn = appSource.indexOf('return <AppLoadingScreen />')
    expect(hookIndex).toBeGreaterThan(-1)
    expect(firstEarlyReturn).toBeGreaterThan(hookIndex)
  })

  it('lets programmatic app scrolling follow the shared reduced-motion policy', () => {
    expect(appSource).toContain('getAccessibilityScrollBehavior')
    expect(appSource).not.toContain("matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'")
  })

  it('does not apply behavioral-only preferences (avoidPreciseGestures, extraInteractionTime, calmMode) app-wide, since no real behavior exists for them yet', () => {
    expect(appSource).not.toContain('data-a11y-avoid-precise-gestures')
    expect(appSource).not.toContain('data-a11y-extra-interaction-time')
    expect(appSource).not.toContain('data-a11y-calm-mode')
    expect(appSource).not.toContain('data-a11y-simple')
  })
})
