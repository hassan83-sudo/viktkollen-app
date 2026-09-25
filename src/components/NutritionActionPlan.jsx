import { useEffect, useMemo, useRef, useState } from 'react'
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
  dietaryPreferences,
  meals,
  nutritionGoals,
  onAddTemplate,
  templates,
  weights,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [dismissedIds, setDismissedIds] = useState([])
  const [status, setStatus] = useState('')
  const sectionRef = useRef(null)
  const headingRef = useRef(null)
  const pendingFocusIndexRef = useRef(null)
  const plan = useMemo(
    () => buildNutritionActionPlan({ date, dietaryPreferences, meals, nutritionGoals, templates, weights }),
    [date, dietaryPreferences, meals, nutritionGoals, templates, weights],
  )
  const recommendations = flattenPlan(plan).filter((item) => !dismissedIds.includes(item.id)).slice(0, 8)
  const visibleRecommendations = showAll ? recommendations : recommendations.slice(0, 2)

  // A11Y-8Q (8P finding, WCAG 2.4.3): "Dölj" removes its own card, and with
  // it the focused button. When that button had focus, focus moves to the
  // "Dölj" of the card that takes its place (the next one), else of the
  // previous card, else to the section heading. A mouse click in a browser
  // that does not focus buttons (Safari) leaves focus alone.
  function dismissRecommendation(id, index, hadFocus) {
    if (hadFocus) pendingFocusIndexRef.current = index
    setDismissedIds((current) => [...current, id])
  }

  useEffect(() => {
    const index = pendingFocusIndexRef.current
    if (index === null) return
    pendingFocusIndexRef.current = null
    const cards = [...(sectionRef.current?.querySelectorAll('.nutrition-recommendation-card') || [])]
    const card = cards[index] || cards[index - 1]
    const target = card?.querySelector('[data-recommendation-dismiss]') || card?.querySelector('button') || headingRef.current
    target?.focus()
  }, [dismissedIds])

  function addTemplate(template) {
    const added = onAddTemplate?.(template)

    setStatus(added ? `${template.name} lades till från mall.` : 'Mallen kunde inte läggas till.')
  }

  return (
    <section className="nutrition-card nutrition-action-plan" aria-labelledby="nutrition-action-plan-title" ref={sectionRef}>
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Handlingsplan</p>
          <h3 id="nutrition-action-plan-title" ref={headingRef} tabIndex={-1}>Rekommendationer</h3>
        </div>
        <button aria-expanded={!collapsed} className="nutrition-text-link" type="button" onClick={() => setCollapsed((current) => !current)}>
          {collapsed ? 'Visa' : 'Dölj'}
        </button>
      </div>
      {status && <p className="nutrition-edit-status" role="status">{status}</p>}
      {!collapsed && (
        recommendations.length ? (
          <div className="nutrition-recommendation-grid">
            {visibleRecommendations.map((recommendation, index) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                onAddTemplate={addTemplate}
                onDismiss={(id, hadFocus) => dismissRecommendation(id, index, hadFocus)}
              />
            ))}
            {recommendations.length > 2 && (
              <button className="nutrition-text-link" type="button" onClick={() => setShowAll((current) => !current)}>
                {showAll ? 'Visa färre' : 'Visa alla'}
              </button>
            )}
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
