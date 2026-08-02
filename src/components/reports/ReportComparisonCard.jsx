const statusLabels = {
  changed: 'Förändrat',
  improved: 'Förbättrat',
  insufficient: 'För lite data',
  notComparable: 'Inte jämförbart',
  stable: 'Stabilt',
}

function ReportComparisonCard({ card }) {
  return (
    <article className="report-v3-card report-comparison-card">
      <div className="report-v3-card-heading">
        <h4>{card.title}</h4>
        <span>{statusLabels[card.status] || card.status}</span>
      </div>
      <p>{card.explanation}</p>
      <dl className="report-v3-metrics">
        <div><dt>Nu</dt><dd>{card.currentLabel}</dd></div>
        <div><dt>Före</dt><dd>{card.previousLabel}</dd></div>
        <div><dt>Skillnad</dt><dd>{card.differenceLabel}</dd></div>
        <div><dt>Procent</dt><dd>{card.percentLabel}</dd></div>
      </dl>
      {card.coverageLabel && <small>{card.coverageLabel}</small>}
    </article>
  )
}

export default ReportComparisonCard
