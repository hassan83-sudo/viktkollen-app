import { useLayoutEffect, useRef } from 'react'

// A11Y-8C: shared, business-logic-free accessibility for modal dialogs.
//
// useDialogA11y({ dialogRef, ... }) gives a mounted modal:
//   - initial focus (initialFocusRef -> first tabbable -> the dialog itself)
//   - a Tab / Shift+Tab focus trap, recomputed on every key press so content
//     that changes while the dialog is open is handled
//   - optional Escape to close (closeOnEscape, default false = safe: a dialog
//     only closes on Escape when its owner explicitly allows it)
//   - focus return to the element that opened it (or a safe fallback, never
//     a random <body>)
//   - `inert` on everything outside the dialog, so the background cannot be
//     reached by keyboard or screen-reader navigation
//   - optional body scroll lock
// Stacked dialogs are supported: only the top-most dialog reacts to keys, the
// background stays inert until the last modal closes, and focus is restored
// step by step.

const tabbableSelector = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

function isHiddenWithin(element, container) {
  let node = element
  while (node && node !== container.parentElement) {
    if (node.hidden || node.hasAttribute?.('inert')) return true
    const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(node) : null
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true
    node = node.parentElement
  }
  return false
}

function isInClosedDetails(element) {
  const details = element.closest('details:not([open])')
  if (!details) return false
  const summary = details.querySelector(':scope > summary')
  return !(summary && (summary === element || summary.contains(element)))
}

// Elements that are reachable with Tab inside container, in DOM order.
export function getTabbableElements(container) {
  if (!container) return []
  return [...container.querySelectorAll(tabbableSelector)].filter((element) => (
    !element.disabled
    && element.tabIndex >= 0
    && !isInClosedDetails(element)
    && !isHiddenWithin(element, container)
  ))
}

function isFocusable(element) {
  return Boolean(
    element
    && element.isConnected
    && typeof element.focus === 'function'
    && !element.disabled
    && !element.closest('[inert]'),
  )
}

function focusElement(element) {
  if (!isFocusable(element)) return false
  element.focus({ preventScroll: false })
  return element.ownerDocument.activeElement === element
}

function focusDialogContainer(dialog) {
  if (!dialog) return false
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1')
  dialog.focus()
  return dialog.ownerDocument.activeElement === dialog
}

// ---------------------------------------------------------------------------
// Dialog stack: only the top-most open dialog handles keyboard events.
// ---------------------------------------------------------------------------
const dialogStack = []

export function getOpenDialogCount() {
  return dialogStack.length
}

function isTopDialog(entry) {
  return dialogStack[dialogStack.length - 1] === entry
}

// ---------------------------------------------------------------------------
// Reference-counted `inert` on everything outside the dialog. Walks from the
// dialog up to <body> and marks every sibling on the way, so it works for
// portals in document.body and for dialogs rendered inline in the app.
// Elements that were already inert before stay inert after cleanup.
// ---------------------------------------------------------------------------
const inertState = new Map()
const skippedTags = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META'])

function acquireInert(element) {
  const state = inertState.get(element)
  if (state) {
    state.count += 1
    return
  }
  const wasInert = element.hasAttribute('inert')
  inertState.set(element, { count: 1, wasInert })
  if (!wasInert) element.setAttribute('inert', '')
}

function releaseInert(element) {
  const state = inertState.get(element)
  if (!state) return
  state.count -= 1
  if (state.count > 0) return
  inertState.delete(element)
  if (!state.wasInert) element.removeAttribute('inert')
}

export function makeOutsideInert(dialog) {
  const applied = []
  let node = dialog
  const body = dialog?.ownerDocument?.body
  while (node && node !== body && node.parentElement) {
    const parent = node.parentElement
    ;[...parent.children].forEach((sibling) => {
      if (sibling === node || skippedTags.has(sibling.tagName)) return
      acquireInert(sibling)
      applied.push(sibling)
    })
    node = parent
  }
  return () => applied.forEach(releaseInert)
}

// ---------------------------------------------------------------------------
// Reference-counted body scroll lock (the original overflow is restored once
// the last locking dialog closes).
// ---------------------------------------------------------------------------
let scrollLockCount = 0
let scrollLockPreviousOverflow = ''

function lockBodyScroll(doc) {
  if (scrollLockCount === 0) {
    scrollLockPreviousOverflow = doc.body.style.overflow
    doc.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1)
    if (scrollLockCount === 0) doc.body.style.overflow = scrollLockPreviousOverflow
  }
}

// Last resort when the opener is gone: the app's main landmark (focusable
// programmatically), never an arbitrary <body> focus.
function focusSafeFallback(doc) {
  const main = doc.querySelector('main')
  if (!main || main.closest('[inert]')) return false
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
  main.focus({ preventScroll: true })
  return doc.activeElement === main
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useDialogA11y({
  closeOnEscape = false,
  dialogRef,
  fallbackFocusRef,
  inertOutside = true,
  initialFocus = 'first',
  initialFocusRef,
  isOpen = true,
  lockScroll = false,
  onClose,
} = {}) {
  // Latest options without re-running the open/close effect on every render.
  // Declared before the main effect, so it is current when that effect runs.
  const optionsRef = useRef({})
  useLayoutEffect(() => {
    optionsRef.current = { closeOnEscape, fallbackFocusRef, initialFocus, initialFocusRef, onClose }
  })

  useLayoutEffect(() => {
    const dialog = dialogRef?.current
    if (!isOpen || !dialog) return undefined

    const doc = dialog.ownerDocument
    const view = doc.defaultView
    const activeBeforeOpen = doc.activeElement
    const opener = activeBeforeOpen && activeBeforeOpen !== doc.body && !dialog.contains(activeBeforeOpen)
      ? activeBeforeOpen
      : null
    const entry = { dialog }
    dialogStack.push(entry)

    const releaseInertOutside = inertOutside ? makeOutsideInert(dialog) : () => {}
    const unlockScroll = lockScroll ? lockBodyScroll(doc) : () => {}

    // Initial focus, unless something inside already has focus:
    // initialFocusRef -> first tabbable element -> the dialog itself.
    // initialFocus: 'dialog' focuses the dialog itself (its name is announced)
    // for dialogs whose first control is an action that should not be
    // triggered by an accidental Enter.
    if (!dialog.contains(doc.activeElement)) {
      const preferred = optionsRef.current.initialFocusRef?.current
      if (!(preferred && dialog.contains(preferred) && focusElement(preferred))) {
        const [first] = optionsRef.current.initialFocus === 'dialog' ? [] : getTabbableElements(dialog)
        if (!(first && focusElement(first))) focusDialogContainer(dialog)
      }
    }

    function handleKeyDown(event) {
      if (!isTopDialog(entry) || event.defaultPrevented) return

      if (event.key === 'Escape') {
        const { closeOnEscape: allowEscape, onClose: close } = optionsRef.current
        if (!allowEscape || typeof close !== 'function') return
        event.preventDefault()
        close()
        return
      }

      if (event.key !== 'Tab') return
      const tabbable = getTabbableElements(dialog)
      const active = doc.activeElement
      if (tabbable.length === 0) {
        event.preventDefault()
        focusDialogContainer(dialog)
        return
      }
      const first = tabbable[0]
      const last = tabbable[tabbable.length - 1]
      const outside = !dialog.contains(active)
      if (event.shiftKey && (active === first || active === dialog || outside)) {
        event.preventDefault()
        focusElement(last)
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        focusElement(first)
      }
    }

    view.addEventListener('keydown', handleKeyDown)

    return () => {
      view.removeEventListener('keydown', handleKeyDown)
      const index = dialogStack.indexOf(entry)
      const wasTop = index === dialogStack.length - 1
      if (index !== -1) dialogStack.splice(index, 1)
      releaseInertOutside()
      unlockScroll()

      // Only move focus when it would otherwise be lost: it is inside the
      // closing dialog, on <body>, or nowhere. A dialog closed underneath
      // another one leaves focus alone.
      const current = doc.activeElement
      const focusLost = !current || current === doc.body || dialog.contains(current) || !current.isConnected
      if (!wasTop || !focusLost) return

      if (focusElement(opener)) return
      if (focusElement(optionsRef.current.fallbackFocusRef?.current)) return
      const underneath = dialogStack[dialogStack.length - 1]?.dialog
      if (underneath) {
        const [first] = getTabbableElements(underneath)
        if ((first && focusElement(first)) || focusDialogContainer(underneath)) return
      }
      focusSafeFallback(doc)
    }
  }, [dialogRef, inertOutside, isOpen, lockScroll])
}
