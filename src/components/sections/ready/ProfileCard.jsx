import { useTranslation } from 'react-i18next'

function ProfileCard({ onOpen }) {
  const { t } = useTranslation(['ready'])

  return (
    <button className="ready-action-tile" type="button" onClick={onOpen}>
      <span className="ready-action-tile-icon" aria-hidden="true">👤</span>
      <strong>{t('quickActions.profile.title')}</strong>
      <span>{t('quickActions.profile.subtitle')}</span>
    </button>
  )
}

export default ProfileCard
