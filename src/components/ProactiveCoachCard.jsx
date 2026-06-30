function ProactiveCoachCard({ insights }) {
  if (!insights) {
    return null
  }

  return (
    <article className="dashboard-summary-card">
      <div className="dashboard-summary-heading">
        <div>
          <p className="eyebrow">AI Coach V3</p>
          <h2>Proaktiv coach</h2>
        </div>
        <span>{insights.source === 'openai' ? 'AI' : 'Smart mock'}</span>
      </div>
      <div className="dashboard-stat-grid">
        <div className="dashboard-stat">
          <span>Dagens styrka</span>
          <strong>{insights.dailyStrength}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Dagens risk</span>
          <strong>{insights.dailyRisk}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Nästa bästa handling</span>
          <strong>{insights.nextBestAction}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Billig måltidsidé</span>
          <strong>{insights.budgetMealIdea}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Återhämtning</span>
          <strong>{insights.recoveryAdvice}</strong>
        </div>
      </div>
    </article>
  )
}

export default ProactiveCoachCard
