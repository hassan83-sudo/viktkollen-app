import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CloudBackupPanel from '../CloudBackupPanel.jsx'
import NotificationCenter from '../NotificationCenter.jsx'
import ReminderCenter from '../ReminderCenter.jsx'
import ReminderSettings from '../ReminderSettings.jsx'
import AppSection from '../app/AppSection.jsx'

function MoreSection({
  activeSection,
  adaptiveCoachFeedback,
  goalsHabits,
  isAuthenticated,
  onDataRestored,
  onReminderSettingChange,
  onReminderStateChange,
  onRequestNotificationPermission,
  reminderOptions,
  reminderSettings,
  reminderState,
  reminderStatus,
  schedulerStatus,
  syncStatus,
  userId,
}) {
  return (
    <AppSection
      activeSection={activeSection}
      id="more"
      label="Fler funktioner och inställningar"
    >
      <ReminderSettings
        onReminderSettingChange={onReminderSettingChange}
        onRequestNotificationPermission={onRequestNotificationPermission}
        reminderOptions={reminderOptions}
        reminderSettings={reminderSettings}
        reminderStatus={reminderStatus}
      />

      <AppErrorBoundary
        area="reminders"
        resetKey={reminderState.updatedAt}
        title="Reminder Center kunde inte visas"
      >
        <ReminderCenter
          goalsHabits={goalsHabits}
          onRemindersChange={onReminderStateChange}
          reminderState={reminderState}
          schedulerStatus={schedulerStatus}
        />
      </AppErrorBoundary>

      <AppErrorBoundary
        area="notifications"
        resetKey={reminderState.updatedAt}
        title="Notification Center kunde inte visas"
      >
        <NotificationCenter
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          onReminderStateChange={onReminderStateChange}
          reminderState={reminderState}
          syncStatus={syncStatus}
        />
      </AppErrorBoundary>

      <AppErrorBoundary
        area="cloud"
        resetKey={userId}
        title="Molnbackup kunde inte visas"
      >
        <CloudBackupPanel
          isAuthenticated={isAuthenticated}
          onDataRestored={onDataRestored}
        />
      </AppErrorBoundary>
    </AppSection>
  )
}

export default MoreSection
