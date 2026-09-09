import { useTranslation } from 'react-i18next'

function AiCoachHeader({ onClose }) {
  const { t } = useTranslation(['coach'])

  return (
    <header className="ai-coach-overlay-header">
      <div>
        <p className="eyebrow">{t('coach:overlay.title')}</p>
        <h2 id="ai-coach-overlay-title">{t('coach:overlay.title')}</h2>
        <p className="ai-coach-overlay-online">● {t('coach:overlay.online')}</p>
      </div>
      <button className="ai-coach-overlay-close" type="button" onClick={onClose} aria-label={t('coach:overlay.close')}>
        X
      </button>
    </header>
  )
}

export default AiCoachHeader
