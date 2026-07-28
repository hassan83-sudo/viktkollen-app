function NutritionInsightsPanel({ insights }) {
  return (
    <section className="nutrition-card nutrition-dashboard-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Insikter</p>
          <h3>Försiktiga signaler</h3>
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="nutrition-empty">
          <strong>Inga tydliga signaler ännu.</strong>
          <span>Fortsätt logga måltider så visas mer användbara mönster.</span>
        </div>
      ) : (
        <div className="nutrition-dashboard-insights">
          {insights.map((insight) => (
            <article key={insight}>
              <span>{insight}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default NutritionInsightsPanel
