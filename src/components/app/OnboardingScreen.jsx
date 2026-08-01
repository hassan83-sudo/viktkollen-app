import PwaExperience from '../PwaExperience.jsx'

function OnboardingScreen({
  activityOptions,
  goalOptions,
  onProfileFormChange,
  onSubmit,
  profileError,
  profileForm,
}) {
  return (
    <main className="app-shell onboarding-shell">
      <PwaExperience />
      <section className="onboarding-card">
        <p className="eyebrow">Välkommen till Viktkollen</p>
        <h1>Skapa din profil</h1>
        <p className="onboarding-copy">
          Svara på några snabba frågor så anpassar vi dashboarden efter ditt
          mål. All data sparas bara lokalt i din webbläsare.
        </p>

        <form className="onboarding-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Namn</span>
            <input
              type="text"
              value={profileForm.name}
              onChange={(event) => onProfileFormChange('name', event.target.value)}
              placeholder="Ditt namn"
              required
            />
          </label>

          <label className="field">
            <span>Mål</span>
            <select
              value={profileForm.goal}
              onChange={(event) => onProfileFormChange('goal', event.target.value)}
            >
              {goalOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <div className="onboarding-row">
            <label className="field">
              <span>Startvikt</span>
              <input
                type="text"
                inputMode="decimal"
                value={profileForm.startWeight}
                onChange={(event) => onProfileFormChange('startWeight', event.target.value)}
                placeholder="Ex. 91,8"
                required
              />
            </label>

            <label className="field">
              <span>Målvikt</span>
              <input
                type="text"
                inputMode="decimal"
                value={profileForm.goalWeight}
                onChange={(event) => onProfileFormChange('goalWeight', event.target.value)}
                placeholder="Ex. 84,0"
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Aktivitetsnivå</span>
            <select
              value={profileForm.activityLevel}
              onChange={(event) => onProfileFormChange('activityLevel', event.target.value)}
            >
              {activityOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          {profileError && (
            <p className="form-error" role="alert">
              {profileError}
            </p>
          )}

          <button type="submit">Spara och fortsätt</button>
        </form>
      </section>
    </main>
  )
}

export default OnboardingScreen
