/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ModalDialog from '../components/a11y/ModalDialog.jsx'
import { getOpenDialogCount, getTabbableElements, useDialogA11y } from './accessibilityDialog.js'

function PortalDialog({ children, label = 'Dialog', onClose, closeOnEscape = true, initialFocusRef, initialFocus, lockScroll = false }) {
  const dialogRef = useRef(null)
  useDialogA11y({ closeOnEscape, dialogRef, initialFocus, initialFocusRef, lockScroll, onClose })
  return createPortal(
    <div aria-label={label} aria-modal="true" ref={dialogRef} role="dialog">{children}</div>,
    document.body,
  )
}

// A small app: background content plus a button that opens a portal dialog.
function Harness({ dialogContent, dialogProps = {}, removeOpenerOnOpen = false }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <main>
        <button type="button">Before</button>
        {!(removeOpenerOnOpen && open) && (
          <button type="button" onClick={() => setOpen(true)}>Open</button>
        )}
        <a href="#after">After</a>
      </main>
      {open && (
        <PortalDialog {...dialogProps} onClose={() => setOpen(false)}>
          {typeof dialogContent === 'function' ? dialogContent(() => setOpen(false)) : dialogContent}
        </PortalDialog>
      )}
    </>
  )
}

function openWithKeyboard() {
  const opener = screen.getByRole('button', { name: 'Open' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement || document.body, { key: 'Tab', shiftKey })
const escape = () => fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' })

describe('useDialogA11y (A11Y-8C)', () => {
  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  describe('initial focus', () => {
    it('moves focus into the dialog, to the first interactive element by default', () => {
      render(<Harness dialogContent={<><p>Text</p><button type="button">First</button><button type="button">Second</button></>} />)
      openWithKeyboard()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
    })

    it('uses an explicit initialFocusRef first', () => {
      function WithRef() {
        const [open, setOpen] = useState(false)
        const cancelRef = useRef(null)
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>Open</button>
            {open && (
              <PortalDialog initialFocusRef={cancelRef} onClose={() => setOpen(false)}>
                <button type="button">Delete</button>
                <button ref={cancelRef} type="button">Cancel</button>
              </PortalDialog>
            )}
          </>
        )
      }
      render(<WithRef />)
      openWithKeyboard()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    })

    it('falls back to the dialog container when nothing inside is focusable', () => {
      render(<Harness dialogContent={<p>Only text</p>} />)
      openWithKeyboard()
      const dialog = screen.getByRole('dialog')
      expect(document.activeElement).toBe(dialog)
      expect(dialog.getAttribute('tabindex')).toBe('-1')
    })

    it("focuses the dialog itself with initialFocus 'dialog' (avoids auto-focusing a risky first action)", () => {
      render(<Harness dialogContent={<button type="button">Send alarm</button>} dialogProps={{ initialFocus: 'dialog' }} />)
      openWithKeyboard()
      expect(document.activeElement).toBe(screen.getByRole('dialog'))
    })

    it('never leaves focus behind the dialog', () => {
      render(<Harness dialogContent={<button type="button">Inside</button>} />)
      openWithKeyboard()
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })
  })

  describe('focus trap', () => {
    const content = (
      <>
        <button type="button">First</button>
        <button disabled type="button">Disabled</button>
        <button hidden type="button">Hidden</button>
        <span tabIndex={-1}>Programmatic only</span>
        <input aria-label="Field" />
        <button type="button">Last</button>
      </>
    )

    it('wraps Tab from the last element to the first', () => {
      render(<Harness dialogContent={content} />)
      openWithKeyboard()
      screen.getByRole('button', { name: 'Last' }).focus()
      tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
    })

    it('wraps Shift+Tab from the first element to the last', () => {
      render(<Harness dialogContent={content} />)
      openWithKeyboard()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
      tab(true)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }))
    })

    it('ignores disabled, hidden and tabindex="-1" elements', () => {
      render(<Harness dialogContent={content} />)
      openWithKeyboard()
      const names = getTabbableElements(screen.getByRole('dialog')).map((element) => element.textContent || element.getAttribute('aria-label'))
      expect(names).toEqual(['First', 'Field', 'Last'])
    })

    it('keeps focus on the only tabbable element', () => {
      render(<Harness dialogContent={<button type="button">Only</button>} />)
      openWithKeyboard()
      tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Only' }))
      tab(true)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Only' }))
    })

    it('keeps focus on the dialog when nothing is tabbable', () => {
      render(<Harness dialogContent={<p>Only text</p>} />)
      openWithKeyboard()
      tab()
      expect(document.activeElement).toBe(screen.getByRole('dialog'))
    })

    it('brings focus back inside if it somehow ended up outside', () => {
      render(<Harness dialogContent={<><button type="button">First</button><button type="button">Last</button></>} />)
      openWithKeyboard()
      document.body.focus()
      tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
    })

    it('handles elements added while the dialog is open', () => {
      function Dynamic() {
        const [extra, setExtra] = useState(false)
        return (
          <>
            <button type="button" onClick={() => setExtra(true)}>Add</button>
            {extra && <button type="button">Added</button>}
          </>
        )
      }
      render(<Harness dialogContent={<Dynamic />} />)
      openWithKeyboard()
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      screen.getByRole('button', { name: 'Added' }).focus()
      tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add' }))
      tab(true)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Added' }))
    })
  })

  describe('Escape', () => {
    it('closes the dialog when allowed, exactly once', () => {
      const onClose = vi.fn()
      function Static() {
        const ref = useRef(null)
        useDialogA11y({ closeOnEscape: true, dialogRef: ref, onClose })
        return <div ref={ref} role="dialog" aria-modal="true" aria-label="Static"><button type="button">x</button></div>
      }
      render(<Static />)
      escape()
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does nothing on Escape by default (closeOnEscape=false)', () => {
      render(<Harness dialogContent={<button type="button">Inside</button>} dialogProps={{ closeOnEscape: false }} />)
      openWithKeyboard()
      escape()
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('ignores an Escape that an inner control already handled', () => {
      function Inner() {
        return <input aria-label="Combo" onKeyDown={(event) => { if (event.key === 'Escape') event.preventDefault() }} />
      }
      render(<Harness dialogContent={<Inner />} />)
      openWithKeyboard()
      escape()
      expect(screen.getByRole('dialog')).toBeTruthy()
    })
  })

  describe('focus return', () => {
    it('returns focus to the opener after Escape', () => {
      render(<Harness dialogContent={<button type="button">Inside</button>} />)
      const opener = openWithKeyboard()
      escape()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(opener)
    })

    it('returns focus to the opener after a close button or programmatic close', () => {
      render(<Harness dialogContent={(close) => <button type="button" onClick={close}>Close</button>} />)
      const opener = openWithKeyboard()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(document.activeElement).toBe(opener)
    })

    it('falls back to the main landmark (not body) when the opener is gone', () => {
      render(<Harness dialogContent={<button type="button">Inside</button>} removeOpenerOnOpen />)
      openWithKeyboard()
      escape()
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement).toBe(document.querySelector('main'))
    })
  })

  describe('inert background', () => {
    it('makes everything outside the dialog inert and restores it on close', () => {
      render(<Harness dialogContent={<button type="button">Inside</button>} />)
      const appRoot = document.body.firstElementChild
      openWithKeyboard()
      const dialog = screen.getByRole('dialog')
      expect(appRoot.hasAttribute('inert')).toBe(true)
      expect(dialog.hasAttribute('inert')).toBe(false)
      expect(dialog.closest('[inert]')).toBeNull()

      escape()
      expect(appRoot.hasAttribute('inert')).toBe(false)
    })

    it('keeps elements that were already inert inert after cleanup', () => {
      const alreadyInert = document.createElement('div')
      alreadyInert.setAttribute('inert', '')
      document.body.appendChild(alreadyInert)
      render(<Harness dialogContent={<button type="button">Inside</button>} />)
      openWithKeyboard()
      escape()
      expect(alreadyInert.hasAttribute('inert')).toBe(true)
      alreadyInert.remove()
    })

    it('works for a dialog rendered inline inside the app (not a portal)', () => {
      function Inline() {
        const [open, setOpen] = useState(false)
        return (
          <main>
            <nav><button type="button">Nav</button></nav>
            <section>
              <button type="button" onClick={() => setOpen(true)}>Open</button>
              {open && (
                <ModalDialog aria-label="Inline" closeOnEscape onClose={() => setOpen(false)}>
                  <button type="button">Inside</button>
                </ModalDialog>
              )}
            </section>
          </main>
        )
      }
      render(<Inline />)
      const opener = openWithKeyboard()
      const dialog = screen.getByRole('dialog', { name: 'Inline' })
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.closest('[inert]')).toBeNull()
      expect(screen.getByRole('button', { name: 'Nav' }).closest('[inert]')).not.toBeNull()
      expect(opener.hasAttribute('inert')).toBe(true)
      escape()
      expect(document.querySelectorAll('[inert]')).toHaveLength(0)
      expect(document.activeElement).toBe(opener)
    })

    it('locks body scroll only while open when requested', () => {
      document.body.style.overflow = 'auto'
      render(<Harness dialogContent={<button type="button">Inside</button>} dialogProps={{ lockScroll: true }} />)
      openWithKeyboard()
      expect(document.body.style.overflow).toBe('hidden')
      escape()
      expect(document.body.style.overflow).toBe('auto')
    })
  })

  describe('nested dialogs', () => {
    function Nested() {
      const [a, setA] = useState(false)
      const [b, setB] = useState(false)
      return (
        <>
          <main><button type="button" onClick={() => setA(true)}>Open</button></main>
          {a && (
            <PortalDialog label="A" onClose={() => setA(false)}>
              <button type="button" onClick={() => setB(true)}>Open B</button>
            </PortalDialog>
          )}
          {b && (
            <PortalDialog label="B" onClose={() => setB(false)}>
              <button type="button">In B</button>
            </PortalDialog>
          )}
        </>
      )
    }

    it('only lets the top dialog handle Escape and restores focus step by step', () => {
      render(<Nested />)
      const opener = openWithKeyboard()
      const openB = screen.getByRole('button', { name: 'Open B' })
      openB.focus()
      fireEvent.click(openB)
      const dialogA = screen.getByRole('dialog', { name: 'A' })
      expect(getOpenDialogCount()).toBe(2)
      expect(dialogA.closest('[inert]')).toBe(dialogA)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'In B' }))

      escape()
      expect(screen.queryByRole('dialog', { name: 'B' })).toBeNull()
      expect(screen.getByRole('dialog', { name: 'A' })).toBeTruthy()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open B' }))
      expect(document.querySelector('main').closest('[inert]')).not.toBeNull()
      expect(dialogA.hasAttribute('inert')).toBe(false)

      escape()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(opener)
      expect(document.querySelectorAll('[inert]')).toHaveLength(0)
      expect(getOpenDialogCount()).toBe(0)
    })
  })

  describe('lifecycle', () => {
    it('works under StrictMode (double effects) without leaking state', () => {
      render(
        <StrictMode>
          <Harness dialogContent={<button type="button">Inside</button>} />
        </StrictMode>,
      )
      const opener = openWithKeyboard()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }))
      expect(getOpenDialogCount()).toBe(1)
      escape()
      expect(document.activeElement).toBe(opener)
      expect(getOpenDialogCount()).toBe(0)
      expect(document.querySelectorAll('[inert]')).toHaveLength(0)
    })

    it('cleans up when unmounted while the dialog is open', () => {
      const { unmount } = render(<Harness dialogContent={<button type="button">Inside</button>} dialogProps={{ lockScroll: true }} />)
      openWithKeyboard()
      unmount()
      expect(getOpenDialogCount()).toBe(0)
      expect(document.querySelectorAll('[inert]')).toHaveLength(0)
      expect(document.body.style.overflow).toBe('')
      act(() => {
        fireEvent.keyDown(document.body, { key: 'Escape' })
      })
    })

    it('does nothing when isOpen is false', () => {
      function Closed() {
        const ref = useRef(null)
        useDialogA11y({ dialogRef: ref, isOpen: false })
        return <div ref={ref}><button type="button">x</button></div>
      }
      render(<Closed />)
      expect(getOpenDialogCount()).toBe(0)
      expect(document.querySelectorAll('[inert]')).toHaveLength(0)
    })
  })
})
