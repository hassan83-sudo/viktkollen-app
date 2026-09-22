import { useTranslation } from 'react-i18next'
import {
  getEffectiveAccessibilityPreferences,
  resetAccessibilityPreferences,
  saveAccessibilityPreferences,
  useAccessibilityPreferences,
} from '../../services/accessibilityPreferences.js'

const textSizeOptions = ['normal', 'large', 'extra-large']
const toggleKeys = ['highContrast', 'largeControls', 'lineSpacing', 'reduceMotion']

// A11Y-7C: the ONE accessibility setup component, used identically from the
// optional onboarding entry and from Mer -> Tillgänglighet & hjälpmedel. It
// only ever reads/writes the existing A11Y-7B accessibilityPreferences store
// (no second preference store) and only exposes the five preferences that
// already have real, app-wide behavior (text size, high contrast, large
// controls, line spacing, reduced motion). It never asks about disability or
// diagnosis - only interface needs.
function AccessibilitySetup({ onFinish, onSkip, showSkip = false }) {
  const { t } = useTranslation('settings')
  const preferences = useAccessibilityPreferences()
  const effective = getEffectiveAccessibilityPreferences(preferences)

  function updatePreference(changes) {
    // Matches the exact rule AccessibilityHub's own preference buttons
    // already use: changing an individual preference here always clears
    // seniorMode, so the explicit choice made in this setup visibly applies
    // rather than being silently overridden by an earlier bundled toggle.
    saveAccessibilityPreferences({ ...preferences, ...changes, seniorMode: false })
  }

  return (
    <section className="accessibility-setup" aria-label={t('accessibility.setup.title')}>
      <p className="accessibility-setup-intro">{t('accessibility.setup.intro')}</p>

      <fieldset className="accessibility-preference-group">
        <legend>{t('accessibility.setup.textSizeLegend')}</legend>
        <div className="accessibility-option-grid" aria-label={t('accessibility.setup.textSizeLegend')}>
          {textSizeOptions.map((size) => (
            <button
              aria-pressed={preferences.textSize === size}
              className="accessibility-option-card"
              key={size}
              type="button"
              onClick={() => updatePreference({ textSize: size })}
            >
              {t(`accessibility.preferences.textSize.${size}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="accessibility-preference-group">
        <legend>{t('accessibility.setup.optionsLegend')}</legend>
        {toggleKeys.map((key) => (
          <button
            aria-pressed={preferences[key]}
            className="accessibility-preference-toggle"
            key={key}
            type="button"
            onClick={() => updatePreference({ [key]: !preferences[key] })}
          >
            {t(`accessibility.preferences.${key}`)}
          </button>
        ))}
      </fieldset>

      <article
        aria-label={t('accessibility.setup.previewLabel')}
        className="accessibility-setup-preview"
        data-a11y-high-contrast={effective.highContrast || undefined}
        data-a11y-large-controls={effective.largeControls || undefined}
        data-a11y-line-spacing={effective.lineSpacing || undefined}
        data-a11y-reduced-motion={effective.reduceMotion || undefined}
        data-a11y-text-size={effective.textSize}
      >
        <p>{t('accessibility.setup.previewText')}</p>
        <button className="secondary-button" type="button">{t('accessibility.setup.previewButton')}</button>
      </article>

      <div className="accessibility-communication-actions accessibility-setup-actions">
        <button className="secondary-button" type="button" onClick={() => resetAccessibilityPreferences()}>
          {t('accessibility.setup.reset')}
        </button>
        {showSkip && (
          <button className="secondary-button" type="button" onClick={onSkip}>
            {t('accessibility.setup.skip')}
          </button>
        )}
        {onFinish && (
          <button className="primary-button" type="button" onClick={onFinish}>
            {t('accessibility.setup.finish')}
          </button>
        )}
      </div>
    </section>
  )
}

export default AccessibilitySetup
