import { useMemo } from 'react'
import { buildHealthDashboardV2Model } from '../services/healthDashboardV2.js'

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

  return (
    <section className="panel health-dashboard-v2" id="health-dashboard" aria-labelledby="health-dashboard-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Hälsodashboard</p>
          <h2 id="health-dashboard-heading">Trender, insikter och nästa steg</h2>
          <span>{model.display.subtitle}. {model.dataCoverage.text}</span>
        </div>
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
        Vald period är {model.selectedPeriod.label}. {model.weightSummary.textAlternative}
      </p>

      <div className="health-dashboard-grid">
        <Card actionHref="#vikt" actionText="Visa vikt" heading="Vikt" text={model.weightSummary.textAlternative}>
          <div className="health-dashboard-metrics">
            <Metric label="Start" value={model.weightSummary.startWeightLabel} />
            <Metric label="Nu" value={model.weightSummary.currentWeightLabel} />
            <Metric label="Mål" value={model.weightSummary.goalWeightLabel} />
            <Metric label="Period" value={model.weightSummary.periodChangeLabel} note={model.weightSummary.dataText} />
            <Metric label="Veckosnitt" value={model.weightSummary.weeklyAverageLabel} />
            <Metric label="Kvar" value={model.weightSummary.goalRemainingLabel} />
          </div>
        </Card>

        <Card actionHref="#nutrition-dashboard" actionText="Visa nutrition" heading="Nutrition" text={model.nutritionSummary.textAlternative}>
          <div className="health-dashboard-metrics">
            <Metric label="Loggade dagar" value={model.nutritionSummary.loggedDays} />
            <Metric label="Måltider" value={model.nutritionSummary.mealCount} />
            <Metric label="Protein" value={model.nutritionSummary.averageProteinLabel} />
            <Metric label="Energi" value={model.nutritionSummary.averageCaloriesLabel} />
          </div>
          <p>{model.nutritionSummary.proteinGoalText}</p>
        </Card>

        <Card actionHref="#checkin" actionText="Gå till check-in" heading="Aktivitet & check-in" text={model.activitySummary.textAlternative}>
          <div className="health-dashboard-metrics">
            <Metric label="Check-ins" value={model.activitySummary.checkInCount} />
            <Metric label="Steg snitt" value={model.activitySummary.averageStepsLabel} />
            <Metric label="Träning" value={model.activitySummary.trainingDays} />
            <Metric label="Energi" value={model.activitySummary.averageEnergyLabel} />
          </div>
          <p>{model.activitySummary.comparisonText}</p>
        </Card>

        {model.goalsSummary && (
          <Card actionHref="#mal-vanor" actionText="Visa mål & vanor" heading="Mål & vanor" text={model.goalsSummary.summary}>
            <p>{model.goalsSummary.positiveProgress}</p>
            <p>{model.goalsSummary.nextStep}</p>
          </Card>
        )}

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
    </section>
  )
}

export default HealthDashboardV2
