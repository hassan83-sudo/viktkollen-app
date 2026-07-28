function WeeklyNutritionInsights({ comparison, focus, insights, patterns }) {
  return (
    <section className="nutrition-card weekly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Insikter</p>
          <h3>Veckomönster</h3>
        </div>
      </div>
      <div className="weekly-nutrition-insight-grid">
        <article>
          <span>Vanligaste måltidstyp</span>
          <strong>{patterns.mostCommonMealType?.type || 'Saknas'}</strong>
        </article>
        <article>
          <span>Frukost/lunch/middag</span>
          <strong>{patterns.breakfastDays}/{patterns.lunchDays}/{patterns.dinnerDays} dagar</strong>
        </article>
        <article>
          <span>Sena måltider</span>
          <strong>{patterns.lateMeals.toLocaleString('sv-SE')}</strong>
        </article>
        <article>
          <span>Långa uppehåll</span>
          <strong>{patterns.longGaps.toLocaleString('sv-SE')}</strong>
        </article>
      </div>
      <div className="weekly-nutrition-list">
        {insights.map((insight) => <p key={insight}>{insight}</p>)}
      </div>
      <div className="weekly-nutrition-list">
        <strong>Jämförelse med föregående vecka</strong>
        {comparison.hasComparison
          ? comparison.text.map((line) => <p key={line}>{line}</p>)
          : comparison.reasons.map((line) => <p key={line}>{line}</p>)}
      </div>
      <div className="weekly-nutrition-list">
        <strong>Fokus nästa vecka</strong>
        {focus.map((item) => <p key={item}>{item}</p>)}
      </div>
    </section>
  )
}

export default WeeklyNutritionInsights
