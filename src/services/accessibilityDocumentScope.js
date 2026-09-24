import { useLayoutEffect } from 'react'

// A11Y-8B: the effective accessibility preferences are exposed on <html>
// (document.documentElement) instead of on <main>. Portals rendered into
// document.body (AI Coach, weather, social, smart camera, body scan and other
// stages/dialogs) and the auth/onboarding screens are all descendants of
// <html>, so the global accessibility CSS (src/styles/accessibility.css)
// reaches them too.
export const accessibilityDocumentAttributes = Object.freeze({
  highContrast: 'data-a11y-high-contrast',
  largeControls: 'data-a11y-large-controls',
  lineSpacing: 'data-a11y-line-spacing',
  reduceMotion: 'data-a11y-reduced-motion',
  textSize: 'data-a11y-text-size',
})

const booleanPreferenceKeys = ['highContrast', 'largeControls', 'lineSpacing', 'reduceMotion']
const textSizes = ['normal', 'large', 'extra-large']

function getDocumentRoot(root) {
  if (root) return root
  return typeof document !== 'undefined' ? document.documentElement : null
}

// Applies an effective preference object (see
// getEffectiveAccessibilityPreferences) to the root. Boolean preferences are
// present as "true" only while enabled and removed otherwise, so a disabled or
// reset preference never leaves a stale attribute behind.
export function applyAccessibilityDocumentScope(effective = {}, root) {
  const target = getDocumentRoot(root)
  if (!target) return

  target.setAttribute(
    accessibilityDocumentAttributes.textSize,
    textSizes.includes(effective.textSize) ? effective.textSize : 'normal',
  )
  booleanPreferenceKeys.forEach((key) => {
    const attribute = accessibilityDocumentAttributes[key]
    if (effective[key]) target.setAttribute(attribute, 'true')
    else target.removeAttribute(attribute)
  })
}

// Removes every attribute this scope owns (and nothing else).
export function clearAccessibilityDocumentScope(root) {
  const target = getDocumentRoot(root)
  if (!target) return
  Object.values(accessibilityDocumentAttributes).forEach((attribute) => target.removeAttribute(attribute))
}

// Mounted once from the app root. Layout effect, so the attributes are in
// place before the browser paints (no flash of default-sized text), and
// cleaned up if the app root unmounts.
export function useAccessibilityDocumentScope(effective) {
  const { highContrast, largeControls, lineSpacing, reduceMotion, textSize } = effective || {}

  useLayoutEffect(() => {
    applyAccessibilityDocumentScope({ highContrast, largeControls, lineSpacing, reduceMotion, textSize })
  }, [highContrast, largeControls, lineSpacing, reduceMotion, textSize])

  useLayoutEffect(() => () => clearAccessibilityDocumentScope(), [])
}

// One motion policy for JavaScript: Viktkollen's own Reduced Motion setting
// or the operating system's prefers-reduced-motion. The CSS side applies the
// same two sources in src/styles/accessibility.css.
export function prefersReducedAccessibilityMotion({ root, win } = {}) {
  const target = getDocumentRoot(root)
  if (target?.getAttribute(accessibilityDocumentAttributes.reduceMotion) === 'true') return true

  const view = win || (typeof window !== 'undefined' ? window : null)
  return Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

// For scrollIntoView/scrollTo: 'auto' (instant) when motion is reduced.
export function getAccessibilityScrollBehavior(options) {
  return prefersReducedAccessibilityMotion(options) ? 'auto' : 'smooth'
}
