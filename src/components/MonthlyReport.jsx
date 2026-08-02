function MetricCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MonthlyReport({ report }) {
  if (!report) {
    return null
  }

  return (
    <article className="panel report-panel" id="manadsrapport">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Lokal AI-rapport</p>
          <h2>Månadsrapport</h2>
        </div>
      </div>

      <div className="stats-grid">
        <MetricCard
          label="Viktförändring 30 dagar"
          value={report.weightChangeLabel}
        />
        <MetricCard label="Antal invägningar" value={report.weighInCount} />
        <MetricCard label="Genomsnittlig vikt" value={report.averageWeightLabel} />
        <MetricCard label="Bästa veckan" value={report.bestWeek} />
        <MetricCard label="Totalt antal måltider" value={report.totalMeals} />
        <MetricCard label="Vanligaste måltid" value={report.commonMealType} />
        <MetricCard
          label="Genomsnittligt proteinbetyg"
          value={report.averageProteinRating}
        />
        <MetricCard
          label="Genomsnittligt grönsaksbetyg"
          value={report.averageVegetableRating}
        />
      </div>

      <div className="report-card">
        <p className="report-heading">AI-sammanfattning</p>
        {report.aiSummary.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>

      <div className="report-card">
        <p className="report-heading">Tre största styrkor</p>
        {report.strengths.map((strength) => (
          <p key={strength}>✓ {strength}</p>
        ))}
      </div>

      <div className="report-card">
        <p className="report-heading">Tre förbättringsområden</p>
        {report.improvements.map((improvement) => (
          <p key={improvement}>• {improvement}</p>
        ))}
      </div>

      <div className="report-card">
        <p className="report-heading">Månadens prestation</p>
        <p>{report.monthlyAchievement}</p>
      </div>

      <div className="report-card">
        <p className="report-heading">Motivation</p>
        <p>{report.motivation}</p>
      </div>

      {report.goalsHabits && (
        <div className="report-card">
          <p className="report-heading">Mål & vanor</p>
          <p>{report.goalsHabits.summary}</p>
          <p>{report.goalsHabits.positiveProgress}</p>
        </div>
      )}

      <p className="estimate-note">
        Rapporten skapas lokalt från sparad data och är allmänt stöd för vanor,
        inte medicinsk rådgivning.
      </p>
    </article>
  )
}

export default MonthlyReport
