import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AccessibilityCommunication from './AccessibilityCommunication.jsx'
import AccessibilityRoutines from './AccessibilityRoutines.jsx'
import AccessibilitySetup from './AccessibilitySetup.jsx'
import {
  resetAccessibilityPreferences,
  saveAccessibilityPreferences,
  useAccessibilityPreferences,
} from '../../services/accessibilityPreferences.js'
import {
  cancelAccessibilitySpeech,
  getNavigationSpeechLabel,
  isNavigationSpeechTarget,
  speakAccessibilityText,
} from '../../services/accessibilitySpeech.js'
import AccessibilityFeedback from './AccessibilityFeedback.jsx'
import ConfirmDialog from '../a11y/ConfirmDialog.jsx'

const accessibilitySectionIds = [
  'vision',
  'hearing',
  'speech',
  'routines',
  'motor',
  'reading',
  'cognitive',
  'simple',
  'senior',
]

// A11Y-8A: only support that is genuinely not implemented yet is listed as
// "Kommer senare". Large targets (motor) and larger text, larger buttons and
// clearer contrast (senior) already work app-wide through the preferences
// above, so they are no longer presented as planned.
const plannedItemIds = {
  motor: ['fewerGestures', 'keyboard', 'switch', 'voiceControl', 'extraTime'],
  senior: ['simpleNavigation', 'readAloud', 'reminderSupport'],
}

const readingOptionIds = ['largerText', 'extraLargeText', 'clearerText', 'lineSpacing', 'simplifiedText']

function AccessibilityHub({ onOpenEar, onOpenEye }) {
  const { i18n, t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState(null)
  const [cognitiveStep, setCognitiveStep] = useState(0)
  // A11Y-8A: always the live shared preferences (the same store and hook the
  // shared AccessibilitySetup and the app root use), never a private copy
  // read once at mount. A copy could go stale after Setup saved a change and
  // then overwrite that change on the next toggle here.
  const preferences = useAccessibilityPreferences()
  const [readingOption, setReadingOption] = useState('')
  const [settingsStatus, setSettingsStatus] = useState(null)
  // A11Y-8X6: the reset asks in ConfirmDialog; the button stays, so focus
  // returns to it.
  const [confirmReset, setConfirmReset] = useState(false)
  const settingsAnnouncementRef = useRef(0)
  const [navigationSpeechStatus, setNavigationSpeechStatus] = useState(null)
  const sectionButtonRefs = useRef({})
  const returnFocusRef = useRef(null)
  const lastNavigationInputRef = useRef('pointer')
  const lastSpokenFocusRef = useRef({ element: null, time: 0 })
  const navigationSpeechRequestRef = useRef(0)

  useEffect(() => {
    if (!activeSection && returnFocusRef.current) {
      sectionButtonRefs.current[returnFocusRef.current]?.focus()
      returnFocusRef.current = null
    }
  }, [activeSection])

  useEffect(() => () => {
    cancelAccessibilitySpeech()
  }, [])

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

  // Each confirmation gets a new announcement id, so the same "saved"
  // message is announced again for every separate change.
  function announceSettingsStatus(message) {
    settingsAnnouncementRef.current += 1
    setSettingsStatus({ id: settingsAnnouncementRef.current, message })
  }

  // A11Y-8A: plain event handler, no state updater with side effects: the
  // vibration runs exactly once per change, also under React StrictMode.
  function updatePreferences(changes, { keepSeniorMode = false } = {}) {
    const next = {
      ...preferences,
      ...changes,
      seniorMode: keepSeniorMode ? Boolean(changes.seniorMode) : false,
    }
    saveAccessibilityPreferences(next)

    if (changes.hapticFeedback === true && !next.calmMode && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15)
    }

    announceSettingsStatus(t('accessibility.preferences.saved'))
  }

  function togglePreference(key) {
    updatePreferences({ [key]: !preferences[key] })
  }

  function resetPreferences() {
    setConfirmReset(true)
  }

  function resetPreferencesConfirmed() {
    setConfirmReset(false)
    resetAccessibilityPreferences()
    announceSettingsStatus(t('accessibility.preferences.resetDone'))
  }

  function openSection(sectionId) {
    setSettingsStatus(null)
    setActiveSection(sectionId)
  }

  function returnToAccessibilityHub() {
    cancelAccessibilitySpeech()
    navigationSpeechRequestRef.current += 1
    returnFocusRef.current = activeSection
    setSettingsStatus(null)
    setActiveSection(null)
    setCognitiveStep(0)
    setReadingOption('')
  }

  function handleNavigationKeyDown(event) {
    if (['Tab', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      lastNavigationInputRef.current = 'keyboard'
    }
  }

  function handleNavigationFocus(event) {
    if (!preferences.navigationSpeech || lastNavigationInputRef.current !== 'keyboard') return
    const target = event.target
    if (!isNavigationSpeechTarget(target)) return

    const now = Date.now()
    if (lastSpokenFocusRef.current.element === target && now - lastSpokenFocusRef.current.time < 800) return

    const label = getNavigationSpeechLabel(target, {
      fallback: t('accessibility.navigationSpeech.genericControl'),
      states: {
        checked: t('accessibility.navigationSpeech.states.checked'),
        collapsed: t('accessibility.navigationSpeech.states.collapsed'),
        disabled: t('accessibility.navigationSpeech.states.disabled'),
        expanded: t('accessibility.navigationSpeech.states.expanded'),
        input: t('accessibility.navigationSpeech.states.input'),
        notPressed: t('accessibility.navigationSpeech.states.notPressed'),
        notSelected: t('accessibility.navigationSpeech.states.notSelected'),
        password: t('accessibility.navigationSpeech.states.password'),
        pressed: t('accessibility.navigationSpeech.states.pressed'),
        selected: t('accessibility.navigationSpeech.states.selected'),
        unchecked: t('accessibility.navigationSpeech.states.unchecked'),
      },
    })
    if (!label) return

    lastSpokenFocusRef.current = { element: target, time: now }
    const requestId = navigationSpeechRequestRef.current + 1
    navigationSpeechRequestRef.current = requestId
    function setNavigationFeedback(message, tone = 'info') {
      setNavigationSpeechStatus((current) => (
        current?.message === message && current.tone === tone ? current : { message, tone }
      ))
    }
    const didSpeak = speakAccessibilityText({
      language: i18n.language,
      rate: preferences.navigationSpeechRate,
      text: label,
      onEnd: () => {
        if (navigationSpeechRequestRef.current === requestId) setNavigationFeedback(t('accessibility.navigationSpeech.complete'), 'success')
      },
      onError: () => {
        if (navigationSpeechRequestRef.current === requestId) setNavigationFeedback(t('accessibility.navigationSpeech.error'), 'error')
      },
    })
    setNavigationFeedback(
      didSpeak ? t('accessibility.navigationSpeech.speaking') : t('accessibility.navigationSpeech.unsupported'),
      didSpeak ? 'info' : 'error',
    )
  }

  // Static label (not a live status): it describes the list, it is not an
  // event the user needs to be told about.
  function renderPlannedItems(sectionId) {
    const labelId = `accessibility-planned-${sectionId}`
    return (
      <>
        <p className="accessibility-status" id={labelId}>{t('accessibility.comingLater')}</p>
        <ul aria-labelledby={labelId} className="accessibility-planned-list">
          {plannedItemIds[sectionId].map((itemId) => (
            <li key={itemId}>{t(`accessibility.sections.${sectionId}.items.${itemId}`)}</li>
          ))}
        </ul>
      </>
    )
  }

  function renderSettingsStatus() {
    return (
      <AccessibilityFeedback
        announcementId={settingsStatus?.id}
        message={settingsStatus?.message}
        tone="success"
      />
    )
  }

  if (activeSection === 'setup') {
    return (
      <article
        className={['accessibility-detail', scopeClassName].filter(Boolean).join(' ')}
        onFocusCapture={handleNavigationFocus}
        onKeyDownCapture={handleNavigationKeyDown}
        onPointerDownCapture={() => {
          lastNavigationInputRef.current = 'pointer'
        }}
      >
        <button
          className="more-hub-back"
          type="button"
          onClick={returnToAccessibilityHub}
        >
          ← {t('accessibility.backToHub')}
        </button>
        <AccessibilitySetup onFinish={returnToAccessibilityHub} />
      </article>
    )
  }

  if (activeSection === 'routines') {
    return (
      <article
        className={['accessibility-detail', scopeClassName].filter(Boolean).join(' ')}
        onFocusCapture={handleNavigationFocus}
        onKeyDownCapture={handleNavigationKeyDown}
        onPointerDownCapture={() => {
          lastNavigationInputRef.current = 'pointer'
        }}
      >
        <button
          className="more-hub-back"
          type="button"
          onClick={returnToAccessibilityHub}
        >
          ← {t('accessibility.backToHub')}
        </button>
        <AccessibilityRoutines />
      </article>
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
      <article
        className={detailClassName}
        onFocusCapture={handleNavigationFocus}
        onKeyDownCapture={handleNavigationKeyDown}
        onPointerDownCapture={() => {
          lastNavigationInputRef.current = 'pointer'
        }}
      >
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
            <div className="accessibility-option-grid" aria-label={t('accessibility.readingOptionsLabel')} role="group">
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
        {renderSettingsStatus()}
      </article>
    )
  }

  return (
    <section
      className={`accessibility-hub ${scopeClassName}`}
      aria-label={t('accessibility.title')}
      onFocusCapture={handleNavigationFocus}
      onKeyDownCapture={handleNavigationKeyDown}
      onPointerDownCapture={() => {
        lastNavigationInputRef.current = 'pointer'
      }}
    >
      <p className="accessibility-intro">{t('accessibility.intro')}</p>
      <button
        className="primary-button accessibility-setup-trigger"
        ref={(node) => {
          sectionButtonRefs.current.setup = node
        }}
        type="button"
        onClick={() => openSection('setup')}
      >
        {t('accessibility.setup.title')}
      </button>
      <fieldset className="accessibility-preference-group">
        <legend>{t('accessibility.navigationSpeech.legend')}</legend>
        <button
          aria-pressed={preferences.navigationSpeech}
          className="accessibility-preference-toggle"
          type="button"
          onClick={() => updatePreferences({ navigationSpeech: !preferences.navigationSpeech })}
        >
          {t('accessibility.navigationSpeech.toggle')}
        </button>
        <div className="accessibility-option-grid" aria-label={t('accessibility.navigationSpeech.rateLegend')} role="group">
          {['slow', 'normal', 'fast'].map((rate) => (
            <button
              aria-pressed={preferences.navigationSpeechRate === rate}
              className="accessibility-option-card"
              key={rate}
              type="button"
              onClick={() => updatePreferences({ navigationSpeechRate: rate })}
            >
              {t(`accessibility.navigationSpeech.rates.${rate}`)}
            </button>
          ))}
        </div>
        <p className="accessibility-preference-note">{t('accessibility.navigationSpeech.note')}</p>
      </fieldset>
      <AccessibilityFeedback message={navigationSpeechStatus?.message} tone={navigationSpeechStatus?.tone} />
      <nav className="accessibility-section-list" aria-label={t('accessibility.sectionListLabel')}>
        {accessibilitySectionIds.map((id) => {
          const sectionKey = `accessibility.sections.${id}`
          return (
            <button
              className="accessibility-section-card"
              key={id}
              ref={(node) => {
                sectionButtonRefs.current[id] = node
              }}
              type="button"
              onClick={() => openSection(id)}
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
        <p className="accessibility-status">{t('accessibility.comingLater')}</p>
      </article>
      <button className="secondary-button accessibility-reset-button" type="button" onClick={resetPreferences}>
        {t('accessibility.preferences.reset')}
      </button>
      {confirmReset && (
        <ConfirmDialog
          confirmLabel={t('accessibility.preferences.resetAction')}
          description={t('accessibility.preferences.resetConfirm')}
          title={t('accessibility.preferences.reset')}
          onCancel={() => setConfirmReset(false)}
          onConfirm={resetPreferencesConfirmed}
        />
      )}
      {renderSettingsStatus()}
    </section>
  )
}

export default AccessibilityHub
