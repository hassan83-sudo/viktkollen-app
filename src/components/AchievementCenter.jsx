import { useMemo } from 'react'
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

function AchievementCard({ achievement, onAcknowledge }) {
  return (
    <article className={`achievement-card achievement-card-${achievement.status}`}>
      <div>
        <p className="eyebrow">{achievement.category}</p>
        <h3>{achievement.title}</h3>
        <p>{achievement.description}</p>
      </div>
      <ProgressBar label={achievement.title} value={achievement.progressPercent} />
      <div className="achievement-card-footer">
        <span>{achievement.progress} av {achievement.target} {achievement.unit}</span>
        <strong>{achievement.xp} XP</strong>
      </div>
      {achievement.status === 'unlocked' && !achievement.acknowledged && (
        <button className="secondary-button" type="button" onClick={() => onAcknowledge(achievement.definitionId)}>
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
  onGoalsHabitsChange,
  profile = {},
  reminderState = {},
  weights = [],
}) {
  const model = useMemo(() => buildAchievementEngine({
    adaptiveCoachFeedback,
    checkIn,
    checkIns,
    goalsHabits,
    healthSnapshot,
    meals,
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
    profile,
    reminderState,
    weights,
  ])
  const highlighted = model.achievements
    .filter((achievement) => achievement.status !== 'locked')
    .slice(0, 6)
  const visibleAchievements = highlighted.length ? highlighted : model.achievements.slice(0, 6)

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
          <span>Trygg motivation baserad på din faktiska data.</span>
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
          <strong>{model.summary.unlockedCount}</strong>
          <small>{model.summary.latestAchievementTitle}</small>
        </div>
        <div className="metric">
          <span>Delmål</span>
          <strong>{model.summary.milestoneCount}</strong>
          <small>{model.milestones.next ? `${model.milestones.next.title} är nästa` : 'Inget nästa delmål'}</small>
        </div>
        <div className="metric">
          <span>Confidence</span>
          <strong>{model.confidence}%</strong>
          <small>Coverage {model.coverage}%</small>
        </div>
      </div>

      <div className="content-grid">
        <article className="achievement-section">
          <h3>Achievements</h3>
          <div className="achievement-grid">
            {visibleAchievements.map((achievement) => (
              <AchievementCard
                achievement={achievement}
                key={achievement.id}
                onAcknowledge={acknowledge}
              />
            ))}
          </div>
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
