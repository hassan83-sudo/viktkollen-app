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

function AccessibilityHub({ onOpenEar, onOpenEye }) {
  const { t } = useTranslation('settings')
  const [activeSection, setActiveSection] = useState(null)

  if (activeSection) {
    const sectionKey = `accessibility.sections.${activeSection}`
    return (
      <article className="accessibility-detail">
        <button
          className="more-hub-back"
          type="button"
          onClick={() => setActiveSection(null)}
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
    </section>
  )
}

export default AccessibilityHub
