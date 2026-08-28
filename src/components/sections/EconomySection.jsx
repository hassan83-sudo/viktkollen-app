import { useTranslation } from 'react-i18next'
import AppSection from '../app/AppSection.jsx'
import EconomyCenter from '../../features/economy/EconomyCenter.jsx'

function EconomySection({ activeSection, onCreateReminderDraft }) {
  const { t } = useTranslation('economy')
  return (
    <AppSection activeSection={activeSection} id="economy" label={t('sectionLabel')}>
      <EconomyCenter onCreateReminderDraft={onCreateReminderDraft} />
    </AppSection>
  )
}

export default EconomySection
