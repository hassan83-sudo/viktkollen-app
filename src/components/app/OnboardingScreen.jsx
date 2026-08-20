import PwaExperience from '../PwaExperience.jsx'

function OnboardingScreen({
  activityOptions,
  goalOptions,
  onCancel,
  onProfileFormChange,
  onSubmit,
  profileCompleteness,
  profileError,
  profileForm,
}) {
  const dietaryOptions = [
    { label: 'Allätare', value: 'omnivore' },
    { label: 'Vegetarisk', value: 'vegetarian' },
    { label: 'Vegansk', value: 'vegan' },
    { label: 'Pescetarisk', value: 'pescatarian' },
    { label: 'Eget val', value: 'custom' },
  ]

  return (
    <main className="app-shell onboarding-shell">
      <PwaExperience />
      <section className="onboarding-card">
        <p className="eyebrow">Välkommen till Viktkollen</p>
        <h1>Skapa din profil</h1>
        <p className="onboarding-copy">
          Svara på några snabba frågor eller hoppa över sådant du vill fylla i
          senare. Profilen används bara för mer relevanta mål, råd och scannerkontext.
        </p>

        <form className="onboarding-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Namn <small>frivilligt</small></span>
            <input
              type="text"
              value={profileForm.displayName}
              onChange={(event) => onProfileFormChange('displayName', event.target.value)}
              placeholder="Ditt namn"
            />
          </label>

          <label className="field">
            <span>Vad vill du uppnå?</span>
            <select
              value={profileForm.weightDirection}
              onChange={(event) => onProfileFormChange('weightDirection', event.target.value)}
            >
              {goalOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="onboarding-row">
            <label className="field">
              <span>Startvikt <small>frivilligt</small></span>
              <input
                type="text"
                inputMode="decimal"
                value={profileForm.startWeight}
                onChange={(event) => onProfileFormChange('startWeight', event.target.value)}
                placeholder="Ex. 91,8"
              />
            </label>

            <label className="field">
              <span>Målvikt <small>frivilligt</small></span>
              <input
                type="text"
                inputMode="decimal"
                value={profileForm.goalWeight}
                onChange={(event) => onProfileFormChange('goalWeight', event.target.value)}
                placeholder="Ex. 84,0"
              />
            </label>
          </div>

          <label className="field">
            <span>Längd <small>frivilligt</small></span>
            <input
              type="text"
              inputMode="decimal"
              value={profileForm.height}
              onChange={(event) => onProfileFormChange('height', event.target.value)}
              placeholder="Ex. 178"
            />
          </label>

          <label className="field">
            <span>Aktivitetsnivå <small>kan ändras senare</small></span>
            <select
              value={profileForm.activityLevel}
              onChange={(event) => onProfileFormChange('activityLevel', event.target.value)}
            >
              {activityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Matpreferens <small>frivilligt</small></span>
            <select
              value={profileForm.dietaryPattern}
              onChange={(event) => onProfileFormChange('dietaryPattern', event.target.value)}
            >
              {dietaryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Undvik matvaror <small>frivilligt</small></span>
            <textarea
              value={profileForm.avoidances}
              onChange={(event) => onProfileFormChange('avoidances', event.target.value)}
              placeholder="Ex. jordnötter, fläsk"
              rows="3"
            />
          </label>

          {profileCompleteness?.nextBestAction && (
            <p className="settings-confirmation" role="status">
              {profileCompleteness.nextBestAction}
            </p>
          )}

          {profileError && (
            <p className="form-error" role="alert">
              {profileError}
            </p>
          )}

          <div className="account-settings-actions">
            <button type="submit">Spara och fortsätt</button>
            <button className="secondary-button" type="submit">
              Hoppa över just nu
            </button>
            {onCancel && (
              <button className="secondary-button" type="button" onClick={onCancel}>
                Avbryt
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}

export default OnboardingScreen
