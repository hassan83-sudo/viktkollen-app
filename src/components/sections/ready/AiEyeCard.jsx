import { useTranslation } from 'react-i18next'

function AiEyeCard({ onOpen }) {
  const { t } = useTranslation(['ready'])

  return (
    <button className="ready-action-tile" type="button" onClick={onOpen}>
      <span className="ready-action-tile-icon" aria-hidden="true">📷</span>
      <strong>{t('quickActions.eye.title')}</strong>
      <span>{t('quickActions.eye.subtitle')}</span>
    </button>
  )
}

export default AiEyeCard
