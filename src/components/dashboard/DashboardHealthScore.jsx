import { memo, useMemo } from 'react'

function getFactorRatio(factor) {
  return factor?.max > 0 ? factor.points / factor.max : 0
}

/**
 * Explains the AI Health Score without medical assessment.
 *
 * @param {{healthScore: {factors: object[], improvement: string, score: number, summary: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardHealthScore({ healthScore }) {
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
          <h3>{healthScore.score}/100</h3>
        </div>
        <span>Vanor</span>
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
