import { getAccessibilityScrollBehavior } from './accessibilityDocumentScope.js'

// A11Y-8I: WCAG 2.4.11 Focus Not Obscured.
//
// The page scrolls on the root element and the bottom navigation is fixed
// over the bottom of the viewport. `scroll-padding-bottom` on <html>
// (styles/accessibility.css) keeps focused elements above the navigation when
// the browser scrolls them into view. Browsers only do that when an element is
// completely out of view, though: a control that is partly hidden (under the
// navigation, or at the edge of a horizontal chip row such as the Stället
// timers) is left where it is.
//
// This listener completes the job for keyboard focus only (:focus-visible,
// so mouse and touch never cause extra scrolling). When the focused control
// is not fully visible in every scroll container and above the bottom
// navigation, it is scrolled into view with block/inline 'nearest'. That
// honours scroll-padding and the reduced-motion policy.

const scrollableOverflow = /(auto|scroll)/

function obscuringBottomEdge(doc, element) {
  const nav = doc.querySelector('.bottom-nav')
  if (!nav || nav.contains(element) || nav.closest('[inert]')) return doc.defaultView.innerHeight
  const { position } = doc.defaultView.getComputedStyle(nav)
  if (position !== 'fixed' && position !== 'sticky') return doc.defaultView.innerHeight
  return Math.min(doc.defaultView.innerHeight, nav.getBoundingClientRect().top)
}

// True when the element's box lies inside the viewport (above the bottom
// navigation) and inside every scrollable ancestor.
export function isFocusTargetFullyVisible(element) {
  const doc = element?.ownerDocument
  const view = doc?.defaultView
  if (!view || typeof element.getBoundingClientRect !== 'function') return true
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return true

  const tolerance = 1
  if (rect.top < -tolerance || rect.left < -tolerance) return false
  if (rect.right > view.innerWidth + tolerance) return false
  if (rect.bottom > obscuringBottomEdge(doc, element) + tolerance) return false

  for (let node = element.parentElement; node && node !== doc.documentElement; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    const scrollsX = scrollableOverflow.test(style.overflowX) && node.scrollWidth > node.clientWidth
    const scrollsY = scrollableOverflow.test(style.overflowY) && node.scrollHeight > node.clientHeight
    if (!scrollsX && !scrollsY) continue
    const box = node.getBoundingClientRect()
    if (scrollsX && (rect.left < box.left - tolerance || rect.right > box.right + tolerance)) return false
    if (scrollsY && (rect.top < box.top - tolerance || rect.bottom > box.bottom + tolerance)) return false
  }
  return true
}

function isKeyboardFocus(element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return false
  }
}

export function revealKeyboardFocus(element) {
  if (!element || typeof element.scrollIntoView !== 'function') return false
  if (!isKeyboardFocus(element) || isFocusTargetFullyVisible(element)) return false
  element.scrollIntoView({ behavior: getAccessibilityScrollBehavior(), block: 'nearest', inline: 'nearest' })
  return true
}

let installedOn = null

export function installFocusVisibility(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || installedOn === doc) return () => {}
  const handleFocusIn = (event) => {
    // After the browser's own focus scrolling has run.
    doc.defaultView.requestAnimationFrame(() => {
      if (doc.activeElement === event.target) revealKeyboardFocus(event.target)
    })
  }
  doc.addEventListener('focusin', handleFocusIn)
  installedOn = doc
  return () => {
    doc.removeEventListener('focusin', handleFocusIn)
    installedOn = null
  }
}
