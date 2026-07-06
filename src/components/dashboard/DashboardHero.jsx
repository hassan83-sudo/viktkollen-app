import { memo } from 'react'

/**
 * Shows the primary daily dashboard summary.
 *
 * @param {{hero: {focus: string, greeting: string, risk: string, score: number, strength: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardHero({ hero }) {
  return (
    <article className="dashboard-hero">
      <div>
        <p className="eyebrow">Smart AI Dashboard</p>
        <h2>{hero.greeting}</h2>
        <p>{hero.focus}</p>
      </div>
      <div className="dashboard-hero-score" aria-label="AI Health Score">
        <span>AI Health Score</span>
        <strong>{hero.score}</strong>
        <small>/100</small>
      </div>
      <div className="dashboard-hero-signal">
        <span>Dagens största styrka</span>
        <strong>{hero.strength}</strong>
      </div>
      <div className="dashboard-hero-signal risk">
        <span>Dagens största risk</span>
        <strong>{hero.risk}</strong>
      </div>
    </article>
  )
}

export default memo(DashboardHero)
