import AppSection from '../app/AppSection.jsx'
import NoticeHub from '../NoticeHub.jsx'

function NoticesSection({ activeSection, onRemindersChange, reminderState, t }) {
  return (
    <AppSection activeSection={activeSection} id="notices" label={t('sections.notices.aria')}>
      <NoticeHub onRemindersChange={onRemindersChange} reminderState={reminderState} />
    </AppSection>
  )
}

export default NoticesSection
