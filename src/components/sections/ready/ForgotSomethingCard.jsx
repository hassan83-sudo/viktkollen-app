import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// A11Y-8I: the "add to checklist?" confirmation is an inline question, not a
// modal dialog (the page stays usable), so it is a named group rather than
// role="dialog".
// - When it appears, focus moves to the question, so it is read out once, as
//   the group's name. It is not also a live region, to avoid reading it twice.
// - Yes/No remove the question. Focus returns to the text field that asked
//   it, never to <body>.
// - The result ("… was added") is announced once through a status region
//   that is always mounted. The status only changes on Yes, and it is cleared
//   on new input.
function ForgotSomethingCard({
  forgotText,
  onForgotTextChange,
  onSubmit,
  pendingForgotLabel,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation(['ready', 'common'])
  const inputRef = useRef(null)
  const confirmRef = useRef(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (pendingForgotLabel) confirmRef.current?.focus()
  }, [pendingForgotLabel])

  function handleConfirm() {
    const label = pendingForgotLabel
    onConfirm()
    setStatus(t('forgot.added', { label }))
    inputRef.current?.focus()
  }

  function handleCancel() {
    onCancel()
    inputRef.current?.focus()
  }

  return (
    <section className="ready-forgot-card" aria-labelledby="ready-forgot-title">
      <h2 id="ready-forgot-title">{t('forgot.title')}</h2>
      <form onSubmit={onSubmit}>
        <label>
          <span className="sr-only">{t('forgot.input')}</span>
          <input
            placeholder={t('forgot.placeholder')}
            ref={inputRef}
            value={forgotText}
            onChange={(event) => {
              setStatus('')
              onForgotTextChange(event.target.value)
            }}
          />
        </label>
        <button type="submit">{t('forgot.ask')}</button>
      </form>
      {pendingForgotLabel ? (
        <div className="ready-confirm" role="group" aria-labelledby="ready-forgot-question" ref={confirmRef} tabIndex={-1}>
          <p id="ready-forgot-question">{t('forgot.confirm', { label: pendingForgotLabel })}</p>
          <div>
            <button type="button" onClick={handleConfirm}>{t('common:yes')}</button>
            <button type="button" onClick={handleCancel}>{t('common:no')}</button>
          </div>
        </div>
      ) : null}
      <p className="sr-only" role="status">{status}</p>
    </section>
  )
}

export default ForgotSomethingCard
