import { formatCalories, formatGrams } from '../../services/healthFormatting.js'

function formatNumber(value, unit) {
  return unit === 'kcal' ? formatCalories(value, { fallback: '0 kcal' }) : formatGrams(value, { fallback: `0 ${unit}`, unit })
}

function MonthlySummaryCards({ summary }) {
  const periodText = summary.elapsedDays < summary.calendarDays ? `av ${summary.elapsedDays} hittills` : `av ${summary.calendarDays}`
  const cards = [
    ['Registrerade dagar', `${summary.registeredDays} ${periodText}`, summary.coverage.label],
    ['Måltider', summary.mealCount.toLocaleString('sv-SE'), 'under månaden'],
    ['Protein i genomsnitt', formatNumber(summary.averages.proteinPerRegisteredDay, 'g'), 'per registrerad dag'],
    ['Kalorier i genomsnitt', formatNumber(summary.averages.caloriesPerRegisteredDay, 'kcal'), 'per registrerad dag'],
    ['Proteinmål uppnått', `${summary.proteinGoalDays} dagar`, summary.registeredDays ? `av ${summary.registeredDays} registrerade dagar` : 'mål saknas eller ingen data'],
    ['Kalorimål nära', `${summary.calorieGoalDays} dagar`, summary.registeredDays ? `av ${summary.registeredDays} registrerade dagar` : 'mål saknas eller ingen data'],
    ['Mest protein', summary.mostProteinDay?.date || 'Saknas', summary.mostProteinDay ? formatNumber(summary.mostProteinDay.totals.protein, 'g') : 'Ingen registrerad mat'],
    ['Högst kalorier', summary.highestCalorieDay?.date || 'Saknas', summary.highestCalorieDay ? formatNumber(summary.highestCalorieDay.totals.calories, 'kcal') : 'Ingen registrerad mat'],
  ]

  return (
    <div className="monthly-nutrition-card-grid">
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

export default MonthlySummaryCards
