import { useTranslation } from 'react-i18next'

function ForgotSomethingCard({
  forgotText,
  onForgotTextChange,
  onSubmit,
  pendingForgotLabel,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation(['ready', 'common'])

  return (
    <section className="ready-forgot-card" aria-labelledby="ready-forgot-title">
      <h2 id="ready-forgot-title">{t('forgot.title')}</h2>
      <form onSubmit={onSubmit}>
        <label>
          <span className="sr-only">{t('forgot.input')}</span>
          <input
            placeholder={t('forgot.placeholder')}
            value={forgotText}
            onChange={(event) => onForgotTextChange(event.target.value)}
          />
        </label>
        <button type="submit">{t('forgot.ask')}</button>
      </form>
      {pendingForgotLabel ? (
        <div className="ready-confirm" role="dialog" aria-label={t('forgot.confirm', { label: pendingForgotLabel })}>
          <p>{t('forgot.confirm', { label: pendingForgotLabel })}</p>
          <div>
            <button type="button" onClick={onConfirm}>{t('common:yes')}</button>
            <button type="button" onClick={onCancel}>{t('common:no')}</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default ForgotSomethingCard
