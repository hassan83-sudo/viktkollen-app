import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ModalDialog from './ModalDialog.jsx'
import { isValidDateValue, isValidTimeValue } from './dateTimeValidation.js'

// A11Y-8X1 (8M B13): replaces the window.prompt pairs for "which date" and
// "which time" (copy a meal, add a favourite, copy a weight). A named modal
// with a date and a time field, built on the shared 8C dialog system
// (initial focus in the date field, trap, Escape, focus back to the opener).
// Invalid input is not saved: one small status message, and the invalid
// fields get aria-invalid and aria-describedby. Focus stays where the form
// was submitted, so the message is announced once. Rendered in document.body,
// so a panel's own layout rules (Mat hides every other child of the active
// panel) cannot hide it.

function DateTimeDialog({ initialDate = '', initialTime = '', onCancel, onSave, saveLabel, title }) {
  const { t } = useTranslation('common')
  const id = useId()
  const dateRef = useRef(null)
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [errors, setErrors] = useState({ date: false, time: false })
  const titleId = `${id}-title`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const message = [
    errors.date ? t('dateTimeDialog.invalidDate') : '',
    errors.time ? t('dateTimeDialog.invalidTime') : '',
  ].filter(Boolean).join(' ')

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = { date: !isValidDateValue(date), time: !isValidTimeValue(time) }
    setErrors(nextErrors)
    if (nextErrors.date || nextErrors.time) return
    onSave(date, time)
  }

  function change(setter) {
    return (event) => {
      setter(event.target.value)
      setErrors({ date: false, time: false })
    }
  }

  return createPortal(
    <div className="date-time-dialog-backdrop" role="presentation">
      <ModalDialog
        aria-describedby={hintId}
        aria-labelledby={titleId}
        className="date-time-dialog"
        closeOnEscape
        initialFocusRef={dateRef}
        onClose={onCancel}
      >
        <form noValidate onSubmit={handleSubmit}>
          <h2 id={titleId}>{title}</h2>
          <p id={hintId}>{t('dateTimeDialog.hint')}</p>
          <label className="field">
            <span>{t('dateTimeDialog.date')}</span>
            <input
              aria-describedby={errors.date ? errorId : undefined}
              aria-invalid={errors.date || undefined}
              ref={dateRef}
              type="date"
              value={date}
              onChange={change(setDate)}
            />
          </label>
          <label className="field">
            <span>{t('dateTimeDialog.time')}</span>
            <input
              aria-describedby={errors.time ? errorId : undefined}
              aria-invalid={errors.time || undefined}
              type="time"
              value={time}
              onChange={change(setTime)}
            />
          </label>
          <p className="form-feedback-error" id={errorId} role="status">{message}</p>
          <div className="date-time-dialog-actions">
            <button className="primary-button" type="submit">{saveLabel}</button>
            <button className="secondary-button" type="button" onClick={onCancel}>{t('actions.cancel')}</button>
          </div>
        </form>
      </ModalDialog>
    </div>,
    document.body,
  )
}

export default DateTimeDialog
