function MealWeeklyReport({ weekSummary }) {
  return (
    <div className="chart-card">
      <div className="chart-toolbar">
        <div>
          <span>Premiumvy</span>
          <strong>Veckovy för måltider</strong>
        </div>
      </div>
      <p className="estimate-note">
        Antal analyser denna vecka: {weekSummary.analysisCount}
      </p>
      <p className="estimate-note">Proteintrend: {weekSummary.proteinTrend}</p>
      <p className="estimate-note">
        Grönsakstrend: {weekSummary.vegetableTrend}
      </p>
      <p className="estimate-note">
        Vanligaste förbättringsområde: {weekSummary.commonImprovement}
      </p>
      <p className="estimate-note">
        Bästa måltidsmönster: {weekSummary.bestPattern}
      </p>
    </div>
  )
}

export default MealWeeklyReport
