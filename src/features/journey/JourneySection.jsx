import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../../components/AppErrorBoundary.jsx'
import AppSection from '../../components/app/AppSection.jsx'

const journeyTabIds = ['overview', 'progress', 'nutrition']

function JourneySection({
  activeSection,
  NutritionSectionComponent,
  nutritionSectionProps,
  ProgressSectionComponent,
  progressSectionProps,
}) {
  const { t } = useTranslation('journey')
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <AppSection activeSection={activeSection} id="journey" label={t('sectionLabel')}>
      <div className="journey-section">
        <header className="journey-heading panel">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </header>

        <div className="segmented-control journey-tabs" aria-label={t('tabsAriaLabel')}>
          {journeyTabIds.map((tabId) => (
            <button
              key={tabId}
              type="button"
              className={activeTab === tabId ? 'active' : ''}
              onClick={() => setActiveTab(tabId)}
            >
              {t(`tabs.${tabId}`)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="journey-overview panel">
            <p>{t('overviewPlaceholder')}</p>
          </div>
        )}

        {activeTab === 'progress' && ProgressSectionComponent && (
          <AppErrorBoundary area="progress" title={t('progressError')}>
            <ProgressSectionComponent {...progressSectionProps} activeSection="progress" />
          </AppErrorBoundary>
        )}

        {activeTab === 'nutrition' && NutritionSectionComponent && (
          <AppErrorBoundary area="nutrition" title={t('nutritionError')}>
            <NutritionSectionComponent {...nutritionSectionProps} activeSection="nutrition" />
          </AppErrorBoundary>
        )}
      </div>
    </AppSection>
  )
}

export default JourneySection
