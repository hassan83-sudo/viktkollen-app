import { useState } from 'react'
import { buildRecommendationExplanation } from '../../services/nutrition/nutritionEngine.js'
import MealSuggestionCard from './MealSuggestionCard.jsx'

const scopeLabels = {
  day: 'Idag',
  month: 'Nästa månad',
  week: 'Denna vecka',
}

const priorityLabels = {
  high: 'Hög prioritet',
  low: 'Låg prioritet',
  medium: 'Medelprioritet',
}

const confidenceLabels = {
  high: 'Tydligt underlag',
  low: 'Begränsat underlag',
  medium: 'Delvis tydligt underlag',
}

function RecommendationCard({ onAddTemplate, onDismiss, recommendation }) {
  const [expanded, setExpanded] = useState(false)
  const explanation = buildRecommendationExplanation(recommendation)

  return (
    <article className={`nutrition-recommendation-card is-${recommendation.priority}`}>
      <div>
        <span className="nutrition-pill">{scopeLabels[recommendation.scope] || recommendation.scope}</span>
        <span className="nutrition-pill">{priorityLabels[recommendation.priority]}</span>
        {recommendation.confidence !== 'high' && <span className="nutrition-pill">{confidenceLabels[recommendation.confidence]}</span>}
      </div>
      <h4>{recommendation.title}</h4>
      <p>{recommendation.message}</p>
      <strong>Nästa steg: {recommendation.action}</strong>
      <MealSuggestionCard suggestion={recommendation.suggestion} />
      <div className="nutrition-actions">
        <button aria-expanded={expanded} className="secondary-button" type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Dölj varför' : 'Visa varför'}
        </button>
        {recommendation.template && (
          <button
            aria-label={`Lägg till från mall ${recommendation.template.name}`}
            type="button"
            onClick={() => onAddTemplate(recommendation.template)}
          >
            Lägg till från mall
          </button>
        )}
        {recommendation.dismissible && (
          <button className="secondary-button" type="button" onClick={() => onDismiss(recommendation.id)}>
            Dölj
          </button>
        )}
      </div>
      {expanded && <p className="nutrition-recommendation-explanation">{explanation}</p>}
    </article>
  )
}

export default RecommendationCard
