import { useState } from 'react'

function ProfileSettings({ onResetDemoData }) {
  const [confirmation, setConfirmation] = useState('')

  function handleReset() {
    onResetDemoData()
    setConfirmation('Demo-data återställd')
  }

  return (
    <section className="panel profile-settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Profil</p>
          <h2>Inställningar</h2>
        </div>
      </div>

      <div className="profile-settings-content">
        <div>
          <strong>Demo-data</strong>
          <p>Rensa lokal progress, battles och quizhistorik och börja om.</p>
        </div>
        <button type="button" onClick={handleReset}>
          Återställ demo-data
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
