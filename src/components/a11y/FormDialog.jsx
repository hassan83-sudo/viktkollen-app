import { useId } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ModalDialog from './ModalDialog.jsx'

// A11Y-8X2 (8M B13): a small named modal form for the flows that used
// window.prompt (import mode, photo note). Same shell as DateTimeDialog
// (8X1): the shared 8C dialog system (initial focus, trap, Escape, focus back
// to the opener or fallbackFocusRef), rendered in document.body, a title that
// names the dialog, an optional description, a submit button and Cancel.

function FormDialog({ children, description, fallbackFocusRef, initialFocusRef, onCancel, onSubmit, submitLabel, title }) {
  const { t } = useTranslation('common')
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit()
  }

  return createPortal(
    <div className="form-dialog-backdrop" role="presentation">
      <ModalDialog
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        className="form-dialog"
        closeOnEscape
        fallbackFocusRef={fallbackFocusRef}
        initialFocusRef={initialFocusRef}
        onClose={onCancel}
      >
        <form noValidate onSubmit={handleSubmit}>
          <h2 id={titleId}>{title}</h2>
          {description ? <p className="form-dialog-description" id={descriptionId}>{description}</p> : null}
          {children}
          <div className="form-dialog-actions">
            <button className="primary-button" type="submit">{submitLabel}</button>
            <button className="secondary-button" type="button" onClick={onCancel}>{t('actions.cancel')}</button>
          </div>
        </form>
      </ModalDialog>
    </div>,
    document.body,
  )
}

export default FormDialog
