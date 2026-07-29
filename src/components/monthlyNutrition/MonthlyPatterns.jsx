function formatOptional(value, fallback = 'Saknas') {
  return value || fallback
}

function MonthlyPatterns({ patterns }) {
  const cards = [
    ['Vanligast måltidstyp', formatOptional(patterns.mostCommonMealType?.type), patterns.mostCommonMealType ? `${patterns.mostCommonMealType.count} registreringar` : 'Ingen tydlig typ'],
    ['Återkommande måltid', formatOptional(patterns.recurringMeal?.text), patterns.recurringMeal ? `${patterns.recurringMeal.count} gånger` : 'Ingen upprepad måltid'],
    ['Frukostdagar', `${patterns.breakfastDays} dagar`, 'med frukost registrerad'],
    ['Lunchdagar', `${patterns.lunchDays} dagar`, 'med lunch registrerad'],
    ['Middagsdagar', `${patterns.dinnerDays} dagar`, 'med middag registrerad'],
    ['Sena mål', `${patterns.lateMeals} mål`, 'kvälls- eller nattmål'],
    ['Långa uppehåll', `${patterns.longGaps} tillfällen`, 'minst cirka 6 timmar'],
    ['Proteinvariation', `${Math.round(patterns.proteinConsistency)} g`, 'standardavvikelse'],
  ]

  return (
    <section className="nutrition-card monthly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Mönster</p>
          <h3>Rutiner under månaden</h3>
        </div>
      </div>
      <div className="monthly-pattern-grid">
        {cards.map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

export default MonthlyPatterns
