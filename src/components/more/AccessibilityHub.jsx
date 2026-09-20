import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  speech: ['textToSpeech', 'tapPhrases', 'pictureSupport', 'writeToAi', 'communicationCards'],
}

const readingOptionIds = ['largerText', 'extraLargeText', 'clearerText', 'lineSpacing', 'simplifiedText']

function AccessibilityHub({ onOpenEar, onOpenEye }) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState(null)
  const [readingOption, setReadingOption] = useState('')
  const [simplePreview, setSimplePreview] = useState(false)

  function returnToAccessibilityHub() {
    setActiveSection(null)
    setReadingOption('')
    setSimplePreview(false)
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
      activeSection === 'simple' && simplePreview ? 'is-simple-preview' : '',
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
          <button className="primary-button" type="button" onClick={onOpenEye}>
            {t('accessibility.openEye')}
          </button>
        )}
        {activeSection === 'hearing' && (
          <button className="primary-button" type="button" onClick={onOpenEar}>
            {t('accessibility.openEar')}
          </button>
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
                <li>{t('accessibility.cognitiveExample.first')}</li>
                <li>{t('accessibility.cognitiveExample.second')}</li>
                <li>{t('accessibility.cognitiveExample.third')}</li>
              </ol>
            </article>
          </>
        )}
        {activeSection === 'simple' && (
          <>
            <button
              aria-pressed={simplePreview}
              className="primary-button"
              type="button"
              onClick={() => setSimplePreview((current) => !current)}
            >
              {simplePreview ? t('accessibility.endSimplePreview') : t('accessibility.previewSimpleMode')}
            </button>
            {simplePreview && (
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
        {plannedItemIds[activeSection] && renderPlannedItems(activeSection)}
        <p className="accessibility-status" role="status">
          {t('accessibility.comingLater')}
        </p>
      </article>
    )
  }

  return (
    <section className="accessibility-hub" aria-label={t('accessibility.title')}>
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
    </section>
  )
}

export default AccessibilityHub
