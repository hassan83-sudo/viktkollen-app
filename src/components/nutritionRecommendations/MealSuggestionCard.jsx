function MealSuggestionCard({ suggestion }) {
  if (!suggestion) return null

  return (
    <div className="meal-suggestion-card">
      <strong>{suggestion.name}</strong>
      <span>{suggestion.description}</span>
      <small>{suggestion.estimatedProteinRange} · {suggestion.estimatedCaloriesRange}</small>
    </div>
  )
}

export default MealSuggestionCard
