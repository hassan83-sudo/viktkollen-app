import { useTranslation } from 'react-i18next'

function AiCompanionCard({ onOpen }) {
  const { t } = useTranslation(['ready'])

  return (
    <button className="ready-companion-card" type="button" onClick={onOpen}>
      <span className="ready-companion-card-icon" aria-hidden="true">AI</span>
      <span className="ready-companion-card-copy">
        <strong>{t('companion.cardTitle')}</strong>
        <span>{t('companion.summary')}</span>
      </span>
      <span className="ready-companion-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export default AiCompanionCard
