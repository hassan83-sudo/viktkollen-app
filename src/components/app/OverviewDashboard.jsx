import { memo, useMemo } from 'react'
import AchievementPreviewCard from './AchievementPreviewCard.jsx'
import DailyCoachCard from './DailyCoachCard.jsx'
import DailyMealPlannerCard from './DailyMealPlannerCard.jsx'
import DailyProgressCard from './DailyProgressCard.jsx'
import HealthPredictionCard from './HealthPredictionCard.jsx'
import SmartNotificationsCard from './SmartNotificationsCard.jsx'
import WeeklyProgressSection from './WeeklyProgressSection.jsx'

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function formatNumber(value, options = {}) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 'Saknas'

  return new Intl.NumberFormat('sv-SE', options).format(number)
}

function formatWeight(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) return 'Saknas'

  return `${number.toFixed(1).replace('.', ',')} kg`
}

function formatDashboardDate(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date()

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  }).format(date)
}

function getInitials(profile, email = '') {
  const name = profile?.name?.trim()
  const source = name || email

  if (!source) return 'VK'

  return source
    .split(/\s+|@/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('sv-SE'))
    .join('') || 'VK'
}

function getProgressPercent(value, goal) {
  const current = Number(value)
  const target = Number(goal)

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null

  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

function navigateToTarget(targetId) {
  const target = document.getElementById(targetId)

  if (target) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    target.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  window.history.replaceState(null, '', `#${targetId}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function OverviewStatsGrid({
  caloriesToday,
  calorieGoal,
  currentWeight,
  healthScore,
  proteinToday,
  proteinGoal,
  steps,
}) {
  const stats = [
    isFiniteNumber(steps) && {
      accent: 'steps',
      label: 'Antal steg',
      time: 'Idag',
      value: formatNumber(Math.round(Number(steps))),
    },
    isFiniteNumber(proteinToday) && {
      accent: 'protein',
      label: 'Protein',
      time: isFiniteNumber(proteinGoal) ? `${getProgressPercent(proteinToday, proteinGoal)} % av mål` : 'Idag',
      value: `${formatNumber(Math.round(Number(proteinToday)))} g`,
    },
    isFiniteNumber(caloriesToday) && {
      accent: 'calories',
      label: 'Kalorier',
      time: isFiniteNumber(calorieGoal) ? `${getProgressPercent(caloriesToday, calorieGoal)} % av mål` : 'Idag',
      value: `${formatNumber(Math.round(Number(caloriesToday)))} kcal`,
    },
    isFiniteNumber(currentWeight) && {
      accent: 'weight',
      label: 'Vikt',
      time: 'Senast loggad',
      value: formatWeight(currentWeight),
    },
    isFiniteNumber(healthScore) && {
      accent: 'health',
      label: 'Health Score',
      time: 'Idag',
      value: `${Math.round(Number(healthScore))}/100`,
    },
  ].filter(Boolean)

  if (!stats.length) {
    return (
      <section className="overview-stats-empty dashboard-card-modern" aria-label="Dagens statistik">
        <p className="eyebrow">Dagens statistik</p>
        <h2>Inga värden loggade ännu</h2>
        <span>Logga vikt, mat eller check-in så fylls översikten med riktiga värden.</span>
      </section>
    )
  }

  return (
    <section className="overview-stats-grid" aria-label="Dagens statistik">
      {stats.map((stat) => (
        <article className={`overview-stat-card is-${stat.accent}`} key={stat.label}>
          <div>
            <span>{stat.label}</span>
            <small>{stat.time}</small>
          </div>
          <strong>{stat.value}</strong>
          <svg aria-hidden="true" className="overview-stat-sparkline" viewBox="0 0 90 28">
            <polyline points="2,22 18,16 34,19 50,9 66,13 88,4" />
          </svg>
        </article>
      ))}
    </section>
  )
}

function ProgressInsightsHero({ insights = [] }) {
  const visibleInsights = insights.slice(0, 3)

  return (
    <section className="overview-insights-hero dashboard-card-modern" aria-labelledby="overview-insights-title">
      <div className="overview-card-heading">
        <div>
          <p className="eyebrow">AI Progress Insights</p>
          <h2 id="overview-insights-title">Din utveckling sammanfattad av AI</h2>
        </div>
        <button type="button" onClick={() => navigateToTarget('framsteg')}>
          Visa alla insikter
        </button>
      </div>

      {visibleInsights.length > 0 ? (
        <div className="overview-insight-list">
          {visibleInsights.map((insight) => (
            <article key={insight.type || insight.text}>
              <span>{insight.type === 'low-weight-data' ? 'Nästa steg' : 'Insikt'}</span>
              <strong>{insight.text}</strong>
              {insight.basis && <small>{insight.basis}</small>}
            </article>
          ))}
        </div>
      ) : (
        <div className="overview-empty-state">
          <strong>Insikter visas när mer historik finns.</strong>
          <span>Vikt, mått och progressdata används bara när de faktiskt är loggade.</span>
        </div>
      )}
    </section>
  )
}

function ActivityRingCard({
  healthScore,
  steps,
}) {
  const hasHealthScore = isFiniteNumber(healthScore)
  const score = hasHealthScore ? Math.round(Number(healthScore)) : null
  const stepsValue = isFiniteNumber(steps) ? Math.round(Number(steps)) : null
  const ringPercent = hasHealthScore ? score : getProgressPercent(stepsValue, 8000)
  const safePercent = ringPercent ?? 0
  const label = hasHealthScore ? 'Health Score' : 'Steg'
  const value = hasHealthScore ? `${score} / 100` : stepsValue ? `${formatNumber(stepsValue)} steg` : 'Saknas'

  return (
    <section
      aria-label={`Dagens aktivitet: ${label} ${value}`}
      className="overview-activity-ring-card dashboard-card-modern"
    >
      <div>
        <p className="eyebrow">Dagens aktivitet</p>
        <h2>{label}</h2>
        <span>{hasHealthScore ? 'Samlad signal från dagens data.' : 'Steg används när Health Score saknas.'}</span>
      </div>

      <div
        aria-label={`${label}: ${value}`}
        aria-valuemax="100"
        aria-valuemin="0"
        aria-valuenow={safePercent}
        className="overview-activity-ring"
        role="progressbar"
        style={{ '--overview-ring-progress': `${safePercent}%` }}
      >
        <strong>{value}</strong>
        <span>{safePercent}%</span>
      </div>
    </section>
  )
}

function OverviewQuickActions({
  onAddMeal,
  onLogWeight,
  onScanFood,
}) {
  const actions = [
    { label: 'Logga vikt', onClick: onLogWeight },
    { label: 'Lägg till måltid', onClick: onAddMeal },
    { label: 'Body Scan', onClick: () => navigateToTarget('framstegsbilder') },
    { label: 'AI Coach', onClick: () => navigateToTarget('coach') },
    { label: 'Skanna mat', onClick: onScanFood },
  ]

  return (
    <section className="overview-quick-actions" aria-label="Snabbåtgärder">
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </section>
  )
}

function OverviewDashboard({
  adaptiveCoachFeedback,
  calorieGoal,
  caloriesToday,
  checkIn,
  currentWeight,
  email,
  foods,
  goalsHabits,
  healthScore,
  healthSnapshot,
  meals,
  nutritionGoals,
  onAddMeal,
  onEditProfile,
  onLogWeight,
  onScanFood,
  profile,
  progressInsights,
  proteinGoal,
  proteinToday,
  reminderState,
  selectedDate,
  syncStatus,
  weeklyWeightChange,
  weights,
}) {
  const formattedDate = useMemo(() => formatDashboardDate(selectedDate), [selectedDate])
  const initials = getInitials(profile, email)

  return (
    <div className="home-overview-shell">
      <header className="overview-app-header">
        <div>
          <h1>Översikt</h1>
          <p>{formattedDate}</p>
        </div>
        <button
          aria-label="Öppna profilinställningar"
          className="overview-avatar-button"
          type="button"
          onClick={onEditProfile}
        >
          {initials}
        </button>
      </header>

      <ProgressInsightsHero insights={progressInsights} />

      <div className="overview-top-grid">
        <ActivityRingCard healthScore={healthScore} steps={checkIn?.steps} />
        <OverviewStatsGrid
          calorieGoal={calorieGoal}
          caloriesToday={caloriesToday}
          currentWeight={currentWeight}
          healthScore={healthScore}
          proteinGoal={proteinGoal}
          proteinToday={proteinToday}
          steps={checkIn?.steps}
        />
      </div>

      <OverviewQuickActions
        onAddMeal={onAddMeal}
        onLogWeight={onLogWeight}
        onScanFood={onScanFood}
      />

      <DailyProgressCard
        calorieGoal={calorieGoal}
        caloriesToday={caloriesToday}
        healthScore={healthScore}
        proteinGoal={proteinGoal}
        proteinToday={proteinToday}
        steps={checkIn?.steps}
        weeklyWeightChange={weeklyWeightChange}
      />
      <DailyCoachCard
        calorieGoal={calorieGoal}
        caloriesToday={caloriesToday}
        healthScore={healthScore}
        onAddMeal={onAddMeal}
        onLogWeight={onLogWeight}
        onScanFood={onScanFood}
        proteinGoal={proteinGoal}
        proteinToday={proteinToday}
        steps={checkIn?.steps}
      />
      <div id="smart-notifications">
        <SmartNotificationsCard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          syncStatus={syncStatus}
          today={selectedDate}
          weights={weights}
        />
      </div>
      <div id="weekly-progress">
        <WeeklyProgressSection
          checkIn={checkIn}
          foods={foods}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          selectedDate={selectedDate}
        />
      </div>
      <div id="achievements">
        <AchievementPreviewCard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedDate}
          checkIn={checkIn}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />
      </div>
      <div id="health-prediction">
        <HealthPredictionCard
          adaptiveCoachFeedback={adaptiveCoachFeedback}
          analysisDate={selectedDate}
          checkIn={checkIn}
          foods={foods}
          goalsHabits={goalsHabits}
          healthSnapshot={healthSnapshot}
          meals={meals}
          nutritionGoals={nutritionGoals}
          profile={profile}
          reminderState={reminderState}
          weights={weights}
        />
      </div>
      <div id="meal-planner">
        <DailyMealPlannerCard
          date={selectedDate}
          meals={meals}
          nutritionGoals={nutritionGoals}
        />
      </div>
    </div>
  )
}

export default memo(OverviewDashboard)
