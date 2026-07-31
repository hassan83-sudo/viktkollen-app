function safeDisplay(value, fallback = 'Saknas') {
  if (typeof value !== 'string') return fallback

  const text = value.replace(/\s+/g, ' ').trim()
  const lower = text.toLocaleLowerCase('sv-SE')

  return text && !['true', 'false', 'undefined', 'null', '[object object]'].includes(lower)
    ? text
    : fallback
}

function formatEnergy(habits) {
  if (habits.averageEnergyLabel) return safeDisplay(habits.averageEnergyLabel)
  if (!Number.isFinite(habits.averageEnergy)) return 'Saknas'

  return `${habits.averageEnergy.toLocaleString('sv-SE')} av 10`
}

function HabitProgressCard({ habits }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-habits-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Vanor och check-ins</p>
          <h3 id="progress-habits-title">Rutiner</h3>
        </div>
      </div>
      <dl className="progress-detail-grid">
        <div><dt>Check-ins</dt><dd>{habits.checkInCount}</dd></div>
        <div><dt>Energi</dt><dd>{formatEnergy(habits)}</dd></div>
        <div><dt>Humör</dt><dd>{safeDisplay(habits.averageMood)}</dd></div>
        <div><dt>Steg</dt><dd>{habits.averageSteps ? `${habits.averageSteps.toLocaleString('sv-SE')} steg/dag` : 'Saknas'}</dd></div>
        <div><dt>Träningsdagar</dt><dd>{habits.trainingDays}</dd></div>
        <div><dt>Vanligaste träning</dt><dd>{safeDisplay(habits.trainingForm)}</dd></div>
        <div><dt>Slutförda vanor</dt><dd>{habits.completedHabits}/{habits.activeHabits}</dd></div>
        <div><dt>Bästa streak</dt><dd>{habits.bestStreak} dagar</dd></div>
      </dl>
    </section>
  )
}

export default HabitProgressCard
