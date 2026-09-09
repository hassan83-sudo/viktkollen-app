import { useTranslation } from 'react-i18next'

function MemoryTrainingCard({ onOpen }) {
  const { t } = useTranslation(['ready'])

  return (
    <button className="ready-action-tile" type="button" onClick={onOpen}>
      <span className="ready-action-tile-icon" aria-hidden="true">🧠</span>
      <strong>{t('quickActions.memory.title')}</strong>
      <span>{t('quickActions.memory.subtitle')}</span>
    </button>
  )
}

export default MemoryTrainingCard
