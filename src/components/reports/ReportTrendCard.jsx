import ReportTrendChart from './ReportTrendChart.jsx'

function ReportTrendCard({ card }) {
  return (
    <article className="report-v3-card report-trend-card">
      <div>
        <h4>{card.label}</h4>
        <p>{card.summary}</p>
      </div>
      <ReportTrendChart series={card.series} />
      <dl className="report-v3-metrics">
        <div><dt>Snitt</dt><dd>{card.averageLabel}</dd></div>
        <div><dt>Coverage</dt><dd>{card.coverageLabel}</dd></div>
      </dl>
      <a className="secondary-button" href={card.href}>Öppna källa</a>
    </article>
  )
}

export default ReportTrendCard
