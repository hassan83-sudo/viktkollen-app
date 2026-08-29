import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import EducationMediaCard from './EducationMediaCard.jsx'
import { pregnancyMediaSeeds } from './learningMediaModel.js'

const sections = [
  'pregnancy',
  'birth',
  'months03',
  'months46',
  'months79',
  'months1012',
  'parent',
  'care',
]

const timeline = ['trimester1', 'trimester2', 'trimester3', 'birthPrep']
const firstYearAreas = ['sleep', 'feeding', 'bonding', 'movement', 'senses', 'communication', 'play', 'safety', 'bvc']
const addressOptions = ['pregnantPerson', 'mother', 'parent', 'partner']

function PregnancyFirstYearSection() {
  const { t } = useTranslation('education')
  const [address, setAddress] = useState('parent')

  return (
    <div className="education-center pregnancy-center" id="pregnancy-first-year">
      <header className="education-hero">
        <p className="eyebrow">{t('pregnancyFirstYear.eyebrow')}</p>
        <h1>{t('pregnancyFirstYear.title')}</h1>
        <p>{t('pregnancyFirstYear.subtitle')}</p>
      </header>

      <section className="education-panel" aria-labelledby="pregnancy-address-title">
        <h2 id="pregnancy-address-title">{t('pregnancyFirstYear.address.title')}</h2>
        <label>
          {t('pregnancyFirstYear.address.label')}
          <select value={address} onChange={(event) => setAddress(event.target.value)}>
            {addressOptions.map((option) => <option value={option} key={option}>{t(`pregnancyFirstYear.address.options.${option}`)}</option>)}
          </select>
        </label>
        <p>{t('pregnancyFirstYear.address.current', { value: t(`pregnancyFirstYear.address.options.${address}`) })}</p>
      </section>

      <section className="education-panel" aria-labelledby="pregnancy-parts-title">
        <h2 id="pregnancy-parts-title">{t('pregnancyFirstYear.partsTitle')}</h2>
        <div className="education-card-grid">
          {sections.map((section) => (
            <article className="education-mini-card" key={section}>
              <h3>{t(`pregnancyFirstYear.parts.${section}`)}</h3>
              <p>{t('pregnancyFirstYear.empty')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="education-panel" aria-labelledby="pregnancy-timeline-title">
        <h2 id="pregnancy-timeline-title">{t('pregnancyFirstYear.timeline.title')}</h2>
        <ol className="education-list">
          {timeline.map((entry) => <li key={entry}>{t(`pregnancyFirstYear.timeline.${entry}`)}</li>)}
        </ol>
      </section>

      <section className="education-panel" aria-labelledby="first-year-title">
        <h2 id="first-year-title">{t('pregnancyFirstYear.firstYear.title')}</h2>
        <ul className="education-tag-list">
          {firstYearAreas.map((area) => <li key={area}>{t(`pregnancyFirstYear.firstYear.areas.${area}`)}</li>)}
        </ul>
      </section>

      <section className="education-panel" aria-labelledby="pregnancy-media-title">
        <h2 id="pregnancy-media-title">{t('pregnancyFirstYear.mediaTitle')}</h2>
        <div className="education-media-grid">
          {pregnancyMediaSeeds.map((item) => <EducationMediaCard item={item} key={item.id} />)}
        </div>
      </section>

      <section className="education-panel education-urgent" aria-labelledby="pregnancy-care-title">
        <h2 id="pregnancy-care-title">{t('pregnancyFirstYear.care.title')}</h2>
        <p>{t('pregnancyFirstYear.care.body')}</p>
        <a className="primary-button" href="tel:112">{t('pregnancyFirstYear.care.emergency')}</a>
      </section>

      <section className="education-panel" aria-labelledby="pregnancy-guide-title">
        <h2 id="pregnancy-guide-title">{t('pregnancyFirstYear.guide.title')}</h2>
        <p>{t('pregnancyFirstYear.guide.placeholder')}</p>
        <p className="education-safety-note">{t('pregnancyFirstYear.medicalPolicy')}</p>
      </section>
    </div>
  )
}

export default PregnancyFirstYearSection
