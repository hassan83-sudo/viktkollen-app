import { addDays } from '../../services/nutritionService.js'

function formatAverage(value, unit) {
  return value === null ? 'Saknas' : `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function WeeklyNutritionAnalysis({ onWeekChange, week, weekStart }) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Veckoanalys</p>
          <h3>Vecka från {weekStart}</h3>
        </div>
        <div className="nutrition-actions">
          <button className="secondary-button" type="button" onClick={() => onWeekChange(addDays(weekStart, -7))}>Föregående vecka</button>
          <button className="secondary-button" type="button" onClick={() => onWeekChange(addDays(weekStart, 7))}>Nästa vecka</button>
        </div>
      </div>
      {week.registeredDays === 0 ? (
        <div className="nutrition-empty">
          <strong>Ingen registrerad kostdata den här veckan.</strong>
          <span>Veckoanalysen visas när minst en måltid finns.</span>
        </div>
      ) : (
        <>
          <div className="nutrition-stat-grid">
            <div><span>Kalorier/dag</span><strong>{formatAverage(week.averageCalories, 'kcal')}</strong></div>
            <div><span>Bekräftade kcal/dag</span><strong>{formatAverage(week.averageUserVerifiedCalories, 'kcal')}</strong></div>
            <div><span>Protein/dag</span><strong>{formatAverage(week.averageProtein, 'g')}</strong></div>
            <div><span>Fibrer/dag</span><strong>{formatAverage(week.averageFiber, 'g')}</strong></div>
            <div><span>Registrerade dagar</span><strong>{week.registeredDays}</strong></div>
            <div><span>Måltider totalt</span><strong>{week.totalMeals}</strong></div>
            <div><span>Proteinmål nått</span><strong>{week.proteinGoalDays} dagar</strong></div>
          </div>
          <div className="nutrition-mini-list">
            <span>Mest konsekventa dag: {week.mostConsistentDay}</span>
            <span>Högst protein: {week.highestProteinDay}</span>
            <span>Flest registreringar: {week.mostLoggedDay}</span>
            {week.provenance?.summaryText && <span>Underlag: {week.provenance.summaryText}</span>}
            <span>Kalorimål nära/uppnått: {week.calorieGoalDays} dagar</span>
            <span>Fibermål nära/uppnått: {week.fiberGoalDays} dagar</span>
          </div>
        </>
      )}
    </section>
  )
}

export default WeeklyNutritionAnalysis
