import { formatCalories, formatGrams } from '../../services/healthFormatting.js'

function formatNumber(value, unit) {
  if (unit.startsWith('kcal')) return formatCalories(value, { fallback: 'Saknas' }).replace(' kcal', ` ${unit}`)
  return formatGrams(value, { fallback: 'Saknas', unit })
}

function NutritionProgressCard({ nutrition, planning }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-nutrition-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h3 id="progress-nutrition-title">Faktiskt intag</h3>
          <span>Planerade måltider och AI-estimat hålls markerade separat.</span>
        </div>
      </div>
      <dl className="progress-detail-grid">
        <div><dt>Snitt kalorier</dt><dd>{formatNumber(nutrition.averageCalories, 'kcal/dag')}</dd></div>
        <div><dt>Snitt protein</dt><dd>{formatNumber(nutrition.averageProtein, 'g/dag')}</dd></div>
        <div><dt>Kalorimål nåddes</dt><dd>{nutrition.calorieGoalDays} dagar · {nutrition.calorieGoalPercent}%</dd></div>
        <div><dt>Proteinmål nåddes</dt><dd>{nutrition.proteinGoalDays} dagar · {nutrition.proteinGoalPercent}%</dd></div>
        <div><dt>Loggade måltider</dt><dd>{nutrition.mealCount}</dd></div>
        <div><dt>Bekräftade måltider</dt><dd>{nutrition.userConfirmedMealCount}</dd></div>
        <div><dt>AI-estimat</dt><dd>{nutrition.aiEstimatedMealCount}</dd></div>
        <div><dt>Vanligaste måltidstyp</dt><dd>{nutrition.mostCommonMealType || 'Saknas'}</dd></div>
      </dl>
      <div className="coach-note">
        Planering: {planning.plannedMealCount} planerade måltider denna vecka och {planning.generatedPlanCount} AI-genererade planer sparade.
      </div>
    </section>
  )
}

export default NutritionProgressCard
