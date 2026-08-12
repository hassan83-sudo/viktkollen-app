import CoachSuggestions from './CoachSuggestions.jsx'

function formatReportDate(value) {
  if (!value) {
    return 'Tidpunkt saknas'
  }

  return new Date(value).toLocaleString('sv-SE')
}

function StatCard({ icon, label, value }) {
  return (
    <div className="coach-v2-stat">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function ReportHistory({ reports, onClearReports, onDeleteReport }) {
  if (reports.length === 0) {
    return (
      <div className="coach-v2-empty">
        <strong>Ingen coachhistorik ännu.</strong>
        <span>Skapa en rapport för att börja samla personliga coachinsikter.</span>
      </div>
    )
  }

  return (
    <div className="coach-v2-history">
      <div className="coach-v2-section-heading">
        <div>
          <p className="eyebrow">Coachhistorik</p>
          <h3>Tidigare rapporter</h3>
        </div>
        <button className="secondary-button" type="button" onClick={onClearReports}>
          Rensa historik
        </button>
      </div>

      <div className="coach-v2-report-list">
        {reports.slice(0, 6).map((report) => (
          <article className="coach-v2-report" key={report.id}>
            <div>
              <strong>{formatReportDate(report.createdAt)}</strong>
              <p>{report.coachConclusion}</p>
              <span>{report.motivation?.message}</span>
            </div>
            <button
              className="secondary-button danger-button"
              type="button"
              onClick={() => onDeleteReport(report.id)}
            >
              Ta bort
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

function AICoach({
  coachMessage,
  coachReport,
  coachReports,
  coachStatus,
  isGeneratingReport,
  onClearCoachReports,
  onCreateCoachReport,
  onDeleteCoachReport,
}) {
  const resolvedCoachStatus =
    coachStatus || 'AI-coachen använder dagens profil, vanor och loggar.'

  return (
    <article className="panel coach-panel coach-v2-panel" id="coach">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI-coach V2</p>
          <h2>Personlig coach</h2>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={onCreateCoachReport}
          disabled={isGeneratingReport}
        >
          {isGeneratingReport ? 'Analyserar...' : 'Skapa coachrapport'}
        </button>
      </div>

      <CoachSuggestions
        coachMessage={coachMessage}
        coachStatus={resolvedCoachStatus}
        isLoading={isGeneratingReport}
      />

      {!coachReport ? (
        <div className="coach-v2-empty">
          <strong>Redo för din första V2-rapport.</strong>
          <span>Skapa rapporten när du vill samla dagens konkreta råd, risker och nästa steg på ett ställe.</span>
          <small>Om remote AI inte svarar visas en trygg lokal fallback baserad på din sparade data.</small>
        </div>
      ) : (
        <div className="coach-v2-grid">
          <section className="coach-v2-card coach-v2-wide">
            <div className="coach-v2-section-heading">
              <div>
                <p className="eyebrow">Profil</p>
                <h3>{coachReport.coachProfile.name}</h3>
              </div>
              <span className="coach-v2-pill">{coachReport.coachProfile.activityLevel}</span>
            </div>
            <div className="coach-v2-stats">
              <StatCard icon="⚖" label="Nuvarande vikt" value={coachReport.coachProfile.currentWeight ? `${coachReport.coachProfile.currentWeight} kg` : 'Saknas'} />
              <StatCard icon="🎯" label="Målvikt" value={coachReport.coachProfile.goalWeight ? `${coachReport.coachProfile.goalWeight} kg` : 'Saknas'} />
              <StatCard icon="🥚" label="Proteinmål" value={coachReport.coachProfile.proteinTarget} />
              <StatCard icon="📏" label="Längd" value={coachReport.coachProfile.height ? `${coachReport.coachProfile.height} cm` : 'Saknas'} />
            </div>
          </section>

          <section className="coach-v2-card">
            <p className="eyebrow">Daglig analys</p>
            <h3>Idag</h3>
            <p>{coachReport.dailyAnalysis.summary}</p>
            <ul className="coach-v2-list">
              <li>Steg: {coachReport.dailyAnalysis.stepsLabel}</li>
              <li>Måltider: {coachReport.dailyAnalysis.mealCount ?? 0}</li>
              <li>Protein: {coachReport.dailyAnalysis.proteinLabel}</li>
              <li>Kalorier: {coachReport.dailyAnalysis.caloriesLabel}</li>
              <li>Fibrer: {coachReport.dailyAnalysis.fiberLabel}</li>
              <li>Kostmål: {coachReport.dailyAnalysis.nutritionGoalLabel}</li>
              <li>Humör: {coachReport.dailyAnalysis.mood}</li>
              <li>Sömn: {coachReport.dailyAnalysis.sleepLabel}</li>
              <li>{coachReport.dailyAnalysis.trainingLabel}</li>
            </ul>
          </section>

          <section className="coach-v2-card">
            <p className="eyebrow">Målcenter</p>
            <h3>Målspårning</h3>
            <div className="coach-v2-stats is-compact">
              <StatCard icon="%" label="Kvar" value={coachReport.goalCenter.percentRemainingLabel} />
              <StatCard icon="kg" label="Kilo kvar" value={coachReport.goalCenter.remainingKgLabel} />
            </div>
            <ul className="coach-v2-list">
              <li>Uppskattat måldatum: {coachReport.goalCenter.estimatedGoalDate}</li>
              <li>Senaste milstolpe: {coachReport.goalCenter.latestMilestone}</li>
              <li>Nästa milstolpe: {coachReport.goalCenter.nextMilestone}</li>
            </ul>
          </section>

          <section className="coach-v2-card">
            <p className="eyebrow">Framsteg V3</p>
            <h3>Vikt och kroppsmått</h3>
            <ul className="coach-v2-list">
              <li>Vikttrend: {coachReport.progressSummary?.trendLabel || 'Saknas'}</li>
              <li>Senaste 7 dagar: {coachReport.progressSummary?.weightChangeLabel || 'Saknas'}</li>
              <li>Registrering: {coachReport.progressSummary?.registrationLabel || 'Saknas'}</li>
              <li>Kroppsmått: {coachReport.progressSummary?.bodyMeasurementLabel || 'Saknas'}</li>
              <li>Prognos: {coachReport.progressSummary?.projectionLabel || 'För lite data'}</li>
            </ul>
            <div className="coach-note">
              {coachReport.progressSummary?.insightLabel || 'Fler framstegsloggar ger tydligare coachinsikter.'}
            </div>
          </section>

          <section className="coach-v2-card">
            <p className="eyebrow">Veckosammanfattning V2</p>
            <h3>Senaste 7 dagarna</h3>
            <ul className="coach-v2-list">
              <li>Viktförändring: {coachReport.weeklySummary.weightChangeLabel}</li>
              <li>Genomsnittliga kalorier: {coachReport.weeklySummary.calorieAverageLabel}</li>
              <li>Genomsnittligt protein: {coachReport.weeklySummary.proteinAverageLabel}</li>
              <li>Genomsnittliga fibrer: {coachReport.weeklySummary.fiberAverageLabel}</li>
              <li>Registrerade kostdagar: {coachReport.weeklySummary.registeredNutritionDays ?? 'Saknas'}</li>
              <li>Genomsnittliga steg: {coachReport.weeklySummary.stepsAverageLabel}</li>
              <li>Träningsdagar: {coachReport.weeklySummary.trainingDays}</li>
              <li>Incheckningar: {coachReport.weeklySummary.checkInCount}</li>
              <li>Bästa dag: {coachReport.weeklySummary.bestDay}</li>
              <li>Svåraste dag: {coachReport.weeklySummary.hardestDay}</li>
            </ul>
          </section>

          <section className="coach-v2-card">
            <p className="eyebrow">Motivation</p>
            <h3>Dagens ton</h3>
            <p>{coachReport.motivation.message}</p>
            {coachReport.nutritionInsights?.[0] ? (
              <div className="coach-note">
                Kostinsikt: {coachReport.nutritionInsights[0].text}
              </div>
            ) : null}
            <div className="coach-note">{coachReport.weeklySummary.conclusion}</div>
          </section>
        </div>
      )}

      <ReportHistory
        reports={coachReports}
        onClearReports={onClearCoachReports}
        onDeleteReport={onDeleteCoachReport}
      />
    </article>
  )
}

export default AICoach
