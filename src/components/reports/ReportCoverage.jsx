function coveragePercent(coverage) {
  if (!coverage?.periodDays) return 0
  const signals = (coverage.weightDays || 0) + (coverage.mealDays || 0) + (coverage.checkInDays || 0)
  return Math.max(0, Math.min(100, Math.round((signals / Math.max(coverage.periodDays * 3, 1)) * 100)))
}

function ReportCoverage({ coverage, dataQuality }) {
  const percent = coveragePercent(coverage)

  return (
    <section className="report-v3-card" aria-labelledby="report-coverage-heading">
      <h3 id="report-coverage-heading">Datatäckning</h3>
      <p>{dataQuality.text}</p>
      <div
        className="report-progressbar"
        role="progressbar"
        aria-label="Rapportens datatäckning"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% datatäckning`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <dl className="report-v3-metrics">
        <div><dt>Måltidsdagar</dt><dd>{dataQuality.mealDays} av {dataQuality.periodDays}</dd></div>
        <div><dt>Viktmätningar</dt><dd>{dataQuality.weightDays}</dd></div>
        <div><dt>Check-ins</dt><dd>{dataQuality.checkInDays} av {dataQuality.periodDays}</dd></div>
        <div><dt>Confidence</dt><dd>{coverage?.confidence || 'missing'}</dd></div>
      </dl>
    </section>
  )
}

export default ReportCoverage
