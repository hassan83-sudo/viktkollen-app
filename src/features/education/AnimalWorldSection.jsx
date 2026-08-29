import { useTranslation } from 'react-i18next'
import EducationMediaCard from './EducationMediaCard.jsx'
import { animalWorldMediaSeeds } from './learningMediaModel.js'

const categories = [
  'familyLife',
  'unusualAnimals',
  'insects',
  'seas',
  'birds',
  'survivors',
]

const examples = [
  'gulls',
  'penguins',
  'octopus',
  'axolotl',
  'mantisShrimp',
  'tardigrades',
  'leafcutterAnts',
  'orchidMantis',
  'deepSea',
  'familyCooperation',
]

function AnimalWorldSection() {
  const { t } = useTranslation('education')

  return (
    <div className="education-center animal-world-center" id="animal-world">
      <header className="education-hero">
        <p className="eyebrow">{t('animalWorld.eyebrow')}</p>
        <h1>{t('animalWorld.title')}</h1>
        <p>{t('animalWorld.subtitle')}</p>
      </header>

      <section className="education-panel" aria-labelledby="animal-world-categories-title">
        <h2 id="animal-world-categories-title">{t('animalWorld.categoriesTitle')}</h2>
        <div className="education-card-grid">
          {categories.map((category) => (
            <article className="education-mini-card" key={category}>
              <h3>{t(`animalWorld.categories.${category}`)}</h3>
              <p>{t('animalWorld.categoryPlaceholder')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="education-panel" aria-labelledby="animal-world-examples-title">
        <h2 id="animal-world-examples-title">{t('animalWorld.examplesTitle')}</h2>
        <ul className="education-tag-list">
          {examples.map((example) => <li key={example}>{t(`animalWorld.futureExamples.${example}`)}</li>)}
        </ul>
      </section>

      <section className="education-panel" aria-labelledby="animal-world-media-title">
        <h2 id="animal-world-media-title">{t('animalWorld.mediaTitle')}</h2>
        <div className="education-media-grid">
          {animalWorldMediaSeeds.map((item) => <EducationMediaCard item={item} key={item.id} />)}
        </div>
        <p className="education-safety-note">{t('animalWorld.aiPolicy')}</p>
      </section>

      <section className="education-panel" aria-labelledby="animal-world-guide-title">
        <h2 id="animal-world-guide-title">{t('animalWorld.guide.title')}</h2>
        <p>{t('animalWorld.guide.placeholder')}</p>
      </section>
    </div>
  )
}

export default AnimalWorldSection
