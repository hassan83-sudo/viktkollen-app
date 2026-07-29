import { formatKg } from '../../services/healthCalculations.js'
import { formatProgressChange } from '../../services/progress/progressAnalytics.js'

function SummaryCard({ label, status = 'neutral', value }) {
  return (
    <article className={`progress-summary-card is-${status}`}>
      <span>{label}</span>
      <strong>{value || 'Saknas'}</strong>
    </article>
  )
}

function ProgressSummaryCards({ analysis }) {
  const weight = analysis.weight
  const nutrition = analysis.nutrition
  const habits = analysis.habits
  const planning = analysis.planning

  return (
    <section className="progress-summary-grid" aria-label="Framsteg i korthet">
      <SummaryCard label="Nuvarande vikt" value={formatKg(weight.currentWeight, { fallback: 'Saknas' })} />
      <SummaryCard label="Startvikt" value={formatKg(weight.startWeight, { fallback: 'Saknas' })} />
      <SummaryCard label="Viktmål" value={formatKg(weight.goalWeight, { fallback: 'Saknas' })} />
      <SummaryCard label="Total förändring" status={weight.trendDirection === 'down' ? 'positive' : 'neutral'} value={formatProgressChange(weight.changeKg)} />
      <SummaryCard label="Kvar till mål" value={formatKg(weight.goalRemaining, { fallback: 'Saknas' })} />
      <SummaryCard label="Veckosnitt" value={weight.weeklyAverageChange === null ? 'Saknas' : formatProgressChange(weight.weeklyAverageChange)} />
      <SummaryCard label="Kalorimål" value={`${nutrition.calorieGoalPercent}%`} />
      <SummaryCard label="Proteinmål" status={nutrition.proteinGoalPercent >= 70 ? 'positive' : 'neutral'} value={`${nutrition.proteinGoalPercent}%`} />
      <SummaryCard label="Loggade måltider" value={nutrition.mealCount.toLocaleString('sv-SE')} />
      <SummaryCard label="Planerade måltider" value={planning.plannedMealCount.toLocaleString('sv-SE')} />
      <SummaryCard label="Check-ins" value={habits.checkInCount.toLocaleString('sv-SE')} />
      <SummaryCard label="Träningsdagar" value={habits.trainingDays.toLocaleString('sv-SE')} />
      <SummaryCard label="Aktiva vanor" value={habits.activeHabits.toLocaleString('sv-SE')} />
      <SummaryCard label="Aktuell streak" value={`${habits.currentStreak} dagar`} />
    </section>
  )
}

export default ProgressSummaryCards
