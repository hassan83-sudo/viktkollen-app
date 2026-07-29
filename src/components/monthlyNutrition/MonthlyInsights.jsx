function MonthlyInsights({ comparison, insights, nextMonthFocus }) {
  const comparisonLines = comparison?.hasComparison
    ? comparison.text
    : comparison?.reasons || []

  return (
    <section className="nutrition-card monthly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Insikter</p>
          <h3>Månadens signaler</h3>
        </div>
      </div>
      <div className="monthly-nutrition-list">
        <strong>Det viktigaste</strong>
        {insights.length ? insights.map((item) => <p key={item}>{item}</p>) : <p>Fortsätt registrera så blir månadsbilden tydligare.</p>}
      </div>
      <div className="monthly-nutrition-list">
        <strong>Jämfört med föregående månad</strong>
        {comparisonLines.map((item) => <p key={item}>{item}</p>)}
      </div>
      <div className="monthly-nutrition-list">
        <strong>Fokus nästa månad</strong>
        {nextMonthFocus.length ? nextMonthFocus.map((item) => <p key={item}>{item}</p>) : <p>Fortsätt med samma lugna registrering och använd mallar där de sparar tid.</p>}
      </div>
    </section>
  )
}

export default MonthlyInsights
