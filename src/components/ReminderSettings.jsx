import ReminderMasterControls from './ReminderMasterControls.jsx'
import { useTranslation } from 'react-i18next'

function ReminderSettings({
  onReminderSettingChange,
  onRequestNotificationPermission,
  reminderOptions,
  reminderSettings,
  reminderStatus,
}) {
  const { t } = useTranslation(['settings'])
  const reminderDescriptions = {
    meal: t('settings:reminders.descriptionMeal'),
    water: t('settings:reminders.descriptionWater'),
    weight: t('settings:reminders.descriptionWeight'),
  }

  return (
    <article className="panel settings-panel" id="dagliga-paminnelser">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('settings:profile.title')}</p>
          <h2>{t('settings:reminders.title')}</h2>
        </div>
      </div>
      <p className="settings-note">
        {t('settings:reminders.note')}
      </p>

      <ReminderMasterControls
        onReminderSettingChange={onReminderSettingChange}
        onRequestNotificationPermission={onRequestNotificationPermission}
        remindersEnabled={reminderSettings.enabled}
      />
      {reminderStatus && <p className="analysis-status">{reminderStatus}</p>}

      <div className="reminder-list">
        {reminderOptions.map((reminder) => (
          <div className="reminder-row" key={reminder.enabledKey}>
            <label className="toggle-row checkbox-row">
              <input
                aria-describedby={`reminder-${reminder.enabledKey}-description`}
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
            <span id={`reminder-${reminder.enabledKey}-description`}>{reminderDescriptions[reminder.enabledKey]}</span>
            {/* A11Y-8D: names which reminder the time belongs to (several rows). */}
            <input
              aria-describedby={`reminder-${reminder.enabledKey}-description`}
              aria-label={t('settings:reminders.timeLabel', { reminder: reminder.label })}
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
        Du kan när som helst stänga av eller ändra tiderna.
      </p>
    </article>
  )
}

export default ReminderSettings
