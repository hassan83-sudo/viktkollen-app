function ReportOverview({ model, onPrint }) {
  return (
    <section className="report-v3-card report-v3-overview" aria-labelledby={`${model.reportType}-report-overview`}>
      <div>
        <p className="eyebrow">{model.periodLabel}</p>
        <h3 id={`${model.reportType}-report-overview`}>{model.overview.title}</h3>
        <p>{model.overview.coverage}</p>
      </div>
      <button className="secondary-button" type="button" onClick={onPrint}>
        Skriv ut rapport
      </button>
      <dl className="report-v3-summary">
        <div><dt>Vikt</dt><dd>{model.overview.weight}</dd></div>
        <div><dt>Nutrition</dt><dd>{model.overview.nutrition}</dd></div>
        <div><dt>Aktivitet</dt><dd>{model.overview.activity}</dd></div>
      </dl>
    </section>
  )
}

export default ReportOverview
