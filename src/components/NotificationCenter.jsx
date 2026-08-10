import { useMemo, useState } from 'react'
import {
  buildNotificationCenterModel,
  normalizeNotificationsV3,
  updateSmartNotificationStatus,
} from '../services/notifications/notificationEngine.js'
import { readMealPlans } from '../services/nutrition/nutritionEngine.js'

function formatDateTime(value) {
  if (!value) return 'Saknas'
  try {
    return new Date(value).toLocaleString('sv-SE')
  } catch {
    return 'Saknas'
  }
}

function NotificationCenter({
  adaptiveCoachFeedback = {},
  checkIn,
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  onReminderStateChange,
  profile = {},
  reminderState = {},
  syncStatus = {},
  today,
  weights = [],
  weeklyPlan = {},
}) {
  const [message, setMessage] = useState('')
  const mealPlans = useMemo(() => readMealPlans(), [])
  const model = useMemo(
    () => buildNotificationCenterModel({
      adaptiveCoachFeedback,
      checkIn,
      goalsHabits,
      healthSnapshot,
      mealPlans,
      meals,
      nutritionGoals,
      profile,
      reminderState,
      syncStatus,
      today,
      weights,
      weeklyPlan,
    }),
    [adaptiveCoachFeedback, checkIn, goalsHabits, healthSnapshot, mealPlans, meals, nutritionGoals, profile, reminderState, syncStatus, today, weights, weeklyPlan],
  )
  const notifications = normalizeNotificationsV3(reminderState.notificationsV3)

  function updateSettings(patch) {
    onReminderStateChange?.({
      ...reminderState,
      notificationsV3: {
        ...notifications,
        settings: {
          ...notifications.settings,
          ...patch,
          quietHours: {
            ...notifications.settings.quietHours,
            ...(patch.quietHours || {}),
          },
        },
      },
      updatedAt: new Date().toISOString(),
    })
    setMessage('Notisinställningarna sparades.')
  }

  function updateNotificationStatus(item, status) {
    onReminderStateChange?.(updateSmartNotificationStatus(reminderState, item, status))
    setMessage(
      status === 'completed'
        ? 'Notisen markerades som klar.'
        : status === 'postponed'
          ? 'Notisen visas igen senare.'
          : 'Notisen ignorerades för idag.',
    )
  }

  return (
    <section className="panel reminder-center" id="notification-center" aria-labelledby="notification-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Notifications V3</p>
          <h2 id="notification-center-heading">Notification Center</h2>
        </div>
        <span className="insight-coverage">{model.upcoming.length} kommande</span>
      </div>

      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}

      <div className="reminder-summary-grid">
        <span>Permission: {model.permission}</span>
        <span>Leverans: {model.adaptiveProfile.cadence}</span>
        <span>Quiet hours: {model.settings.quietHours.start}-{model.settings.quietHours.end}</span>
        <span>Batchning: {model.settings.batchingWindowMinutes} min</span>
      </div>

      <div className="reminder-columns">
        <article>
          <h3>Kommande</h3>
          <NotificationList emptyText="Inga kommande notiser." items={model.upcoming.map((batch) => ({
            at: batch.scheduledAt,
            id: batch.id,
            statusLabel: batch.items.length > 1 ? 'Samlad' : 'Planerad',
            title: batch.title,
          }))} />
        </article>
        <article>
          <h3>Smart Notifications</h3>
          <NotificationList
            emptyText="Inga smarta rekommendationer just nu."
            items={model.smartRecommendations}
            onComplete={(item) => updateNotificationStatus(item, 'completed')}
            onDismiss={(item) => updateNotificationStatus(item, 'dismissed')}
            onSnooze={(item) => updateNotificationStatus(item, 'postponed')}
          />
        </article>
        <article>
          <h3>Historik</h3>
          <NotificationList emptyText="Ingen notishistorik ännu." items={model.history.slice(0, 8)} />
        </article>
      </div>

      <details>
        <summary>Completed, postponed och dismissed</summary>
        <div className="reminder-columns">
          <article>
            <h3>Completed</h3>
            <NotificationList emptyText="Inga klara notiser." items={model.completed.slice(0, 5)} />
          </article>
          <article>
            <h3>Postponed</h3>
            <NotificationList emptyText="Inga uppskjutna notiser." items={model.postponed.slice(0, 5)} />
          </article>
          <article>
            <h3>Dismissed</h3>
            <NotificationList emptyText="Inga avfärdade notiser." items={model.dismissed.slice(0, 5)} />
          </article>
        </div>
      </details>

      <form className="inline-edit-form" onSubmit={(event) => event.preventDefault()} aria-label="Notisinställningar">
        <h3>Quiet hours</h3>
        <label className="toggle-row">
          <span>Aktivera quiet hours</span>
          <input
            type="checkbox"
            checked={model.settings.quietHours.enabled}
            onChange={(event) => updateSettings({ quietHours: { enabled: event.target.checked } })}
          />
        </label>
        <label>
          <span>Start</span>
          <input
            type="time"
            value={model.settings.quietHours.start}
            onChange={(event) => updateSettings({ quietHours: { start: event.target.value } })}
          />
        </label>
        <label>
          <span>Slut</span>
          <input
            type="time"
            value={model.settings.quietHours.end}
            onChange={(event) => updateSettings({ quietHours: { end: event.target.value } })}
          />
        </label>
      </form>
    </section>
  )
}

function NotificationList({ emptyText, items, onComplete, onDismiss, onSnooze }) {
  if (!items.length) return <p className="estimate-note">{emptyText}</p>

  return (
    <ul className="goals-list reminder-card-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.priorityLabel || item.statusLabel || 'Planerad'}</span>
          <span>{formatDateTime(item.at || item.scheduledAt)}</span>
          {(onComplete || onDismiss || onSnooze) && (
            <div className="notification-actions" aria-label={`Åtgärder för ${item.title}`}>
              <button type="button" className="secondary-button" onClick={() => onComplete?.(item)}>
                Klar
              </button>
              <button type="button" className="secondary-button" onClick={() => onSnooze?.(item)}>
                Visa senare
              </button>
              <button type="button" className="secondary-button" onClick={() => onDismiss?.(item)}>
                Ignorera
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default NotificationCenter
