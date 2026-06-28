function ReminderMasterControls({
  onReminderSettingChange,
  onRequestNotificationPermission,
  remindersEnabled,
}) {
  return (
    <div className="reminder-master">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={remindersEnabled}
          onChange={(event) =>
            onReminderSettingChange('enabled', event.target.checked)
          }
        />
        <span>Aktivera påminnelser</span>
      </label>
      <button
        className="secondary-button"
        type="button"
        onClick={onRequestNotificationPermission}
      >
        Tillåt notiser
      </button>
    </div>
  )
}

export default ReminderMasterControls
