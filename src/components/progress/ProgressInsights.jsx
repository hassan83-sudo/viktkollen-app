function ProgressInsights({ comparison, insights, weeklySummary }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-insights-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Smarta insikter</p>
          <h3 id="progress-insights-title">Prioriterat</h3>
        </div>
      </div>
      {insights.length ? (
        <ul className="progress-insight-list">
          {insights.map((insight) => (
            <li className={`is-${insight.tone}`} key={insight.text}>
              <strong>{insight.tone === 'positive' ? 'Styrka' : 'Notering'}</strong>
              <span>{insight.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="nutrition-empty"><span>Mer data behövs för tydliga insikter.</span></div>
      )}
      <div className="coach-note">
        Föregående period: {comparison.hasComparison ? `${comparison.mealCountDelta} måltider, ${comparison.trainingDaysDelta} träningsdagar, ${comparison.checkInDelta} check-ins.` : 'Jämförelse visas för 7, 30 och 90 dagar när data finns.'}
      </div>
      {weeklySummary && <div className="coach-note">Veckans sammanfattning: {weeklySummary}</div>}
    </section>
  )
}

export default ProgressInsights
