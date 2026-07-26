function NutritionInsights({ insights }) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Kostinsikter</p>
          <h3>Lokala mönster</h3>
        </div>
      </div>
      {insights.length === 0 ? (
        <div className="nutrition-empty">
          <strong>För lite data för tydliga insikter.</strong>
          <span>Logga några måltider till så visas mönster här.</span>
        </div>
      ) : (
        <div className="nutrition-insight-list">
          {insights.map((insight) => (
            <article key={`${insight.priority}-${insight.text}`}>
              <strong>{insight.text}</strong>
              <span>Bygger på: {insight.basis}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default NutritionInsights
