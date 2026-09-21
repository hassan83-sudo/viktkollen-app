import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AccessibilityCommunication from './AccessibilityCommunication.jsx'
import {
  defaultAccessibilityPreferences,
  readAccessibilityPreferences,
  resetAccessibilityPreferences,
  saveAccessibilityPreferences,
} from '../../services/accessibilityPreferences.js'

const accessibilitySectionIds = [
  'vision',
  'hearing',
  'speech',
  'motor',
  'reading',
  'cognitive',
  'simple',
  'senior',
]

const plannedItemIds = {
  motor: ['largeTargets', 'fewerGestures', 'keyboard', 'switch', 'voiceControl', 'extraTime'],
  senior: ['largeText', 'largeButtons', 'simpleNavigation', 'readAloud', 'clearContrast', 'reminderSupport'],
}

const readingOptionIds = ['largerText', 'extraLargeText', 'clearerText', 'lineSpacing', 'simplifiedText']

function AccessibilityHub({ onOpenEar, onOpenEye }) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState(null)
  const [cognitiveStep, setCognitiveStep] = useState(0)
  const [preferences, setPreferences] = useState(() => readAccessibilityPreferences().preferences)
  const [readingOption, setReadingOption] = useState('')
  const [settingsStatus, setSettingsStatus] = useState('')

  const scopeClassName = [
    'accessibility-scope',
    `is-text-${preferences.seniorMode ? 'extra-large' : preferences.textSize}`,
    (preferences.seniorMode || preferences.lineSpacing) && 'has-line-spacing',
    (preferences.seniorMode || preferences.highContrast) && 'has-high-contrast',
    (preferences.seniorMode || preferences.reduceMotion) && 'has-reduced-motion',
    (preferences.seniorMode || preferences.largeControls) && 'has-large-controls',
    (preferences.seniorMode || preferences.simpleReading) && 'has-simple-reading',
    preferences.calmMode && 'has-calm-mode',
    preferences.visualFeedback && 'has-visual-feedback',
    preferences.keyboardFriendly && 'has-keyboard-friendly',
    preferences.avoidPreciseGestures && 'avoids-precise-gestures',
  ].filter(Boolean).join(' ')

  function updatePreferences(changes, { keepSeniorMode = false } = {}) {
    setPreferences((current) => {
      const next = {
        ...current,
        ...changes,
        seniorMode: keepSeniorMode ? Boolean(changes.seniorMode) : false,
      }
      saveAccessibilityPreferences(next)

      if (changes.hapticFeedback === true && !next.calmMode && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15)
      }

      return next
    })
    setSettingsStatus(t('accessibility.preferences.saved'))
  }

  function togglePreference(key) {
    updatePreferences({ [key]: !preferences[key] })
  }

  function resetPreferences() {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('accessibility.preferences.resetConfirm'))) {
      return
    }

    resetAccessibilityPreferences()
    setPreferences({ ...defaultAccessibilityPreferences })
    setSettingsStatus(t('accessibility.preferences.resetDone'))
  }

  function returnToAccessibilityHub() {
    setActiveSection(null)
    setCognitiveStep(0)
    setReadingOption('')
  }

  function renderPlannedItems(sectionId) {
    return (
      <ul className="accessibility-planned-list">
        {plannedItemIds[sectionId].map((itemId) => (
          <li key={itemId}>{t(`accessibility.sections.${sectionId}.items.${itemId}`)}</li>
        ))}
      </ul>
    )
  }

  if (activeSection) {
    const sectionKey = `accessibility.sections.${activeSection}`
    const detailClassName = [
      'accessibility-detail',
      activeSection === 'reading' && readingOption ? `is-reading-${readingOption}` : '',
      activeSection === 'simple' && preferences.calmMode ? 'is-simple-preview' : '',
      scopeClassName,
    ].filter(Boolean).join(' ')

    return (
      <article className={detailClassName}>
        <button
          className="more-hub-back"
          type="button"
          onClick={returnToAccessibilityHub}
        >
          ← {t('accessibility.backToHub')}
        </button>
        <p className="eyebrow">{t('accessibility.eyebrow')}</p>
        <h2>{t(`${sectionKey}.title`)}</h2>
        <p>{t(`${sectionKey}.description`)}</p>
        {activeSection === 'vision' && (
          <>
            <button className="primary-button" type="button" onClick={onOpenEye}>
              {t('accessibility.openEye')}
            </button>
            <fieldset className="accessibility-preference-group">
              <legend>{t('accessibility.preferences.displayLegend')}</legend>
              {['highContrast', 'reduceMotion', 'visualFeedback'].map((key) => (
                <button aria-pressed={preferences[key]} className="accessibility-preference-toggle" key={key} type="button" onClick={() => togglePreference(key)}>
                  {t(`accessibility.preferences.${key}`)}
                </button>
              ))}
            </fieldset>
          </>
        )}
        {activeSection === 'hearing' && (
          <>
            <button className="primary-button" type="button" onClick={onOpenEar}>
              {t('accessibility.openEar')}
            </button>
            <p className="accessibility-preference-note">{t('accessibility.preferences.soundNotOnlySignal')}</p>
            <fieldset className="accessibility-preference-group">
              <legend>{t('accessibility.preferences.feedbackLegend')}</legend>
              {['visualFeedback', 'hapticFeedback'].map((key) => (
                <button aria-pressed={preferences[key]} className="accessibility-preference-toggle" key={key} type="button" onClick={() => togglePreference(key)}>
                  {t(`accessibility.preferences.${key}`)}
                </button>
              ))}
            </fieldset>
          </>
        )}
        {activeSection === 'motor' && (
          <fieldset className="accessibility-preference-group">
            <legend>{t('accessibility.preferences.motorLegend')}</legend>
            {['largeControls', 'visualFeedback', 'avoidPreciseGestures', 'extraInteractionTime', 'keyboardFriendly'].map((key) => (
              <button aria-pressed={preferences[key]} className="accessibility-preference-toggle" key={key} type="button" onClick={() => togglePreference(key)}>
                {t(`accessibility.preferences.${key}`)}
              </button>
            ))}
          </fieldset>
        )}
        {activeSection === 'reading' && (
          <>
            <div className="accessibility-option-grid" aria-label={t('accessibility.readingOptionsLabel')}>
              {readingOptionIds.map((optionId) => (
                <button
                  aria-pressed={readingOption === optionId}
                  className="accessibility-option-card"
                  key={optionId}
                  type="button"
                  onClick={() => setReadingOption((current) => current === optionId ? '' : optionId)}
                >
                  {t(`${sectionKey}.items.${optionId}`)}
                </button>
              ))}
            </div>
            <fieldset className="accessibility-preference-group">
              <legend>{t('accessibility.preferences.readingLegend')}</legend>
              {['normal', 'large', 'extra-large'].map((size) => (
                <button
                  aria-pressed={preferences.textSize === size && !preferences.seniorMode}
                  className="accessibility-preference-toggle"
                  key={size}
                  type="button"
                  onClick={() => updatePreferences({ textSize: size })}
                >
                  {t(`accessibility.preferences.textSize.${size}`)}
                </button>
              ))}
              {['lineSpacing', 'simpleReading'].map((key) => (
                <button aria-pressed={preferences[key]} className="accessibility-preference-toggle" key={key} type="button" onClick={() => togglePreference(key)}>
                  {t(`accessibility.preferences.${key}`)}
                </button>
              ))}
            </fieldset>
            <article className="accessibility-preview-card">
              <h3>{t('accessibility.readingPreviewTitle')}</h3>
              <p>{readingOption === 'simplifiedText' ? t('accessibility.readingSimplePreview') : t('accessibility.readingPreview')}</p>
            </article>
            <article className="accessibility-planned-card">
              <h3>{t(`${sectionKey}.items.readAloud`)}</h3>
              <p>{t('accessibility.readAloudNote')}</p>
            </article>
          </>
        )}
        {activeSection === 'cognitive' && (
          <>
            <ul className="accessibility-planned-list">
              {['shortInstructions', 'stepByStep', 'fewerChoices', 'clearConfirmations', 'memorySupport', 'predictableNavigation', 'pictureSupport'].map((itemId) => (
                <li key={itemId}>{t(`${sectionKey}.items.${itemId}`)}</li>
              ))}
            </ul>
            <article className="accessibility-preview-card">
              <h3>{t('accessibility.cognitiveExampleTitle')}</h3>
              <ol>
                <li>{t(`accessibility.cognitiveExample.steps.${cognitiveStep}`)}</li>
              </ol>
              <div className="accessibility-communication-actions">
                {cognitiveStep > 0 && <button className="secondary-button" type="button" onClick={() => setCognitiveStep((current) => current - 1)}>{t('accessibility.preferences.back')}</button>}
                {cognitiveStep < 2
                  ? <button className="primary-button" type="button" onClick={() => setCognitiveStep((current) => current + 1)}>{t('accessibility.preferences.next')}</button>
                  : <button className="primary-button" type="button" onClick={() => setCognitiveStep(0)}>{t('accessibility.preferences.finish')}</button>}
                <button className="secondary-button" type="button" onClick={() => setCognitiveStep(0)}>{t('accessibility.preferences.resetStep')}</button>
              </div>
            </article>
            <article className="accessibility-planned-card">
              <h3>{t('accessibility.preferences.remindWhere')}</h3>
              <p>{t('accessibility.preferences.remindWhereNote')}</p>
            </article>
          </>
        )}
        {activeSection === 'simple' && (
          <>
            <button
              aria-pressed={preferences.calmMode}
              className="primary-button"
              type="button"
              onClick={() => togglePreference('calmMode')}
            >
              {preferences.calmMode ? t('accessibility.endSimplePreview') : t('accessibility.previewSimpleMode')}
            </button>
            {preferences.calmMode && (
              <article className="accessibility-simple-preview" aria-live="polite">
                <p>{t('accessibility.simplePreviewIntro')}</p>
                <ul>
                  {['largeButtons', 'shortTexts', 'fewerChoices', 'clearSymbols', 'oneStep', 'calmerUi'].map((itemId) => (
                    <li key={itemId}>{t(`accessibility.simplePreviewItems.${itemId}`)}</li>
                  ))}
                </ul>
              </article>
            )}
          </>
        )}
        {activeSection === 'senior' && (
          <>
            <button
              aria-pressed={preferences.seniorMode}
              className="primary-button"
              type="button"
              onClick={() => updatePreferences({ seniorMode: !preferences.seniorMode }, { keepSeniorMode: true })}
            >
              {preferences.seniorMode ? t('accessibility.preferences.seniorModeOn') : t('accessibility.preferences.seniorMode')}
            </button>
            <p className="accessibility-preference-note">
              {preferences.seniorMode ? t('accessibility.preferences.seniorPackageActive') : t('accessibility.preferences.seniorPackageNote')}
            </p>
            <fieldset className="accessibility-preference-group">
              <legend>{t('accessibility.preferences.seniorLegend')}</legend>
              <button
                aria-pressed={preferences.textSize === 'large' && !preferences.seniorMode}
                className="accessibility-preference-toggle"
                type="button"
                onClick={() => updatePreferences({ textSize: 'large' })}
              >
                {t('accessibility.preferences.largerText')}
              </button>
              {['largeControls', 'highContrast', 'reduceMotion', 'simpleReading'].map((key) => (
                <button aria-pressed={preferences[key] || preferences.seniorMode} className="accessibility-preference-toggle" key={key} type="button" onClick={() => togglePreference(key)}>
                  {t(`accessibility.preferences.${key}`)}
                </button>
              ))}
            </fieldset>
          </>
        )}
        {activeSection === 'speech' && <AccessibilityCommunication />}
        {plannedItemIds[activeSection] && renderPlannedItems(activeSection)}
        <p className="accessibility-status" role="status">
          {t('accessibility.comingLater')}
        </p>
      </article>
    )
  }

  return (
    <section className={`accessibility-hub ${scopeClassName}`} aria-label={t('accessibility.title')}>
      <p className="accessibility-intro">{t('accessibility.intro')}</p>
      <nav className="accessibility-section-list" aria-label={t('accessibility.sectionListLabel')}>
        {accessibilitySectionIds.map((id) => {
          const sectionKey = `accessibility.sections.${id}`
          return (
            <button
              className="accessibility-section-card"
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
            >
              <span>
                <strong>{t(`${sectionKey}.title`)}</strong>
                <small>{t(`${sectionKey}.summary`)}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          )
        })}
      </nav>
      <article className="accessibility-future-item">
        <h2>{t('accessibility.focusNarration.title')}</h2>
        <p>{t('accessibility.focusNarration.description')}</p>
        <p className="accessibility-status" role="status">{t('accessibility.comingLater')}</p>
      </article>
      <button className="secondary-button accessibility-reset-button" type="button" onClick={resetPreferences}>
        {t('accessibility.preferences.reset')}
      </button>
      {settingsStatus && <p className="accessibility-settings-status" role="status">{settingsStatus}</p>}
    </section>
  )
}

export default AccessibilityHub
