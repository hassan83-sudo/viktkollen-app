import { useMemo, useState } from 'react'
import {
  buildReportCenterExportText,
  buildReportCenterModel,
  buildShareableReportCenterModel,
  reportCenterPeriods,
  reportCenterTypes,
  reportPhotoModes,
} from '../services/reports/reportCenterService.js'
import ReportTrendCard from './reports/ReportTrendCard.jsx'

const reportTypeDescriptions = {
  monthly: 'Samlad manadsrapport med befintlig shared analytics.',
  progress: 'Progressrapport med vikt, nutrition, aktivitet, prediction och achievements.',
  weekly: 'Samlad veckorapport med befintlig shared analytics.',
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function Metric({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function progressBucket(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'

  return String(Math.max(0, Math.min(100, Math.round(number / 10) * 10)))
}

function SharedReportPreview({ model }) {
  return (
    <>
      <div className="report-v3-card report-v3-overview">
        <div>
          <h3>{model.sharedReport.overview.title}</h3>
          <p>{model.sharedReport.periodLabel}</p>
        </div>
        <dl className="report-v3-summary">
          <Metric label="Vikt" value={model.sharedReport.overview.weight} />
          <Metric label="Nutrition" value={model.sharedReport.overview.nutrition} />
          <Metric label="Aktivitet" value={model.sharedReport.overview.activity} />
          <Metric label="Datakvalitet" value={model.sharedReport.dataQuality.text} />
        </dl>
      </div>
      <div className="report-v3-grid">
        {model.trendCards.slice(0, 4).map((card) => (
          <ReportTrendCard card={card} key={card.id} />
        ))}
      </div>
    </>
  )
}

function ProgressReportPreview({ model }) {
  if (model.empty) {
    return (
      <div className="report-v3-card report-center-empty" role="status">
        <h3>Rapporten fylls pa nar historik finns</h3>
        <p>Logga vikt, mat eller check-ins i vald period sa kan Viktkollen skapa en tryggare progressrapport.</p>
      </div>
    )
  }

  return (
    <>
      <div className="report-center-hero report-v3-card">
        <div>
          <p className="eyebrow">Progressrapport</p>
          <h3>{model.period.label}</h3>
          <p>{model.privacy.text}</p>
        </div>
        <dl className="report-v3-summary">
          <Metric label="Nuvarande vikt" value={model.overview.currentWeightLabel} />
          <Metric label="Malvikt" value={model.overview.goalWeightLabel} />
          <Metric label="Viktforandring" value={model.overview.weightChangeLabel} />
          <Metric label="Health Score" value={model.overview.healthScoreLabel} />
        </dl>
      </div>

      <div className="report-v3-grid">
        <article className="report-v3-card">
          <h4>Nutrition</h4>
          <dl className="report-v3-metrics">
            <Metric label="Snitt kalorier" value={model.nutrition.averageCaloriesLabel} />
            <Metric label="Snitt protein" value={model.nutrition.averageProteinLabel} />
            <Metric label="Proteinmal natt" value={model.nutrition.proteinGoalLabel} />
          </dl>
        </article>
        <article className="report-v3-card">
          <h4>Aktivitet</h4>
          <dl className="report-v3-metrics">
            <Metric label="Snittsteg" value={model.activity.averageStepsLabel} />
            <Metric label="Basta stegdag" value={model.activity.bestDayLabel} />
            <Metric label="Check-ins" value={model.activity.checkInConsistencyLabel} />
          </dl>
        </article>
        <article className="report-v3-card">
          <h4>Health Prediction</h4>
          <dl className="report-v3-metrics">
            <Metric label="Beraknad maldag" value={model.prediction.estimatedGoalDate} />
            <Metric label="kg/vecka" value={model.prediction.kgPerWeekLabel} />
            <Metric label="Health Score nasta vecka" value={model.prediction.healthScoreNextWeekLabel} />
            <Metric label="Confidence" value={model.prediction.confidence} />
          </dl>
          <p>{model.prediction.weightTrendLabel}</p>
        </article>
        <article className="report-v3-card">
          <h4>Achievements</h4>
          <dl className="report-v3-metrics">
            <Metric label="Senaste badge" value={model.achievements.latest} />
            <Metric label="Upplasta" value={model.achievements.unlockedCount} />
            <Metric label="Nasta badge" value={model.achievements.next} />
          </dl>
          <div className="report-progressbar" aria-label="Progress mot nasta achievement" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={model.achievements.nextProgressPercent}>
            <span className={`report-progress-${progressBucket(model.achievements.nextProgressPercent)}`} />
          </div>
        </article>
      </div>

      <div className="report-v3-grid">
        {model.trendCards.map((card) => (
          <ReportTrendCard card={card} key={card.id} />
        ))}
      </div>

      <article className="report-v3-card">
        <h4>Insikter</h4>
        <ul className="report-v3-list">
          {model.insights.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </article>

      <article className="report-v3-card">
        <h4>Progressbilder</h4>
        <p>{model.photos.summary}</p>
        {model.photos.items.length > 0 && (
          <div className="report-photo-preview">
            {model.photos.items.filter((photo) => photo.dataUrl || photo.url || photo.src).map((photo) => (
              <figure key={photo.id}>
                <img alt={`Progressbild fran ${photo.createdAt || photo.date || 'okant datum'}`} src={photo.dataUrl || photo.url || photo.src} />
                <figcaption>{photo.createdAt || photo.date || 'Datum saknas'} · {photo.weightLabel || 'Vikt saknas'}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </article>
    </>
  )
}

function ReportCenter({
  adaptiveCoachFeedback,
  checkIn,
  foods,
  goalsHabits,
  healthSnapshot,
  meals,
  monthlyReport,
  nutritionGoals,
  profile,
  progressPhotoItems,
  progressPhotos,
  selectedMealDate,
  weights,
  weeklyReportData,
}) {
  const [customEnd, setCustomEnd] = useState(selectedMealDate)
  const [customStart, setCustomStart] = useState(selectedMealDate)
  const [exportStatus, setExportStatus] = useState('')
  const [period, setPeriod] = useState('30d')
  const [photoMode, setPhotoMode] = useState('none')
  const [reportType, setReportType] = useState('progress')
  const [shareable, setShareable] = useState(false)
  const model = useMemo(() => {
    const input = {
      adaptiveCoachFeedback,
      checkIn,
      foods,
      goalsHabits,
      healthSnapshot,
      meals,
      monthlyReport,
      nutritionGoals,
      profile,
      progressPhotoItems,
      progressPhotos,
      today: selectedMealDate,
      weeklyReportData,
      weights,
    }
    const options = {
      customEnd,
      customStart,
      period,
      photoMode,
      reportType,
      shareable,
      today: selectedMealDate,
    }

    return shareable
      ? buildShareableReportCenterModel(input, options)
      : buildReportCenterModel(input, options)
  }, [
    adaptiveCoachFeedback,
    checkIn,
    customEnd,
    customStart,
    foods,
    goalsHabits,
    healthSnapshot,
    meals,
    monthlyReport,
    nutritionGoals,
    period,
    photoMode,
    profile,
    progressPhotoItems,
    progressPhotos,
    reportType,
    selectedMealDate,
    shareable,
    weeklyReportData,
    weights,
  ])

  function printReport() {
    window.print()
  }

  function exportReport() {
    const text = buildReportCenterExportText(model)
    const filename = `viktkollen-${model.reportType}-rapport-${model.period.end}.txt`

    downloadText(filename, text)
    setExportStatus(`Exporterade ${filename}.`)
  }

  return (
    <article className="panel report-center-panel" id="rapportcenter">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Export & Reports V2</p>
          <h2>Report Center</h2>
          <span>{reportTypeDescriptions[reportType]}</span>
        </div>
      </div>

      <div className="report-center-controls">
        <div className="segmented-control" aria-label="Valj rapporttyp">
          {reportCenterTypes.map((type) => (
            <button
              aria-pressed={reportType === type.id}
              className={reportType === type.id ? 'active' : ''}
              key={type.id}
              type="button"
              onClick={() => setReportType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>

        {reportType === 'progress' && (
          <div className="inline-form">
            <label>
              <span>Period</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                {reportCenterPeriods.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>
            {period === 'custom' && (
              <>
                <label>
                  <span>Start</span>
                  <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                </label>
                <label>
                  <span>Slut</span>
                  <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                </label>
              </>
            )}
            <label>
              <span>Progressbilder</span>
              <select value={photoMode} onChange={(event) => setPhotoMode(event.target.value)}>
                {reportPhotoModes.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="report-v3-card report-center-privacy">
        <h3>Privacy fore export</h3>
        <p>{model.privacy.text}</p>
        <ul className="report-v3-list">
          {model.privacy.excludes.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <label className="checkbox-row">
          <input checked={shareable} type="checkbox" onChange={(event) => setShareable(event.target.checked)} />
          <span>Skapa delbar rapport utan identifierare, privata anteckningar eller bilder.</span>
        </label>
      </div>

      <div className="report-v3-actions">
        <button className="secondary-button" type="button" onClick={printReport}>Skriv ut / spara PDF</button>
        <button type="button" onClick={exportReport}>Exportera text</button>
      </div>
      {exportStatus && <p className="analysis-status" role="status" aria-live="polite">{exportStatus}</p>}

      <section className="report-center-preview" aria-label="Rapportpreview">
        {model.sharedReport ? <SharedReportPreview model={model} /> : <ProgressReportPreview model={model} />}
      </section>
    </article>
  )
}

export default ReportCenter
