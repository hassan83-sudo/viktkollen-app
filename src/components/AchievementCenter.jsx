import { useMemo, useState } from 'react'
import { appendAchievementEvents, normalizeAchievementState } from '../services/achievements/achievementLedger.js'
import { buildAchievementEngine } from '../services/achievements/achievementEngine.js'
import { normalizeGoalsHabitsState } from '../services/goalsHabits.js'

function safePercent(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

function ProgressBar({ label, value }) {
  const percent = safePercent(value)

  return (
    <div className="achievement-progress" aria-label={`${label}: ${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}

const achievementFilters = [
  { id: 'all', label: 'Alla' },
  { id: 'weightProgress', label: 'Vikt' },
  { id: 'consistency', label: 'Konsekvens' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'activity', label: 'Aktivitet' },
]

const categoryLabels = {
  activity: 'Aktivitet',
  appMilestones: 'App',
  checkIns: 'Check-in',
  coaching: 'Coach',
  consistency: 'Konsekvens',
  dataQuality: 'Data',
  goals: 'Mål',
  habits: 'Vanor',
  nutrition: 'Nutrition',
  planning: 'Planering',
  weightProgress: 'Vikt',
}

function formatAchievementDate(value) {
  if (!value) return ''

  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function AchievementCard({ achievement, onAcknowledge }) {
  const locked = achievement.status === 'locked'
  const newlyUnlocked = achievement.status === 'unlocked' && !achievement.acknowledged

  return (
    <article
      aria-label={`${achievement.title}, ${locked ? 'låst' : 'upplåst'}`}
      className={`achievement-card achievement-card-${achievement.status}${newlyUnlocked ? ' achievement-card-new' : ''}`}
    >
      <div>
        <p className="eyebrow">{categoryLabels[achievement.category] || achievement.category}</p>
        <h3>{achievement.title}</h3>
        <p>{achievement.description}</p>
      </div>
      <ProgressBar label={achievement.title} value={achievement.progressPercent} />
      <div className="achievement-card-footer">
        <span>{achievement.progress} av {achievement.target} {achievement.unit}</span>
        <strong>{locked ? 'Låst' : `${achievement.xp} XP`}</strong>
      </div>
      {achievement.unlockedAt && (
        <small>Upplåst {formatAchievementDate(achievement.unlockedAt)}</small>
      )}
      {achievement.status === 'unlocked' && !achievement.acknowledged && (
        <button
          aria-label={`Markera ${achievement.title} som sedd`}
          className="secondary-button"
          type="button"
          onClick={() => onAcknowledge(achievement.definitionId)}
        >
          Markera sedd
        </button>
      )}
    </article>
  )
}

function MilestoneList({ milestones }) {
  if (!milestones.milestones.length) {
    return <p>Delmål visas när startvikt, nuvarande vikt och målvikt finns.</p>
  }

  return (
    <ul className="achievement-list">
      {milestones.milestones.map((milestone) => (
        <li key={milestone.id}>
          <strong>{milestone.title}</strong>
          <span>{milestone.weightLabel} · {milestone.status === 'reached' ? 'Passerad' : 'Kommande'}</span>
        </li>
      ))}
    </ul>
  )
}

function ChallengeList({ challenges, onRecordChallenge }) {
  if (!challenges.length) return <p>Inga säkra utmaningar föreslås just nu.</p>

  return (
    <div className="achievement-challenge-grid">
      {challenges.map((challenge) => (
        <article className="achievement-challenge" key={challenge.id}>
          <h3>{challenge.title}</h3>
          <p>{challenge.description}</p>
          <span>{challenge.progress} av {challenge.target}</span>
          <button className="secondary-button" type="button" onClick={() => onRecordChallenge(challenge.id, 'challengeAccepted')}>
            Starta
          </button>
          <button className="secondary-button" type="button" onClick={() => onRecordChallenge(challenge.id, 'challengeDismissed')}>
            Inte nu
          </button>
        </article>
      ))}
    </div>
  )
}

function EventHistory({ events }) {
  if (!events.length) return <p>Historik visas när du har låst upp eller hanterat något.</p>

  return (
    <ul className="achievement-list">
      {events.slice(-5).reverse().map((event) => (
        <li key={event.eventId}>
          <strong>{event.type}</strong>
          <span>{event.definitionId || event.achievementId}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AchievementCenter({
  adaptiveCoachFeedback = {},
  analysisDate,
  checkIn,
  checkIns = [],
  goalsHabits = {},
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  onGoalsHabitsChange,
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const [activeFilter, setActiveFilter] = useState('all')
  const model = useMemo(() => buildAchievementEngine({
    adaptiveCoachFeedback,
    checkIn,
    checkIns,
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
    checkIns,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    reminderState,
    weights,
  ])
  const visibleAchievements = model.achievements.filter((achievement) =>
    activeFilter === 'all' || achievement.category === activeFilter)
  const latestUnlocked = [...model.achievements]
    .filter((achievement) => achievement.status === 'unlocked')
    .sort((first, second) =>
      String(second.unlockedAt || '').localeCompare(String(first.unlockedAt || ''), 'sv-SE'),
    )[0] || null
  const nextAchievement = model.nextAchievement

  function updateAchievementState(nextAchievements) {
    if (!onGoalsHabitsChange) return
    const normalized = normalizeGoalsHabitsState(goalsHabits)
    onGoalsHabitsChange({
      ...normalized,
      achievements: nextAchievements,
    })
  }

  function acknowledge(definitionId) {
    const achievements = normalizeAchievementState(goalsHabits.achievements)
    updateAchievementState({
      ...achievements,
      acknowledged: [...new Set([...achievements.acknowledged, definitionId])],
      updatedAt: new Date().toISOString(),
    })
  }

  function recordChallenge(definitionId, type) {
    const achievements = appendAchievementEvents(goalsHabits.achievements, [{
      definitionId,
      eventId: `${type}-${definitionId}`,
      source: 'AchievementCenter',
      type,
    }])
    updateAchievementState(achievements)
  }

  return (
    <section className="panel achievement-center" id="achievements" aria-labelledby="achievement-center-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Smart Goals & Achievements V2</p>
          <h2 id="achievement-center-heading">Achievements och delmål</h2>
          <span>Trygg motivation baserad på vikt, loggning, protein, steg och konsekvens.</span>
        </div>
      </div>

      <div className="summary-grid">
        <div className="metric metric-primary">
          <span>Nivå</span>
          <strong>{model.level.level} · {model.level.title}</strong>
          <small>{model.summary.totalXp} XP totalt</small>
          <ProgressBar label="Nivåprogress" value={model.level.progressPercent} />
        </div>
        <div className="metric">
          <span>Upplåsta</span>
          <strong>{model.summary.unlockedCount} av {model.achievements.length}</strong>
          <small>{latestUnlocked ? latestUnlocked.title : model.summary.latestAchievementTitle}</small>
        </div>
        <div className="metric">
          <span>Nästa badge</span>
          <strong>{nextAchievement?.title || 'Alla upplåsta'}</strong>
          <small>{nextAchievement ? `${nextAchievement.progress} av ${nextAchievement.target} ${nextAchievement.unit}` : 'Bra jobbat'}</small>
          <ProgressBar label="Nästa achievement" value={nextAchievement?.progressPercent ?? 100} />
        </div>
        <div className="metric">
          <span>Senaste badge</span>
          <strong>{latestUnlocked?.title || 'Ingen ännu'}</strong>
          <small>{latestUnlocked?.unlockedAt ? `Upplåst ${formatAchievementDate(latestUnlocked.unlockedAt)}` : 'Fortsätt logga så visas den här'}</small>
        </div>
      </div>

      <div className="content-grid">
        <article className="achievement-section">
          <div className="achievement-section-heading">
            <h3>Badges</h3>
            <div className="achievement-filter" aria-label="Filtrera achievements">
              {achievementFilters.map((filter) => (
                <button
                  aria-pressed={activeFilter === filter.id}
                  className={activeFilter === filter.id ? 'is-active' : ''}
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="achievement-grid">
            {visibleAchievements.map((achievement) => (
              <AchievementCard
                achievement={achievement}
                key={achievement.id}
                onAcknowledge={acknowledge}
              />
            ))}
          </div>
          {!visibleAchievements.length && <p>Inga badges i den här kategorin ännu.</p>}
        </article>

        <article className="achievement-section">
          <h3>Delmål</h3>
          <MilestoneList milestones={model.milestones} />
        </article>

        <article className="achievement-section">
          <h3>Små utmaningar</h3>
          <ChallengeList challenges={model.challenges} onRecordChallenge={recordChallenge} />
        </article>

        <article className="achievement-section">
          <h3>Senaste historik</h3>
          <EventHistory events={[...model.ledger.events, ...model.ledger.xpLedger, ...model.ledger.challengeHistory]} />
        </article>
      </div>
    </section>
  )
}
