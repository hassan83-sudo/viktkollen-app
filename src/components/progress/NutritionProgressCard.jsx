function formatNumber(value, unit) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value).toLocaleString('sv-SE')} ${unit}` : 'Saknas'
}

function NutritionProgressCard({ nutrition, planning }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-nutrition-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h3 id="progress-nutrition-title">Faktiskt intag</h3>
          <span>Planerade måltider visas separat och räknas inte som faktiskt intag.</span>
        </div>
      </div>
      <dl className="progress-detail-grid">
        <div><dt>Snitt kalorier</dt><dd>{formatNumber(nutrition.averageCalories, 'kcal/dag')}</dd></div>
        <div><dt>Snitt protein</dt><dd>{formatNumber(nutrition.averageProtein, 'g/dag')}</dd></div>
        <div><dt>Kalorimål nåddes</dt><dd>{nutrition.calorieGoalDays} dagar · {nutrition.calorieGoalPercent}%</dd></div>
        <div><dt>Proteinmål nåddes</dt><dd>{nutrition.proteinGoalDays} dagar · {nutrition.proteinGoalPercent}%</dd></div>
        <div><dt>Loggade måltider</dt><dd>{nutrition.mealCount}</dd></div>
        <div><dt>Vanligaste måltidstyp</dt><dd>{nutrition.mostCommonMealType || 'Saknas'}</dd></div>
      </dl>
      <div className="coach-note">
        Planering: {planning.plannedMealCount} planerade måltider denna vecka och {planning.generatedPlanCount} AI-genererade planer sparade.
      </div>
    </section>
  )
}

export default NutritionProgressCard
