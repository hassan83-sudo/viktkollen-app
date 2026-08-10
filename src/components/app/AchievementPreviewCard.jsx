import { memo, useMemo } from 'react'
import { buildAchievementEngine } from '../../services/achievements/achievementEngine.js'

function safePercent(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

function progressBucket(value) {
  return String(Math.round(safePercent(value) / 10) * 10)
}

function formatDate(value) {
  if (!value) return ''

  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function AchievementPreviewCard({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const model = useMemo(() => buildAchievementEngine({
    adaptiveCoachFeedback,
    checkIn,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    weights,
  }, { analysisDate }), [
    adaptiveCoachFeedback,
    analysisDate,
    checkIn,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    weights,
  ])
  const nextAchievement = model.nextAchievement
  const latestUnlocked = [...model.achievements]
    .filter((achievement) => achievement.status === 'unlocked')
    .sort((first, second) =>
      String(second.unlockedAt || '').localeCompare(String(first.unlockedAt || ''), 'sv-SE'),
    )[0] || null
  const progressPercent = safePercent(nextAchievement?.progressPercent || 0)

  return (
    <section className="achievement-preview-card" aria-label="Nästa achievement">
      <div className="achievement-preview-icon" aria-hidden="true">★</div>
      <div className="achievement-preview-content">
        <p className="eyebrow">Nästa achievement</p>
        <h2>{nextAchievement?.title || 'Alla badges upplåsta'}</h2>
        <span>
          {nextAchievement
            ? `${nextAchievement.progress} av ${nextAchievement.target} ${nextAchievement.unit}`
            : `${model.summary.unlockedCount} badges klara`}
        </span>
        <div
          aria-label={`Progress mot nästa achievement: ${progressPercent}%`}
          aria-valuemax="100"
          aria-valuemin="0"
          aria-valuenow={progressPercent}
          className="achievement-preview-progress"
          role="progressbar"
        >
          <span className={`achievement-progress-${progressBucket(progressPercent)}`} />
        </div>
      </div>
      <div className="achievement-preview-meta">
        <strong>{model.summary.unlockedCount}</strong>
        <span>upplåsta</span>
        <small>{latestUnlocked ? `Senast: ${latestUnlocked.title}${latestUnlocked.unlockedAt ? ` ${formatDate(latestUnlocked.unlockedAt)}` : ''}` : 'Ingen badge ännu'}</small>
      </div>
    </section>
  )
}

export default memo(AchievementPreviewCard)
