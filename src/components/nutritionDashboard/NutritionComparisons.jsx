function NutritionComparisons({ comparisons }) {
  if (!comparisons.length) {
    return null
  }

  return (
    <section className="nutrition-card nutrition-dashboard-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Jämförelser</p>
          <h3>Dagens måltider</h3>
        </div>
      </div>
      <div className="nutrition-dashboard-comparisons">
        {comparisons.map((comparison) => (
          <article key={comparison.label}>
            <span>{comparison.label}</span>
            <strong>{comparison.text}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

export default NutritionComparisons
