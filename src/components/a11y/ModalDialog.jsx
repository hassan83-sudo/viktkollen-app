import { useRef } from 'react'
import { useDialogA11y } from '../../services/accessibilityDialog.js'

// A11Y-8C: a plain modal container for dialogs rendered inline (for example
// Ready and Place). It only adds dialog semantics and the shared focus,
// keyboard and inert handling from useDialogA11y; content, styling and the
// close behaviour stay with the caller (onClose is the caller's existing
// close callback, used for Escape only when closeOnEscape is true).
function ModalDialog({
  children,
  closeOnEscape = false,
  fallbackFocusRef,
  initialFocus,
  initialFocusRef,
  onClose,
  role = 'dialog',
  ...props
}) {
  const dialogRef = useRef(null)
  useDialogA11y({ closeOnEscape, dialogRef, fallbackFocusRef, initialFocus, initialFocusRef, onClose })

  return (
    <div {...props} aria-modal="true" ref={dialogRef} role={role === 'alertdialog' ? 'alertdialog' : 'dialog'}>
      {children}
    </div>
  )
}

export default ModalDialog
