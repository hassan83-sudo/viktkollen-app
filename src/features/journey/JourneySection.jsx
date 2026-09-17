import { useTranslation } from 'react-i18next'
import AppSection from '../../components/app/AppSection.jsx'

function JourneySection({ activeSection }) {
  const { t } = useTranslation('journey')

  return (
    <AppSection activeSection={activeSection} id="journey" label={t('sectionLabel')}>
      <div className="journey-section">
        <header className="journey-heading panel">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </header>
      </div>
    </AppSection>
  )
}

export default JourneySection
