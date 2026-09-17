import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const categoryIds = ['music', 'hum', 'birds', 'other']

function AiEarSection() {
  const { t } = useTranslation('aiEar')
  const [status, setStatus] = useState('')

  function showComingSoon() {
    setStatus(t('comingSoon'))
  }

  return (
    <article className="panel" id="ai-ear">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2>{t('title')}</h2>
        </div>
      </div>
      <p>{t('intro')}</p>

      <div className="wellbeing-quick-grid" role="group" aria-label={t('title')}>
        {categoryIds.map((categoryId) => (
          <button key={categoryId} type="button" onClick={showComingSoon}>
            <span aria-hidden="true">{t(`categories.${categoryId}.icon`)}</span>
            <strong>{t(`categories.${categoryId}.title`)}</strong>
          </button>
        ))}
      </div>

      <button className="primary-button" type="button" onClick={showComingSoon}>
        {t('start.title')}
      </button>
      <p className="estimate-note">{t('start.note')}</p>

      {status && (
        <p className="form-success" role="status" aria-live="polite">{status}</p>
      )}
    </article>
  )
}

export default AiEarSection
