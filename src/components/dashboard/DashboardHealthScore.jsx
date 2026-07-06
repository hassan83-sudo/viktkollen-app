import { memo } from 'react'

/**
 * Explains the AI Health Score without medical assessment.
 *
 * @param {{healthScore: {factors: object[], improvement: string, score: number, summary: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardHealthScore({ healthScore }) {
  return (
    <article className="dashboard-card dashboard-health">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">AI Health Score</p>
          <h3>{healthScore.score}/100</h3>
        </div>
        <span>Vanor</span>
      </div>
      <p className="dashboard-card-copy">{healthScore.summary}</p>
      <div className="dashboard-factor-list">
        {healthScore.factors.map((factor) => (
          <div className="dashboard-factor" key={factor.label}>
            <div>
              <strong>{factor.label}</strong>
              <span>{factor.reason}</span>
            </div>
            <b>
              {factor.points}/{factor.max}
            </b>
          </div>
        ))}
      </div>
      <p className="dashboard-note">
        Mest förbättrar: {healthScore.improvement} Scoret är allmänt vanestöd,
        inte medicinsk bedömning.
      </p>
    </article>
  )
}

export default memo(DashboardHealthScore)
