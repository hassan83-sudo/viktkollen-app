import { useMemo, useState } from 'react'
import { buildNutritionActionPlan } from '../services/nutrition/nutritionEngine.js'
import RecommendationCard from './nutritionRecommendations/RecommendationCard.jsx'

function flattenPlan(plan) {
  return [
    ...(plan.today || []),
    ...(plan.thisWeek || []),
    ...(plan.nextMonth || []),
  ]
}

function NutritionActionPlan({
  date,
  meals,
  nutritionGoals,
  onAddTemplate,
  templates,
  weights,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [dismissedIds, setDismissedIds] = useState([])
  const [status, setStatus] = useState('')
  const plan = useMemo(
    () => buildNutritionActionPlan({ date, meals, nutritionGoals, templates, weights }),
    [date, meals, nutritionGoals, templates, weights],
  )
  const recommendations = flattenPlan(plan).filter((item) => !dismissedIds.includes(item.id)).slice(0, 8)

  function addTemplate(template) {
    const added = onAddTemplate?.(template)

    setStatus(added ? `${template.name} lades till från mall.` : 'Mallen kunde inte läggas till.')
  }

  return (
    <section className="nutrition-card nutrition-action-plan" aria-labelledby="nutrition-action-plan-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Handlingsplan</p>
          <h3 id="nutrition-action-plan-title">Rekommendationer</h3>
        </div>
        <button aria-expanded={!collapsed} className="secondary-button" type="button" onClick={() => setCollapsed((current) => !current)}>
          {collapsed ? 'Visa plan' : 'Dölj plan'}
        </button>
      </div>
      {status && <p className="nutrition-edit-status" role="status">{status}</p>}
      {!collapsed && (
        recommendations.length ? (
          <div className="nutrition-recommendation-grid">
            {recommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                onAddTemplate={addTemplate}
                onDismiss={(id) => setDismissedIds((current) => [...current, id])}
              />
            ))}
          </div>
        ) : (
          <div className="nutrition-empty">
            <strong>Inga särskilda åtgärder föreslås just nu.</strong>
            <span>Registrera måltider och mål för mer riktade rekommendationer.</span>
          </div>
        )
      )}
    </section>
  )
}

export default NutritionActionPlan
