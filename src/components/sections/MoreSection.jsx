import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CloudBackupPanel from '../CloudBackupPanel.jsx'
import NotificationCenter from '../NotificationCenter.jsx'
import ReminderCenter from '../ReminderCenter.jsx'
import ReminderSettings from '../ReminderSettings.jsx'
import AppSection from '../app/AppSection.jsx'

function MoreSection({
  activeSection,
  adaptiveCoachFeedback,
  authLoading,
  checkIn,
  email,
  goalsHabits,
  healthSnapshot,
  isAuthenticated,
  meals,
  nutritionGoals,
  onDataRestored,
  onEditProfile,
  onReminderSettingChange,
  onReminderStateChange,
  onRequestNotificationPermission,
  onSignOut,
  reminderOptions,
  reminderSettings,
  reminderState,
  reminderStatus,
  schedulerStatus,
  selectedMealDate,
  syncStatus,
  userId,
  profile,
  weights,
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
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          onReminderStateChange={onReminderStateChange}
          profile={profile}
          reminderState={reminderState}
          syncStatus={syncStatus}
          today={selectedMealDate}
          weights={weights}
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

      <article className="panel account-settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Konto</p>
            <h2>Profil och konto</h2>
          </div>
        </div>

        <p className="account-email">
          Inloggad som <strong>{email || 'okänd e-post'}</strong>
        </p>

        <div className="account-settings-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onEditProfile}
          >
            Ändra profil
          </button>

          <button
            className="secondary-button account-signout-button"
            type="button"
            onClick={onSignOut}
            disabled={authLoading}
          >
            {authLoading ? 'Loggar ut…' : 'Logga ut'}
          </button>
        </div>

        <div className="app-information">
          <h3>Om Viktkollen</h3>
          <p>
            Viktkollen ger allmänt stöd för hälsa och välmående. Informationen
            är inte medicinsk rådgivning, diagnos eller behandling.
          </p>
        </div>
      </article>
    </AppSection>
  )
}

export default MoreSection
