import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ModalDialog from './ModalDialog.jsx'

// A11Y-8X3 (8M B13): replaces window.confirm. A named alertdialog with the
// question as its description, a confirm button and Avbryt, built on the
// shared 8C dialog system (trap, Escape = Avbryt, focus back to the opener or
// to fallbackFocusRef when the opener is gone). Initial focus is on Avbryt,
// so an accidental Enter never confirms a destructive action. Rendered in
// document.body like the 8X1/8X2 dialogs.

function ConfirmDialog({ confirmLabel, description, destructive = true, fallbackFocusRef, onCancel, onConfirm, title }) {
  const { t } = useTranslation('common')
  const id = useId()
  const cancelRef = useRef(null)
  // One confirmation runs the action once, even on a double click.
  const doneRef = useRef(false)
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  return createPortal(
    <div className="form-dialog-backdrop" role="presentation">
      <ModalDialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="form-dialog confirm-dialog"
        closeOnEscape
        fallbackFocusRef={fallbackFocusRef}
        initialFocusRef={cancelRef}
        role="alertdialog"
        onClose={onCancel}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="form-dialog-description" id={descriptionId}>{description}</p>
        <div className="form-dialog-actions">
          <button className={destructive ? 'primary-button danger-button' : 'primary-button'} type="button" onClick={() => {
            if (doneRef.current) return
            doneRef.current = true
            onConfirm()
          }}>{confirmLabel}</button>
          <button className="secondary-button" ref={cancelRef} type="button" onClick={onCancel}>{t('actions.cancel')}</button>
        </div>
      </ModalDialog>
    </div>,
    document.body,
  )
}

export default ConfirmDialog
