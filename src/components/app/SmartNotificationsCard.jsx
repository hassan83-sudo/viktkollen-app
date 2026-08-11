import { memo, useMemo } from 'react'
import { buildNotificationCenterModel } from '../../services/notifications/notificationEngine.js'
import { readMealPlans } from '../../services/nutrition/nutritionEngine.js'

const priorityIcons = {
  high: '!',
  low: 'i',
  medium: '*',
}

function SmartNotificationsCard({
  adaptiveCoachFeedback = {},
  checkIn,
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  profile = {},
  reminderState = {},
  syncStatus = {},
  today,
  weights = [],
}) {
  const mealPlans = useMemo(() => readMealPlans(), [])
  const model = useMemo(() => buildNotificationCenterModel({
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
  }), [
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
  ])
  const top = model.smartRecommendations[0]
  const priority = top?.priorityLevel || 'low'
  const pendingLabel = model.smartRecommendations.length === 1
    ? '1 notis väntar'
    : `${model.smartRecommendations.length} notiser väntar`

  function showAllNotifications() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById('notification-center')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <section className={`smart-notifications-card is-${priority}`} aria-label="Smart Notifications">
      <div className="smart-notifications-icon" aria-hidden="true">
        {priorityIcons[priority]}
      </div>
      <div className="smart-notifications-content">
        <p className="eyebrow">Smart Notifications</p>
        <h2>{top?.title || 'Inga smarta notiser just nu'}</h2>
        <span>{top?.body || 'Viktkollen säger till när något behöver din uppmärksamhet.'}</span>
      </div>
      <div className="smart-notifications-meta">
        <strong>{model.smartRecommendations.length}</strong>
        <span>{pendingLabel}</span>
        {top && <small>{top.priorityLabel}</small>}
        <button className="secondary-button" type="button" onClick={showAllNotifications}>Visa alla</button>
      </div>
    </section>
  )
}

export default memo(SmartNotificationsCard)
