import { useMemo } from 'react'
import MealTimelineCard from './nutritionDashboard/MealTimelineCard.jsx'
import NutritionQualitySummary from './nutritionDataQuality/NutritionQualitySummary.jsx'
import NutritionComparisons from './nutritionDashboard/NutritionComparisons.jsx'
import NutritionInsightsPanel from './nutritionDashboard/NutritionInsightsPanel.jsx'
import NutritionProgress from './nutritionDashboard/NutritionProgress.jsx'
import { createNutritionDashboardModel } from './nutritionDashboard/nutritionDashboardViewModel.js'

function NutritionDashboard({ date, meals, nutritionGoals }) {
  const model = useMemo(
    () => createNutritionDashboardModel({
      date,
      meals,
      nutritionGoals,
    }),
    [date, meals, nutritionGoals],
  )

  return (
    <section className="nutrition-dashboard" aria-labelledby="nutrition-dashboard-title">
      <div className="nutrition-card nutrition-dashboard-card nutrition-dashboard-summary">
        <div className="nutrition-card-heading">
          <div>
            <p className="eyebrow">Nutrition Dashboard</p>
            <h3 id="nutrition-dashboard-title">{model.dateLabel}</h3>
          </div>
          <span className="nutrition-pill">{model.summary.mealCount} måltider</span>
        </div>

        <div className="nutrition-stat-grid nutrition-dashboard-stat-grid">
          <div><span>Kalorier</span><strong>{model.summary.calories}</strong></div>
          <div><span>Protein</span><strong>{model.summary.protein}</strong></div>
          <div><span>Kolhydrater</span><strong>{model.summary.carbs}</strong></div>
          <div><span>Fett</span><strong>{model.summary.fat}</strong></div>
          <div><span>Analyserade</span><strong>{model.summary.analyzedMealCount}</strong></div>
          <div><span>Delvis analyserade</span><strong>{model.summary.partiallyAnalyzedMealCount}</strong></div>
        </div>

        <div className="nutrition-dashboard-progress-list">
          <NutritionProgress progress={model.progress.protein} />
          <NutritionProgress progress={model.progress.calories} />
          <NutritionProgress progress={model.progress.carbs} />
          <NutritionProgress progress={model.progress.fat} />
          <NutritionProgress progress={model.progress.fiber} />
        </div>
      </div>

      <MealTimelineCard hasMeals={model.hasMeals} rows={model.timeline} />
      <NutritionQualitySummary quality={model.quality} title="Dagens datakvalitet" />
      <NutritionInsightsPanel insights={model.insights} />
      <NutritionComparisons comparisons={model.comparisons} />
    </section>
  )
}

export default NutritionDashboard
