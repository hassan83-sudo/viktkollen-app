import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { buildHealthDashboardV2Model } from '../services/healthDashboardV2.js'
import { buildAdaptiveCoachFeedbackSummary } from '../services/adaptiveCoachFeedback.js'
import { buildCoachActionSummary } from '../services/adaptiveCoachActions.js'
import { buildAdaptiveCoachTimelineSummary } from '../services/adaptiveCoachTimeline.js'
import { buildAdaptiveCoachPatternSummary } from '../services/adaptiveCoachPatterns.js'
import { buildAdaptiveCoachStrategy } from '../services/adaptiveCoachStrategy.js'

const HealthDashboardDrilldown = lazy(() => import('./HealthDashboardDrilldown.jsx'))

function Metric({ label, value, note }) {
  return (
    <div className="health-dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}

function Card({ actionHref, actionText, children, heading, text }) {
  return (
    <article className="health-dashboard-card">
      <div>
        <h3>{heading}</h3>
        {text && <p>{text}</p>}
      </div>
      {children}
      {actionHref && <a className="secondary-button" href={actionHref}>{actionText || 'Öppna'}</a>}
    </article>
  )
}

function TrendMiniChart({ series }) {
  const width = 320
  const height = 120
  const padding = 16
  const values = series?.points?.map((point) => point.value).filter(Number.isFinite) || []
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = Math.max(max - min, 1)
  const dataPoints = series?.points?.filter((point) => Number.isFinite(point.value)) || []
  const points = dataPoints.map((point, index) => {
    const x = dataPoints.length === 1 ? width / 2 : padding + (index / Math.max(dataPoints.length - 1, 1)) * (width - padding * 2)
    const y = padding + ((max - point.value) / range) * (height - padding * 2)

    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <div className="health-trend-chart">
      <p>{series?.textualSummary}</p>
      {points.length >= 2 ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.textualSummary}>
          <title>{series.label}</title>
          <desc>{series.textualSummary}. Tomma perioder räknas inte som noll.</desc>
          <polyline points={points.join(' ')} />
        </svg>
      ) : (
        <div className="health-chart-empty">Fler datapunkter behövs för diagram.</div>
      )}
    </div>
  )
}

function buildExportText(summary) {
  return [
    'Viktkollen Health Dashboard',
    `Period: ${summary.period}`,
    `Datum: ${summary.generatedFor}`,
    '',
    `Vikt: ${summary.weight}`,
    `Nutrition: ${summary.nutrition}`,
    `Aktivitet: ${summary.activity}`,
    `Jämförelse: ${summary.comparison}`,
    `Datatäckning: ${summary.coverage}`,
    '',
    'Highlights:',
    ...summary.highlights.map((item) => `- ${item}`),
  ].join('\n')
}

function ItemList({ emptyText, items }) {
  if (!items?.length) return <p>{emptyText}</p>

  return (
    <ul className="health-dashboard-list">
      {items.map((item) => (
        <li key={`${item.title}-${item.text}`}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
          {item.action && <small>{item.action}</small>}
        </li>
      ))}
    </ul>
  )
}

function HealthDashboardV2({
  adaptiveCoachFeedback = {},
  checkIn,
  checkIns = [],
  goalsHabits,
  healthSnapshot,
  meals = [],
  nutritionGoals = {},
  onPeriodChange,
  period = '30d',
  profile = {},
  today,
  weights = [],
}) {
  const [showDrilldown, setShowDrilldown] = useState(false)
  const drilldownButtonRef = useRef(null)
  const data = useMemo(() => ({
    checkIn,
    checkIns,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    profile,
    today,
    weights,
  }), [checkIn, checkIns, goalsHabits, healthSnapshot, meals, nutritionGoals, profile, today, weights])
  const model = useMemo(
    () => buildHealthDashboardV2Model(data, { analysisDate: today, period }),
    [data, period, today],
  )
  const coachFeedbackSummary = useMemo(
    () => buildAdaptiveCoachFeedbackSummary(adaptiveCoachFeedback, {
      now: today ? `${today}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, today],
  )
  const coachActionSummary = useMemo(
    () => buildCoachActionSummary(adaptiveCoachFeedback),
    [adaptiveCoachFeedback],
  )
  const coachTimelineSummary = useMemo(
    () => buildAdaptiveCoachTimelineSummary({ adaptiveCoachFeedback, goalsHabits }, {
      analysisDate: today,
      now: today ? `${today}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, goalsHabits, today],
  )
  const coachPatternSummary = useMemo(
    () => buildAdaptiveCoachPatternSummary({ ...data, adaptiveCoachFeedback }, {
      analysisDate: today,
      days: 30,
      now: today ? `${today}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, data, today],
  )
  const coachStrategy = useMemo(
    () => buildAdaptiveCoachStrategy({
      ...data,
      adaptiveCoachFeedback,
      patternSummary: coachPatternSummary,
    }, {
      analysisDate: today,
      now: today ? `${today}T12:00:00.000Z` : undefined,
    }),
    [adaptiveCoachFeedback, coachPatternSummary, data, today],
  )

  useEffect(() => {
    if (!showDrilldown) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setShowDrilldown(false)
        drilldownButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showDrilldown])

  function closeDrilldown() {
    setShowDrilldown(false)
    drilldownButtonRef.current?.focus()
  }

  function exportSummary() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const blob = new Blob([buildExportText(model.exportSummary)], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `viktkollen-health-dashboard-${model.analysisDate}.txt`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <section className="panel health-dashboard-v2" id="health-dashboard" aria-labelledby="health-dashboard-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Hälsodashboard</p>
          <h2 id="health-dashboard-heading">Trender, insikter och nästa steg</h2>
          <span>{model.display.subtitle}. {model.dataCoverage.text}</span>
        </div>
        <button
          aria-controls="health-dashboard-drilldown"
          aria-expanded={showDrilldown}
          className="secondary-button"
          ref={drilldownButtonRef}
          type="button"
          onClick={() => setShowDrilldown((current) => !current)}
        >
          {showDrilldown ? 'Dölj detaljer' : 'Visa detaljer'}
        </button>
        <button className="secondary-button" type="button" onClick={exportSummary}>
          Exportera översikt
        </button>
      </div>

      <div className="segmented-control health-period-toggle" aria-label="Välj period för hälsodashboard" role="group">
        {model.periods.map((entry) => (
          <button
            aria-pressed={model.selectedPeriod.id === entry.id}
            className={model.selectedPeriod.id === entry.id ? 'active' : ''}
            key={entry.id}
            type="button"
            onClick={() => onPeriodChange?.(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Vald period är {model.selectedPeriod.label}. Bucket: {model.period.bucketStrategy}. {model.weightSummary.textAlternative}
      </p>

      <div className="health-dashboard-grid">
        <Card actionHref="#vikt" actionText="Visa vikt" heading="Vikt" text={model.weightSummary.textAlternative}>
          <TrendMiniChart series={model.trendSeries.weight} />
          <div className="health-dashboard-metrics">
            <Metric label="Start" value={model.weightSummary.startWeightLabel} />
            <Metric label="Nu" value={model.weightSummary.currentWeightLabel} />
            <Metric label="Mål" value={model.weightSummary.goalWeightLabel} />
            <Metric label="Period" value={model.weightSummary.periodChangeLabel} note={model.weightSummary.dataText} />
            <Metric label="Veckosnitt" value={model.weightSummary.weeklyAverageLabel} />
            <Metric label="Kvar" value={model.weightSummary.goalRemainingLabel} />
          </div>
          <p>{model.weightSummary.trendGranularity}</p>
        </Card>

        <Card actionHref="#nutrition-dashboard" actionText="Visa nutrition" heading="Nutrition" text={model.nutritionSummary.textAlternative}>
          <div className="health-dashboard-metrics">
            <Metric label="Loggade dagar" value={model.nutritionSummary.loggedDays} />
            <Metric label="Måltider" value={model.nutritionSummary.mealCount} />
            <Metric label="Protein" value={model.nutritionSummary.averageProteinLabel} />
            <Metric label="Energi" value={model.nutritionSummary.averageCaloriesLabel} />
          </div>
          <p>{model.nutritionSummary.proteinGoalText}</p>
          <TrendMiniChart series={model.trendSeries.nutrition[1]} />
        </Card>

        <Card actionHref="#nutrition-scanner-v2" actionText="Öppna scanner" heading="Fotoanalys" text={model.photoAnalysisSummary?.text || 'Inga fotoanalyserade måltider i perioden.'}>
          <div className="health-dashboard-metrics">
            <Metric label="Fotoanalyser" value={model.photoAnalysisSummary?.photoMealCount ?? 0} />
            <Metric label="Redigerade" value={model.photoAnalysisSummary?.editedCount ?? 0} />
            <Metric label="Remote" value={model.photoAnalysisSummary?.providerCounts?.remote ?? 0} />
            <Metric label="Lokal" value={(model.photoAnalysisSummary?.providerCounts?.mock ?? 0) + (model.photoAnalysisSummary?.providerCounts?.local ?? 0)} />
            <Metric label="Matdatabas" value={model.photoAnalysisSummary?.dataSourceCounts?.nutritionDatabase ?? 0} />
            <Metric label="Låg confidence" value={model.photoAnalysisSummary?.lowConfidenceCount ?? 0} />
          </div>
          <p>Bilddata sparas inte i rapporter, sync eller backup.</p>
        </Card>

        <Card actionHref="#checkin" actionText="Gå till check-in" heading="Aktivitet & check-in" text={model.activitySummary.textAlternative}>
          <div className="health-dashboard-metrics">
            <Metric label="Check-ins" value={model.activitySummary.checkInCount} />
            <Metric label="Steg snitt" value={model.activitySummary.averageStepsLabel} />
            <Metric label="Träning" value={model.activitySummary.trainingDays} />
            <Metric label="Energi" value={model.activitySummary.averageEnergyLabel} />
          </div>
          <p>{model.activitySummary.comparisonText}</p>
          <TrendMiniChart series={model.trendSeries.activity[0]} />
        </Card>

        {model.goalsSummary && (
          <Card actionHref="#mal-vanor" actionText="Visa mål & vanor" heading="Mål & vanor" text={model.goalsSummary.summary}>
            <p>{model.goalsSummary.positiveProgress}</p>
            <p>{model.goalsSummary.nextStep}</p>
          </Card>
        )}

        <Card actionHref="#adaptive-coach" actionText="Visa coach" heading="Coach status" text={coachFeedbackSummary.weeklyStatus}>
          <div className="health-dashboard-metrics">
            <Metric label="Coach score" value={coachFeedbackSummary.completionRateLabel} />
            <Metric label="Aktiva actions" value={coachActionSummary.total} />
            <Metric label="Klara 30 dagar" value={coachTimelineSummary.completed} />
            <Metric label="Senaste händelse" value={coachTimelineSummary.latestEvent?.title || 'Saknas'} />
            <Metric label="Strategi" value={coachStrategy.title} />
            <Metric label="Mönster" value={coachPatternSummary.primaryPattern?.eligibility || 'insufficient'} />
            <Metric label="Actiontyp" value={coachActionSummary.latestAction?.linkedEntityType || 'Saknas'} />
            <Metric
              label="Senaste"
              note={coachActionSummary.latestAction?.title || coachFeedbackSummary.latestAction?.title}
              value={coachActionSummary.latestAction?.lastActionStatus || coachFeedbackSummary.latestAction?.statusLabel || 'Ingen feedback'}
            />
          </div>
          <p>{coachPatternSummary.text}</p>
          <p>{coachStrategy.explanation}</p>
        </Card>

        <Card actionHref="#insights-center" actionText="Visa insights" heading="Insights" text="Långsiktiga signaler från befintlig data.">
          <div className="health-dashboard-metrics">
            <Metric label="Insight Score" value={model.longTermInsights?.score ?? 'Saknas'} />
            <Metric label="Momentum" value={model.longTermInsights?.momentum ?? 'Saknas'} />
            <Metric label="Consistency" value={model.longTermInsights?.consistency ?? 'Saknas'} />
            <Metric label="Achievement score" value={model.achievements?.totalXp ?? 0} />
            <Metric label="Nivå" value={model.achievements?.levelTitle || 'Saknas'} />
            <Metric label="Delmål" value={model.achievements?.milestoneCount ?? 0} />
            <Metric label="Social" value={model.social?.friendCount ?? 0} />
            <Metric label="Delade mål" value={model.social?.sharedGoalCount ?? 0} />
            <Metric label="Sharing" value={model.social?.sharingReady ? 'Redo' : 'Privat'} />
          </div>
        </Card>

        <Card actionHref="#ai-insights" actionText="Visa insikter" heading="Personliga insikter" text={model.insightsSummary.positive}>
          <p>{model.insightsSummary.improvement}</p>
          <p>{model.insightsSummary.nextStep}</p>
        </Card>

        <Card heading="Jämförelse" text={model.comparisons.text}>
          <div className="health-dashboard-metrics">
            <Metric label="Måltider" value={model.comparisons.hasComparison ? model.comparisons.mealCountDelta : 'Saknas'} />
            <Metric label="Träning" value={model.comparisons.hasComparison ? model.comparisons.trainingDaysDelta : 'Saknas'} />
            <Metric label="Vikt" value={model.comparisons.hasComparison ? model.comparisons.weightChangeDelta ?? 'Saknas' : 'Saknas'} />
          </div>
        </Card>
      </div>

      <div className="health-dashboard-grid secondary">
        <Card heading="Framsteg" text="Databaserade signaler, utan skuld eller överdrifter.">
          <ItemList emptyText="När mer data finns visas framsteg här." items={model.progressHighlights} />
        </Card>
        <Card heading="Uppmärksamhet" text="Saknad data betyder inte ett dåligt resultat.">
          <ItemList emptyText="Inga tydliga uppmärksamhetspunkter just nu." items={model.attentionItems} />
        </Card>
        <Card heading="Nästa rimliga steg">
          <ItemList emptyText="Logga en vanlig dag så kan nästa steg bli tydligare." items={model.nextActions} />
        </Card>
      </div>

      {showDrilldown && (
        <div id="health-dashboard-drilldown">
          <Suspense fallback={<div className="health-drilldown" role="status">Laddar detaljer...</div>}>
            <HealthDashboardDrilldown model={model} onClose={closeDrilldown} />
          </Suspense>
        </div>
      )}
    </section>
  )
}

export default HealthDashboardV2
