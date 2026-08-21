import { memo, useMemo, useState } from 'react'

function getPercent(value, goal) {
  if (value === null || value === undefined || value === '') return null

  const current = Number(value)
  const target = Number(goal)

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return null
  }

  return Math.round(Math.min((current / target) * 100, 140))
}

function buildCoachAdviceList({
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
  const advice = []

  if (proteinPercent !== null) {
    advice.push(
      proteinPercent >= 80
        ? `Bra jobbat! Du har nått ${proteinPercent} % av proteinmålet.`
        : `Du har nått ${proteinPercent} % av proteinmålet. Kyckling, nötkött eller ägg kan hjälpa dig vidare.`,
    )
  }

  if (Number.isFinite(safeSteps) && safeSteps < 6500) {
    advice.push('En promenad på 20 minuter kan förbättra dagens resultat.')
  } else if (Number.isFinite(safeSteps)) {
    advice.push('Stegen ligger bra till idag. Håll tempot lugnt och jämnt.')
  }

  if (caloriePercent !== null && caloriePercent < 55) {
    advice.push('Planera en enkel måltid med protein innan kvällen.')
  }

  if (caloriePercent !== null && caloriePercent > 105) {
    advice.push('Du ligger lite över kalorimålet idag. Fokusera på nästa lugna, balanserade val.')
  }

  if (Number.isFinite(safeHealthScore) && safeHealthScore >= 75) {
    advice.push('Du ligger bra till idag - fortsätt så.')
  }

  advice.push('Drick lite mer vatten innan kvällen och välj ett litet nästa steg.')

  return [...new Set(advice)].slice(0, 4)
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
  showActions = true,
  steps,
  title = 'AI Coach',
}) {
  const adviceList = useMemo(() => buildCoachAdviceList({
    caloriesToday,
    calorieGoal,
    healthScore,
    proteinToday,
    proteinGoal,
    steps,
  }), [caloriesToday, calorieGoal, healthScore, proteinToday, proteinGoal, steps])
  const [adviceIndex, setAdviceIndex] = useState(0)
  const visibleAdvice = adviceList[adviceIndex % adviceList.length]

  return (
    <section className="daily-coach-card" aria-label="AI Coach">
      <div className="daily-coach-heading">
        <img
          className="daily-coach-robot"
          src="/viktkollen-ai-coach-robot.png"
          alt="Viktkollens AI Coach-robot med synlig hjärna"
          width="1312"
          height="1199"
          loading="lazy"
          decoding="async"
        />
        <div>
          <p className="eyebrow">Personligt råd</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="daily-coach-callout">
        <span>Just nu</span>
        <p className="daily-coach-advice">{visibleAdvice}</p>
        {visibleAdvice.includes('proteinmålet') && (
          <div className="overview-protein-foods" aria-label="Bra proteinkällor">
            <span>Kyckling</span>
            <span>Nötkött</span>
            <span>Ägg</span>
          </div>
        )}
        <button
          className="daily-coach-more"
          type="button"
          onClick={() => setAdviceIndex((current) => current + 1)}
        >
          Visa fler råd
        </button>
      </div>

      {showActions && (
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
      )}
    </section>
  )
}

export default memo(DailyCoachCard)