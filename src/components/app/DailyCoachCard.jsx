function getPercent(value, goal) {
  const current = Number(value)
  const target = Number(goal)

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return null
  }

  return Math.round(Math.min((current / target) * 100, 140))
}

function buildCoachAdvice({
  caloriesToday,
  calorieGoal,
  healthScore,
  proteinToday,
  proteinGoal,
  steps,
}) {
  const caloriePercent = getPercent(caloriesToday, calorieGoal)
  const proteinPercent = getPercent(proteinToday, proteinGoal)
  const safeHealthScore = Number(healthScore)
  const safeSteps = Number(steps)

  if (proteinPercent !== null && proteinPercent >= 80) {
    return `Bra jobbat! Du har nått ${proteinPercent} % av proteinmålet.`
  }

  if (Number.isFinite(safeSteps) && safeSteps < 6500) {
    return 'En promenad på 20 minuter kan förbättra dagens resultat.'
  }

  if (caloriePercent !== null && caloriePercent < 55) {
    return 'Planera en enkel måltid med protein innan kvällen.'
  }

  if (caloriePercent !== null && caloriePercent > 105) {
    return 'Du ligger lite över kalorimålet idag. Fokusera på nästa lugna, balanserade val.'
  }

  if (Number.isFinite(safeHealthScore) && safeHealthScore >= 75) {
    return 'Du ligger bra till idag - fortsätt så.'
  }

  return 'Drick lite mer vatten innan kvällen och välj ett litet nästa steg.'
}

function DailyCoachCard({
  caloriesToday,
  calorieGoal,
  healthScore,
  onAddMeal,
  onLogWeight,
  onScanFood,
  proteinToday,
  proteinGoal,
  steps,
}) {
  const advice = buildCoachAdvice({
    caloriesToday,
    calorieGoal,
    healthScore,
    proteinToday,
    proteinGoal,
    steps,
  })

  return (
    <section className="daily-coach-card" aria-label="AI Coach">
      <div className="daily-coach-heading">
        <div className="daily-coach-icon" aria-hidden="true">AI</div>
        <div>
          <p className="eyebrow">Personligt råd</p>
          <h2>AI Coach</h2>
        </div>
      </div>

      <p className="daily-coach-advice">{advice}</p>

      <div className="daily-coach-actions" aria-label="Snabbåtgärder">
        <button type="button" onClick={onAddMeal}>
          + Lägg till måltid
        </button>
        <button type="button" onClick={onLogWeight}>
          + Logga vikt
        </button>
        <button type="button" onClick={onScanFood}>
          + Skanna mat
        </button>
      </div>
    </section>
  )
}

export default DailyCoachCard
