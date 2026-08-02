function formatValue(value, unit = '') {
  if (!Number.isFinite(value)) return 'Saknas'

  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`
}

function SeriesDetails({ series }) {
  if (!series) return null

  const dataPoints = series.points?.filter((point) => point.hasData) || []

  return (
    <section className="health-drilldown-section">
      <h4>{series.label}</h4>
      <p>{series.textualSummary}</p>
      <dl className="health-dashboard-metrics compact">
        <div><dt>Bucket</dt><dd>{series.bucketType}</dd></div>
        <div><dt>Snitt</dt><dd>{formatValue(series.average, series.unit)}</dd></div>
        <div><dt>Lägsta</dt><dd>{formatValue(series.min, series.unit)}</dd></div>
        <div><dt>Högsta</dt><dd>{formatValue(series.max, series.unit)}</dd></div>
        <div><dt>Coverage</dt><dd>{series.coverage.actual} av {series.coverage.expected}</dd></div>
      </dl>
      {dataPoints.length ? (
        <ol className="health-dashboard-list compact">
          {dataPoints.slice(-8).map((point) => (
            <li key={`${series.id}-${point.id}`}>
              <strong>{point.label}</strong>
              <span>{formatValue(point.value, series.unit)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>Ingen registrerad data i vald period.</p>
      )}
    </section>
  )
}

function HealthDashboardDrilldown({ model, onClose }) {
  return (
    <div className="health-drilldown" role="region" aria-labelledby="health-drilldown-heading">
      <div className="health-drilldown-heading">
        <div>
          <p className="eyebrow">Fördjupning</p>
          <h3 id="health-drilldown-heading">{model.period.periodLabel}</h3>
          <span>{model.period.comparisonLabel}. {model.dataCoverage.text}</span>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Stäng</button>
      </div>

      <div className="health-dashboard-grid">
        <SeriesDetails series={model.trendSeries.weight} />
        {model.trendSeries.nutrition.map((series) => <SeriesDetails key={series.id} series={series} />)}
        {model.trendSeries.activity.map((series) => <SeriesDetails key={series.id} series={series} />)}
      </div>

      <section className="health-drilldown-section">
        <h4>Så beräknas dashboarden</h4>
        <p>
          Perioden använder lokala kalenderdatum. Saknade dagar visas som saknad data, inte som noll. Vikt använder
          representativa dagsvärden och nutrition använder faktiska måltider, inte planerade måltider.
        </p>
      </section>
    </div>
  )
}

export default HealthDashboardDrilldown
