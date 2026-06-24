function ReminderSettings({
  onReminderSettingChange,
  onRequestNotificationPermission,
  reminderOptions,
  reminderSettings,
  reminderStatus,
}) {
  return (
    <article className="panel settings-panel" id="installningar">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Inställningar</p>
          <h2>Dagliga påminnelser</h2>
        </div>
      </div>

      <div className="reminder-master">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={reminderSettings.enabled}
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
      {reminderStatus && <p className="analysis-status">{reminderStatus}</p>}

      <div className="reminder-list">
        {reminderOptions.map((reminder) => (
          <div className="reminder-row" key={reminder.enabledKey}>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={reminderSettings[reminder.enabledKey]}
                onChange={(event) =>
                  onReminderSettingChange(
                    reminder.enabledKey,
                    event.target.checked,
                  )
                }
              />
              <span>{reminder.label}</span>
            </label>
            <input
              type="time"
              value={reminderSettings[reminder.timeKey]}
              onChange={(event) =>
                onReminderSettingChange(reminder.timeKey, event.target.value)
              }
            />
          </div>
        ))}
      </div>
      <p className="settings-note">
        Notiser fungerar när webbläsaren tillåter det och appen kan köras i
        bakgrunden. Allt sparas lokalt i den här webbläsaren.
      </p>
    </article>
  )
}

export default ReminderSettings
