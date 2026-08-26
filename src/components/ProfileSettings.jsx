import { useState } from 'react'
import { useTranslation } from 'react-i18next'

function ProfileSettings({ onResetDemoData }) {
  const { t } = useTranslation(['settings'])
  const [confirmation, setConfirmation] = useState('')

  function handleReset() {
    onResetDemoData()
    setConfirmation(t('settings:profile.resetDone'))
  }

  return (
    <section className="panel profile-settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Profil</p>
          <h2>{t('settings:profile.title')}</h2>
        </div>
      </div>

      <div className="profile-settings-content">
        <div>
          <strong>{t('settings:profile.demoData')}</strong>
          <p>{t('settings:profile.demoDataDescription')}</p>
        </div>
        <button type="button" onClick={handleReset}>
          {t('settings:profile.resetDemoData')}
        </button>
      </div>

      {confirmation && (
        <p className="settings-confirmation" role="status">
          {confirmation}
        </p>
      )}
    </section>
  )
}

export default ProfileSettings
