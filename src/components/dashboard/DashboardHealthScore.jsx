import { memo, useMemo } from 'react'

function getFactorRatio(factor) {
  return factor?.max > 0 ? factor.points / factor.max : 0
}

function getHealthScoreCircle(score) {
  const normalizedScore = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(Math.round(Number(score)), 100))
    : 0
  const circumference = 2 * Math.PI * 52

  return {
    circumference,
    offset: circumference - (normalizedScore / 100) * circumference,
    score: normalizedScore,
  }
}

/**
 * Explains the AI Health Score without medical assessment.
 *
 * @param {{healthScore: {factors: object[], improvement: string, score: number, summary: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardHealthScore({ healthScore }) {
  const scoreCircle = getHealthScoreCircle(healthScore.score)
  const strongestFactor = useMemo(
    () =>
      [...healthScore.factors].sort(
        (first, second) => getFactorRatio(second) - getFactorRatio(first),
      )[0],
    [healthScore.factors],
  )
  const weakestFactor = useMemo(
    () =>
      [...healthScore.factors].sort(
        (first, second) => second.missing - first.missing,
      )[0],
    [healthScore.factors],
  )

  return (
    <article className="dashboard-card dashboard-health">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">AI Health Score</p>
          <h3>Daglig balans</h3>
        </div>
        <span>Vanor</span>
      </div>
      <div className="health-score-orb" aria-label={`Health Score ${scoreCircle.score} av 100`}>
        <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
          <circle className="health-score-track" cx="60" cy="60" r="52" />
          <circle
            className="health-score-progress"
            cx="60"
            cy="60"
            r="52"
            strokeDasharray={scoreCircle.circumference}
            strokeDashoffset={scoreCircle.offset}
          />
        </svg>
        <div>
          <strong>{scoreCircle.score}</strong>
          <span>/100</span>
        </div>
      </div>
      <p className="dashboard-card-copy">{healthScore.summary}</p>
      <div className="dashboard-score-explainer" aria-label="Kort förklaring">
        <div>
          <span>Varför</span>
          <strong>
            {strongestFactor?.label || 'Data saknas'} väger positivt just nu.
          </strong>
        </div>
        <div>
          <span>Öka mest</span>
          <strong>{weakestFactor?.improvement || healthScore.improvement}</strong>
        </div>
      </div>
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
        Scoret bygger på check-in, vikttrend, matvanor, aktivitet och återhämtning.
        Det är allmänt vanestöd, inte medicinsk bedömning.
      </p>
    </article>
  )
}

export default memo(DashboardHealthScore)
