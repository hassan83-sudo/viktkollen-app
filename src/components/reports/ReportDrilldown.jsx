import { useEffect, useRef } from 'react'
import { buildReportDrilldownModel } from '../../services/reportDrilldownModel.js'
import ReportComparisonCard from './ReportComparisonCard.jsx'
import ReportCoverage from './ReportCoverage.jsx'
import ReportHighlights from './ReportHighlights.jsx'
import ReportTrendCard from './ReportTrendCard.jsx'

function ReportDrilldown({ onClose, report, reportType, sectionId }) {
  const headingRef = useRef(null)
  const model = buildReportDrilldownModel(report, sectionId, { reportType })

  useEffect(() => {
    headingRef.current?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className="report-drilldown" aria-labelledby="report-drilldown-heading" role="region">
      <div className="report-drilldown-heading">
        <div>
          <p className="eyebrow">{model.period?.periodLabel || 'Rapportdetalj'}</p>
          <h3 id="report-drilldown-heading" ref={headingRef} tabIndex="-1">{model.title}</h3>
          <p>{model.summary}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Tillbaka till rapport</button>
      </div>

      <div className="report-v3-grid">
        {model.trendCards.length ? (
          model.trendCards.map((card) => <ReportTrendCard card={card} key={card.id} />)
        ) : (
          <section className="report-v3-card">
            <h4>Trend</h4>
            <p>Det finns inte tillräckligt med trenddata för den här sektionen ännu.</p>
          </section>
        )}
      </div>

      <ReportCoverage coverage={model.coverage} dataQuality={{
        checkInDays: model.coverage?.checkInDays ?? 0,
        mealDays: model.coverage?.mealDays ?? 0,
        periodDays: model.coverage?.periodDays ?? 0,
        text: model.coverage?.text || 'Datatäckning saknas.',
        weightDays: model.coverage?.weightDays ?? 0,
      }} />

      {model.comparison.length > 0 && (
        <>
          <h4>Jämförelse</h4>
          <div className="report-v3-grid compact">
            {model.comparison.map((card) => <ReportComparisonCard card={card} key={card.id} />)}
          </div>
        </>
      )}

      <ReportHighlights items={model.highlights} title="Bevis & highlights" />
      <ReportHighlights emptyText="Inga särskilda datapunkter." items={model.evidence.map((text, index) => ({ text, title: `Datapunkt ${index + 1}` }))} title="Datapunkter" />
      <ReportHighlights items={model.attentionItems} title="Uppmärksamhet" />

      <section className="report-v3-card">
        <h4>Så beräknas det</h4>
        <p>{model.textualExplanation}</p>
        <a className="secondary-button" href={model.destination}>Öppna relevant vy</a>
      </section>
    </section>
  )
}

export default ReportDrilldown
