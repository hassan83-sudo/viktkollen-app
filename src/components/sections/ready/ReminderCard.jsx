import { useTranslation } from 'react-i18next'

function ReminderCard({ onOpen }) {
  const { t } = useTranslation(['ready'])

  return (
    <button className="ready-info-tile" type="button" onClick={onOpen}>
      <span className="ready-info-tile-icon" aria-hidden="true">🔔</span>
      <span className="ready-info-tile-copy">
        <strong>{t('next.reminderTitle')}</strong>
        <span>{t('next.reminderSubtitle')}</span>
      </span>
    </button>
  )
}

export default ReminderCard
