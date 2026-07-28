function formatNumber(value, unit) {
  return `${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('sv-SE')} ${unit}`
}

function WeeklyNutritionSummaryCards({ summary }) {
  const cards = [
    ['Protein i genomsnitt', formatNumber(summary.averages.proteinPerRegisteredDay, 'g'), 'per registrerad dag'],
    ['Kalorier i genomsnitt', formatNumber(summary.averages.caloriesPerRegisteredDay, 'kcal'), 'per registrerad dag'],
    ['Registrerade dagar', `${summary.registeredDays} av 7`, summary.coverage.label],
    ['Måltider', summary.mealCount.toLocaleString('sv-SE'), 'under veckan'],
    ['Proteinmål uppnått', `${summary.proteinGoalDays} dagar`, summary.registeredDays ? `av ${summary.registeredDays} registrerade dagar` : 'mål saknas eller ingen data'],
    ['Kalorimål nära', `${summary.calorieGoalDays} dagar`, summary.registeredDays ? `av ${summary.registeredDays} registrerade dagar` : 'mål saknas eller ingen data'],
    ['Mest protein', summary.mostProteinDay ? summary.mostProteinDay.dayName : 'Saknas', summary.mostProteinDay ? formatNumber(summary.mostProteinDay.totals.protein, 'g') : 'Ingen registrerad mat'],
    ['Högst kalorier', summary.highestCalorieDay ? summary.highestCalorieDay.dayName : 'Saknas', summary.highestCalorieDay ? formatNumber(summary.highestCalorieDay.totals.calories, 'kcal') : 'Ingen registrerad mat'],
  ]

  return (
    <div className="weekly-nutrition-card-grid">
      {cards.map(([label, value, detail]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  )
}

export default WeeklyNutritionSummaryCards
