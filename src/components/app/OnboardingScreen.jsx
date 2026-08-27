import PwaExperience from '../PwaExperience.jsx'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation(['common', 'onboarding'])
  const dietaryOptions = [
    { label: t('onboarding:dietary.omnivore'), value: 'omnivore' },
    { label: t('onboarding:dietary.vegetarian'), value: 'vegetarian' },
    { label: t('onboarding:dietary.vegan'), value: 'vegan' },
    { label: t('onboarding:dietary.pescatarian'), value: 'pescatarian' },
    { label: t('onboarding:dietary.custom'), value: 'custom' },
  ]

  return (
    <main className="app-shell onboarding-shell">
      <PwaExperience />
      <section className="onboarding-card">
        <p className="eyebrow">{t('onboarding:welcome')}</p>
        <h1>{t('onboarding:title')}</h1>
        <p className="onboarding-copy">
          {t('onboarding:copy')}
        </p>

        <form className="onboarding-form" onSubmit={onSubmit}>
          <label className="field">
            <span>{t('onboarding:fields.name')} <small>{t('common:optional')}</small></span>
            <input
              type="text"
              value={profileForm.displayName}
              onChange={(event) => onProfileFormChange('displayName', event.target.value)}
              placeholder={t('onboarding:placeholders.name')}
            />
          </label>

          <label className="field">
            <span>{t('onboarding:fields.goal')}</span>
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
              <span>{t('onboarding:fields.startWeight')} <small>{t('common:optional')}</small></span>
              <input
                type="text"
                inputMode="decimal"
                value={profileForm.startWeight}
                onChange={(event) => onProfileFormChange('startWeight', event.target.value)}
                placeholder={t('onboarding:placeholders.startWeight')}
              />
            </label>

            <label className="field">
              <span>{t('onboarding:fields.goalWeight')} <small>{t('common:optional')}</small></span>
              <input
                type="text"
                inputMode="decimal"
                value={profileForm.goalWeight}
                onChange={(event) => onProfileFormChange('goalWeight', event.target.value)}
                placeholder={t('onboarding:placeholders.goalWeight')}
              />
            </label>
          </div>

          <label className="field">
            <span>{t('onboarding:fields.height')} <small>{t('common:optional')}</small></span>
            <input
              type="text"
              inputMode="decimal"
              value={profileForm.height}
              onChange={(event) => onProfileFormChange('height', event.target.value)}
              placeholder={t('onboarding:placeholders.height')}
            />
          </label>

          <label className="field">
            <span>{t('onboarding:fields.activityLevel')} <small>{t('onboarding:canChangeLater')}</small></span>
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
            <span>{t('onboarding:fields.dietaryPreference')} <small>{t('common:optional')}</small></span>
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
            <span>{t('onboarding:fields.avoidances')} <small>{t('common:optional')}</small></span>
            <textarea
              value={profileForm.avoidances}
              onChange={(event) => onProfileFormChange('avoidances', event.target.value)}
              placeholder={t('onboarding:placeholders.avoidances')}
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
            <button type="submit">{t('common:actions.saveAndContinue')}</button>
            <button className="secondary-button" type="submit">
              {t('common:actions.skipForNow')}
            </button>
            {onCancel && (
              <button className="secondary-button" type="button" onClick={onCancel}>
                {t('common:actions.cancel')}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}

export default OnboardingScreen
