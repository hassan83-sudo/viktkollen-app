import AppSection from '../app/AppSection.jsx'
import WellbeingCenter from '../../features/wellbeing/WellbeingCenter.jsx'
import { useTranslation } from 'react-i18next'

function WellbeingSection({ activeSection, profile }) {
  const { t } = useTranslation('wellbeing')

  return (
    <AppSection activeSection={activeSection} id="wellbeing" label={t('sectionLabel')}>
      <WellbeingCenter profile={profile} />
    </AppSection>
  )
}

export default WellbeingSection
