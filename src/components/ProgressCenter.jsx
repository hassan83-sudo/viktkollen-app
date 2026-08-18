import { useMemo, useRef, useState } from 'react'
import {
  addDays,
  analyzeBodyMeasurements,
  analyzeWeights,
  bodyMeasurementTypes,
  buildProgressTimeline,
  copyWeightToDate,
  createMovingAverage,
  createProgressInsights,
  createProgressReport,
  createWeightProjection,
  exportProgressData,
  formatKg,
  formatSignedKg,
  getDailyWeights,
  getEmptyMeasurementDraft,
  getEmptyWeightDraft,
  getWeeklyAverages,
  measurementDraftToEntry,
  normalizeBodyMeasurements,
  normalizeGoalSettings,
  normalizeWeights,
  parseProgressImport,
  upsertMeasurement,
  upsertWeight,
  validateMeasurementDraft,
  validateWeightDraft,
  weightDraftToEntry,
  weightSources,
} from '../services/progressService.js'

const chartRanges = [
  { label: '7 dagar', value: '7' },
  { label: '30 dagar', value: '30' },
  { label: '90 dagar', value: '90' },
  { label: '6 mån', value: '180' },
  { label: '1 år', value: '365' },
  { label: 'Allt', value: 'all' },
  { label: 'Anpassat', value: 'custom' },
]

const defaultWeightFilters = {
  from: '',
  search: '',
  sort: 'newest',
  source: 'Alla',
  to: '',
}

const defaultTimelineFilters = {
  from: '',
  sort: 'newest',
  to: '',
  type: 'Alla',
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function formatNumber(value, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'Saknas'
  }

  return `${Number(value).toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
  })}${unit ? ` ${unit}` : ''}`
}

function getChartEntries(entries, range, customFrom, customTo) {
  if (range === 'all') {
    return entries
  }

  if (range === 'custom') {
    return entries.filter((entry) => {
      if (customFrom && entry.date < customFrom) {
        return false
      }

      if (customTo && entry.date > customTo) {
        return false
      }

      return true
    })
  }

  const endDate = entries.at(-1)?.date

  if (!endDate) {
    return []
  }

  const from = addDays(endDate, -Number(range) + 1)

  return entries.filter((entry) => entry.date >= from)
}

function makeChartPoints(entries, width, height, padding, minValue, maxValue) {
  const range = Math.max(maxValue - minValue, 1)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  return entries.map((entry, index) => {
    const x =
      entries.length === 1
        ? width / 2
        : padding + (index / (entries.length - 1)) * usableWidth
    const y = padding + ((range - (entry.value - minValue)) / range) * usableHeight

    return {
      ...entry,
      point: `${x.toFixed(1)},${y.toFixed(1)}`,
      x,
      y,
    }
  })
}

function WeightEditor({ draft, errors, isEditing, onCancel, onChange, onReset, onSubmit }) {
  const errorId = (field) => `weight-editor-${field}-error`

  return (
    <form className="progress-card weight-editor" onSubmit={onSubmit}>
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Viktredaktör</p>
          <h3>{isEditing ? 'Redigera viktpost' : 'Lägg till vikt'}</h3>
        </div>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>Datum</span>
          <input
            aria-describedby={errors.date ? errorId('date') : undefined}
            aria-invalid={errors.date ? 'true' : undefined}
            type="date"
            value={draft.date}
            onChange={(event) => onChange('date', event.target.value)}
          />
          {errors.date && <small className="field-error" id={errorId('date')}>{errors.date}</small>}
        </label>
        <label className="field">
          <span>Tid</span>
          <input
            aria-describedby={errors.time ? errorId('time') : undefined}
            aria-invalid={errors.time ? 'true' : undefined}
            type="time"
            value={draft.time}
            onChange={(event) => onChange('time', event.target.value)}
          />
          {errors.time && <small className="field-error" id={errorId('time')}>{errors.time}</small>}
        </label>
        <label className="field">
          <span>Vikt i kg</span>
          <input
            aria-describedby={errors.value ? errorId('value') : undefined}
            aria-invalid={errors.value ? 'true' : undefined}
            type="text"
            inputMode="decimal"
            value={draft.value}
            onChange={(event) => onChange('value', event.target.value)}
            placeholder="Till exempel 90,1"
          />
          {errors.value && <small className="field-error" id={errorId('value')}>{errors.value}</small>}
        </label>
        <label className="field">
          <span>Källa</span>
          <select value={draft.source} onChange={(event) => onChange('source', event.target.value)}>
            {weightSources.map((source) => <option key={source}>{source}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Anteckning</span>
        <input
          type="text"
          value={draft.note}
          onChange={(event) => onChange('note', event.target.value)}
          placeholder="Valfri notering"
        />
      </label>
      <div className="progress-actions">
        <button type="submit">{isEditing ? 'Spara ändringar' : 'Spara vikt'}</button>
        <button className="secondary-button" type="button" onClick={onReset}>Återställ</button>
        {isEditing && <button className="secondary-button" type="button" onClick={onCancel}>Avbryt</button>}
      </div>
    </form>
  )
}

function ProgressStatGrid({ analysis }) {
  const stats = [
    ['Senaste vikt', formatKg(analysis.latest?.value)],
    ['Startvikt', formatKg(analysis.start?.value)],
    ['Total förändring', formatSignedKg(analysis.changeTotal)],
    ['Senaste 7 dagar', formatSignedKg(analysis.change7)],
    ['Senaste 30 dagar', formatSignedKg(analysis.change30)],
    ['Veckotakt', formatSignedKg(analysis.weeklyRate)],
    ['Månadstakt', formatSignedKg(analysis.monthlyRate)],
    ['Genomsnitt', formatKg(analysis.averageWeight)],
    ['Högsta vikt', formatKg(analysis.highestWeight)],
    ['Lägsta vikt', formatKg(analysis.lowestWeight)],
    ['Vägningsdagar', `${analysis.registrationDays}`],
    ['Nuvarande serie', `${analysis.currentStreak} dagar`],
  ]

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Viktanalys</p>
          <h3>Bygger på {analysis.dateRangeLabel}</h3>
        </div>
      </div>
      <div className="progress-stat-grid">
        {stats.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="settings-note">
        Trend: {analysis.trend}. Stabilitet: {analysis.stability}. Analysen skiljer på för lite data och verklig stabilitet.
      </p>
    </section>
  )
}

function WeightChartV3({
  chartData,
  customFrom,
  customTo,
  goalWeight,
  onCustomFromChange,
  onCustomToChange,
  onRangeChange,
  onToggle,
  range,
  showGoal,
  showMovingAverage,
  showRaw,
  showWeeklyAverage,
  startWeight,
}) {
  const width = 420
  const height = 220
  const padding = 28
  const allSeriesValues = [
    ...chartData.raw.map((entry) => entry.value),
    ...chartData.movingAverage.map((entry) => entry.value),
    ...chartData.weeklyAverage.map((entry) => entry.value),
    goalWeight,
    startWeight,
  ].filter((value) => Number.isFinite(value))
  const minValue = allSeriesValues.length ? Math.min(...allSeriesValues) - 0.5 : 80
  const maxValue = allSeriesValues.length ? Math.max(...allSeriesValues) + 0.5 : 100
  const rawPoints = makeChartPoints(chartData.raw, width, height, padding, minValue, maxValue)
  const movingPoints = makeChartPoints(chartData.movingAverage, width, height, padding, minValue, maxValue)
  const weeklyPoints = makeChartPoints(chartData.weeklyAverage, width, height, padding, minValue, maxValue)
  const goalY = goalWeight
    ? padding + ((maxValue - goalWeight) / Math.max(maxValue - minValue, 1)) * (height - padding * 2)
    : null
  const startY = startWeight
    ? padding + ((maxValue - startWeight) / Math.max(maxValue - minValue, 1)) * (height - padding * 2)
    : null

  return (
    <section className="progress-card progress-chart-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Viktgraf</p>
          <h3>Daglig vikt, trend och mål</h3>
        </div>
      </div>

      <div className="segmented-control progress-range-control" aria-label="Välj tidsperiod för viktgraf">
        {chartRanges.map((option) => (
          <button
            className={range === option.value ? 'active' : ''}
            type="button"
            key={option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="progress-form-grid">
          <label className="field">
            <span>Från datum</span>
            <input type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} />
          </label>
          <label className="field">
            <span>Till datum</span>
            <input type="date" value={customTo} onChange={(event) => onCustomToChange(event.target.value)} />
          </label>
        </div>
      )}

      <div className="progress-chart-toggles">
        {[
          ['showRaw', 'Rå vikt', showRaw],
          ['showMovingAverage', '7-dagars medel', showMovingAverage],
          ['showWeeklyAverage', 'Veckosnitt', showWeeklyAverage],
          ['showGoal', 'Mål/start', showGoal],
        ].map(([key, label, checked]) => (
          <label className="toggle-row" key={key}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="progress-weight-chart" aria-label="Viktgraf. Dagsvärde använder senaste vägningen per datum.">
        {chartData.raw.length === 0 ? (
          <div className="progress-empty">
            <strong>Ingen viktdata för valt intervall.</strong>
            <span>Välj ett annat intervall eller lägg till en viktpost.</span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} role="img">
            <title>Viktgraf</title>
            <desc>Dagsvärde använder senaste vägningen per datum. Linjer visar rå vikt, glidande medelvärde och veckosnitt när de är aktiva.</desc>
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
            {showGoal && goalY !== null && <line className="goal-line" x1={padding} y1={goalY} x2={width - padding} y2={goalY} />}
            {showGoal && startY !== null && <line className="start-line" x1={padding} y1={startY} x2={width - padding} y2={startY} />}
            {showWeeklyAverage && <polyline className="weekly-average-line" points={weeklyPoints.map((entry) => entry.point).join(' ')} />}
            {showMovingAverage && <polyline className="moving-average-line" points={movingPoints.map((entry) => entry.point).join(' ')} />}
            {showRaw && <polyline className="weight-line" points={rawPoints.map((entry) => entry.point).join(' ')} />}
            {showRaw && rawPoints.map((entry) => (
              <circle key={entry.id} cx={entry.x} cy={entry.y} r="4.5">
                <title>{entry.date}: {formatKg(entry.value)}{entry.note ? ` - ${entry.note}` : ''}</title>
              </circle>
            ))}
          </svg>
        )}
      </div>
      <p className="settings-note">
        Regel: om flera vägningar finns samma dag används den senaste vägningen som dagsvärde.
      </p>
    </section>
  )
}

function WeightGoalCenter({ analysis, goalDraft, onChange, onSave, projection }) {
  const target = analysis.target
  const percent = target.completePercent

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Målcenter</p>
          <h3>Viktmål och milstolpar</h3>
        </div>
        <button type="button" onClick={onSave}>Spara mål</button>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>Startdatum</span>
          <input type="date" value={goalDraft.startDate} onChange={(event) => onChange('startDate', event.target.value)} />
        </label>
        <label className="field">
          <span>Måltakt per vecka (kg)</span>
          <input type="text" inputMode="decimal" value={goalDraft.targetRatePerWeek ?? ''} onChange={(event) => onChange('targetRatePerWeek', event.target.value)} />
        </label>
        <label className="field">
          <span>Önskat måldatum</span>
          <input type="date" value={goalDraft.desiredGoalDate} onChange={(event) => onChange('desiredGoalDate', event.target.value)} />
        </label>
      </div>
      <div className="progress-stat-grid">
        <div><span>Nuvarande vikt</span><strong>{formatKg(analysis.latest?.value)}</strong></div>
        <div><span>Kilo förändrat</span><strong>{formatSignedKg(target.kilosChanged)}</strong></div>
        <div><span>Kilo kvar</span><strong>{formatNumber(target.kilosRemaining, 'kg')}</strong></div>
        <div><span>Vägen klar</span><strong>{percent === null ? 'Saknas' : `${percent}%`}</strong></div>
        <div><span>Uppskattat måldatum</span><strong>{projection.estimatedGoalDate}</strong></div>
        <div><span>Registreringskvalitet</span><strong>{analysis.registrationDays >= 4 ? 'Bra' : 'För lite data'}</strong></div>
      </div>
      <div className="progress-bar-shell">
        <span style={{ width: `${Math.min(percent || 0, 100)}%` }}></span>
      </div>
      <p className="settings-note">
        Milstolpar: 10%, 25%, 50%, 75%, 90%, 100%. Prognosen är en uppskattning och inget löfte om resultat.
      </p>
    </section>
  )
}

function WeightHistory({
  filters,
  onClearFilters,
  onCopy,
  onDelete,
  onDeleteSelected,
  onEdit,
  onExportSelected,
  onFilterChange,
  onSelect,
  onSelectAll,
  onUnselectAll,
  selectedIds,
  weights,
}) {
  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Vikthistorik</p>
          <h3>{weights.length} träffar</h3>
        </div>
        <button className="secondary-button" type="button" onClick={onClearFilters}>Rensa filter</button>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>Sök</span>
          <input type="search" value={filters.search} onChange={(event) => onFilterChange('search', event.target.value)} />
        </label>
        <label className="field">
          <span>Källa</span>
          <select value={filters.source} onChange={(event) => onFilterChange('source', event.target.value)}>
            <option>Alla</option>
            {weightSources.map((source) => <option key={source}>{source}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Från datum</span>
          <input type="date" value={filters.from} onChange={(event) => onFilterChange('from', event.target.value)} />
        </label>
        <label className="field">
          <span>Till datum</span>
          <input type="date" value={filters.to} onChange={(event) => onFilterChange('to', event.target.value)} />
        </label>
      </div>
      <div className="progress-actions">
        <button className="secondary-button" type="button" onClick={onSelectAll}>Markera alla synliga</button>
        <button className="secondary-button" type="button" onClick={onUnselectAll}>Avmarkera alla</button>
        <button className="secondary-button" type="button" onClick={onExportSelected} disabled={selectedIds.length === 0}>Exportera markerade</button>
        <button className="secondary-button danger-button" type="button" onClick={onDeleteSelected} disabled={selectedIds.length === 0}>Ta bort markerade</button>
      </div>
      {weights.length === 0 ? (
        <div className="progress-empty">
          <strong>Inga viktposter matchar filtren.</strong>
          <span>Justera filtren eller lägg till en ny viktpost.</span>
        </div>
      ) : (
        <div className="progress-list">
          {weights.map((entry) => (
            <article className="progress-list-card" key={entry.id}>
              <label className="toggle-row">
                <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => onSelect(entry.id)} />
                <span>{entry.date} kl. {entry.time}</span>
              </label>
              <div>
                <strong>{formatKg(entry.value)}</strong>
                <span>{entry.source}{entry.note ? ` - ${entry.note}` : ''}</span>
              </div>
              <div className="progress-actions">
                <button className="secondary-button" type="button" onClick={() => onEdit(entry)}>Redigera</button>
                <button className="secondary-button" type="button" onClick={() => onCopy(entry)}>Kopiera</button>
                <button className="secondary-button danger-button" type="button" onClick={() => onDelete(entry.id)}>Ta bort</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function BodyMeasurementsPanel({ analysis, draft, errors, measurements, onChange, onDelete, onEdit, onReset, onSubmit }) {
  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Kroppsmått</p>
          <h3>{analysis.totalEntries} mätningar</h3>
        </div>
      </div>
      <form onSubmit={onSubmit}>
        <div className="progress-form-grid">
          <label className="field">
            <span>Datum</span>
            <input type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} />
            {errors.date && <small className="field-error">{errors.date}</small>}
          </label>
          <label className="field">
            <span>Måttyp</span>
            <select value={draft.type} onChange={(event) => onChange('type', event.target.value)}>
              {bodyMeasurementTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Värde i cm</span>
            <input type="text" inputMode="decimal" value={draft.value} onChange={(event) => onChange('value', event.target.value)} />
            {errors.value && <small className="field-error">{errors.value}</small>}
          </label>
          <label className="field">
            <span>Anteckning</span>
            <input type="text" value={draft.note} onChange={(event) => onChange('note', event.target.value)} />
          </label>
        </div>
        <div className="progress-actions">
          <button type="submit">Spara kroppsmått</button>
          <button className="secondary-button" type="button" onClick={onReset}>Återställ</button>
        </div>
      </form>
      {measurements.length === 0 ? (
        <div className="progress-empty">
          <strong>Inga kroppsmått ännu.</strong>
          <span>Lägg till ett mått för att se förändring över tid.</span>
        </div>
      ) : (
        <div className="progress-list">
          {analysis.byType.map((item) => (
            <article className="progress-list-card" key={item.type}>
              <div>
                <strong>{item.type}</strong>
                <span>Första: {formatNumber(item.first?.value, 'cm')} · Senaste: {formatNumber(item.latest?.value, 'cm')}</span>
              </div>
              <div>
                <strong>{item.change === null ? 'Saknas' : `${item.change > 0 ? '+' : ''}${item.change.toLocaleString('sv-SE')} cm`}</strong>
                <span>{item.percentChange === null ? 'För lite data' : `${item.percentChange}% förändring`}</span>
              </div>
            </article>
          ))}
          {measurements.slice().reverse().slice(0, 8).map((entry) => (
            <article className="progress-list-card" key={entry.id}>
              <div>
                <strong>{entry.type}: {formatNumber(entry.value, 'cm')}</strong>
                <span>{entry.date}{entry.note ? ` - ${entry.note}` : ''}</span>
              </div>
              <div className="progress-actions">
                <button className="secondary-button" type="button" onClick={() => onEdit(entry)}>Redigera</button>
                <button className="secondary-button danger-button" type="button" onClick={() => onDelete(entry.id)}>Ta bort</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ProgressReportsPanel({ onCreate, onDelete, onClear, reports }) {
  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Rapporter</p>
          <h3>Vecko- och månadsrapport</h3>
        </div>
        <div className="progress-actions">
          <button className="secondary-button" type="button" onClick={() => onCreate('week')}>Skapa vecka</button>
          <button className="secondary-button" type="button" onClick={() => onCreate('month')}>Skapa månad</button>
          <button className="secondary-button danger-button" type="button" onClick={onClear} disabled={reports.length === 0}>Rensa</button>
        </div>
      </div>
      {reports.length === 0 ? (
        <div className="progress-empty">
          <strong>Ingen rapporthistorik ännu.</strong>
          <span>Skapa en rapport när du vill spara en lokal sammanfattning.</span>
        </div>
      ) : (
        <div className="progress-list">
          {reports.slice(0, 8).map((report) => (
            <article className="progress-list-card" key={report.id}>
              <div>
                <strong>{report.period === 'month' ? 'Månadsrapport' : 'Veckorapport'} · v{report.version}</strong>
                <span>{new Date(report.createdAt).toLocaleString('sv-SE')}</span>
                <p>{report.insight}</p>
              </div>
              <div>
                <span>Viktförändring: {formatSignedKg(report.weightChange)}</span>
                <span>Kroppsmått: {report.measurementCount}</span>
                <span>Bilder: {report.photoCount}</span>
              </div>
              <button className="secondary-button danger-button" type="button" onClick={() => onDelete(report.id)}>Ta bort</button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ProgressTimeline({ filters, onFilterChange, timeline }) {
  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Framstegstidslinje</p>
          <h3>{timeline.length} händelser</h3>
        </div>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>Datatyp</span>
          <select value={filters.type} onChange={(event) => onFilterChange('type', event.target.value)}>
            <option>Alla</option>
            <option>Vikt</option>
            <option>Kroppsmått</option>
            <option>Bild</option>
            <option>AI</option>
          </select>
        </label>
        <label className="field">
          <span>Sortering</span>
          <select value={filters.sort} onChange={(event) => onFilterChange('sort', event.target.value)}>
            <option value="newest">Nyast först</option>
            <option value="oldest">Äldst först</option>
          </select>
        </label>
        <label className="field">
          <span>Från datum</span>
          <input type="date" value={filters.from} onChange={(event) => onFilterChange('from', event.target.value)} />
        </label>
        <label className="field">
          <span>Till datum</span>
          <input type="date" value={filters.to} onChange={(event) => onFilterChange('to', event.target.value)} />
        </label>
      </div>
      {timeline.length === 0 ? (
        <div className="progress-empty">
          <strong>Inga händelser matchar filtren.</strong>
          <span>Tidslinjen byggs dynamiskt från vikt, mått, bilder och AI-analyser.</span>
        </div>
      ) : (
        <div className="progress-timeline">
          {timeline.slice(0, 40).map((item) => (
            <article key={item.id}>
              <span className="progress-pill">{item.type}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.date}</small>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ProgressImportExport({
  estimatedSizeLabel,
  importStatus,
  onExport,
  onFileChange,
  onOpenImport,
  onToggleImages,
  includeImages,
  fileInputRef,
}) {
  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">Import/export</p>
          <h3>Framstegsdata JSON</h3>
        </div>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={includeImages} onChange={onToggleImages} />
        <span>Exportera med bilder</span>
      </label>
      <p className="settings-note">
        Uppskattad exportstorlek: {estimatedSizeLabel}. Auth, sessioner, tokens och Supabase-data exporteras aldrig.
      </p>
      <div className="progress-actions">
        <button type="button" onClick={onExport}>Exportera framstegsdata</button>
        <button className="secondary-button" type="button" onClick={onOpenImport}>Importera JSON</button>
        <input
          ref={fileInputRef}
          aria-label="Importera framstegsdata från JSON-fil"
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
        />
      </div>
      {importStatus && <p className="analysis-status" role="status" aria-live="polite">{importStatus}</p>}
    </section>
  )
}

function filterWeights(weights, filters) {
  const search = filters.search.trim().toLocaleLowerCase('sv-SE')

  return normalizeWeights(weights)
    .filter((entry) => {
      if (filters.source !== 'Alla' && entry.source !== filters.source) {
        return false
      }

      if (filters.from && entry.date < filters.from) {
        return false
      }

      if (filters.to && entry.date > filters.to) {
        return false
      }

      if (!search) {
        return true
      }

      return [entry.note, entry.source, entry.date].join(' ').toLocaleLowerCase('sv-SE').includes(search)
    })
    .sort(
      filters.sort === 'oldest'
        ? (first, second) => `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
        : (first, second) => `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`),
    )
}

function filterTimeline(timeline, filters) {
  return timeline
    .filter((item) => {
      if (filters.type !== 'Alla' && item.type !== filters.type) {
        return false
      }

      if (filters.from && item.date < filters.from) {
        return false
      }

      if (filters.to && item.date > filters.to) {
        return false
      }

      return true
    })
    .sort(filters.sort === 'oldest'
      ? (first, second) => first.date.localeCompare(second.date)
      : (first, second) => second.date.localeCompare(first.date))
}

function ProgressCenter({
  bodyAnalysisHistory,
  bodyMeasurements,
  goalSettings,
  onBodyMeasurementsChange,
  onGoalSettingsChange,
  onProgressReportsChange,
  onWeightsChange,
  profile,
  progressPhotos,
  progressReports,
  weights,
}) {
  const importInputRef = useRef(null)
  const normalizedWeights = useMemo(() => normalizeWeights(weights), [weights])
  const normalizedMeasurements = useMemo(() => normalizeBodyMeasurements(bodyMeasurements), [bodyMeasurements])
  const [weightDraft, setWeightDraft] = useState(() => getEmptyWeightDraft(normalizedWeights.at(-1)))
  const [measurementDraft, setMeasurementDraft] = useState(() => getEmptyMeasurementDraft())
  const [editingWeightId, setEditingWeightId] = useState('')
  const [editingMeasurementId, setEditingMeasurementId] = useState('')
  const [weightErrors, setWeightErrors] = useState({})
  const [measurementErrors, setMeasurementErrors] = useState({})
  const [weightFilters, setWeightFilters] = useState(defaultWeightFilters)
  const [timelineFilters, setTimelineFilters] = useState(defaultTimelineFilters)
  const [selectedWeightIds, setSelectedWeightIds] = useState([])
  const [chartRange, setChartRange] = useState('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [chartToggles, setChartToggles] = useState({
    showGoal: true,
    showMovingAverage: true,
    showRaw: true,
    showWeeklyAverage: false,
  })
  const [goalDraft, setGoalDraft] = useState(() => normalizeGoalSettings(goalSettings))
  const [includeImages, setIncludeImages] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const analysis = useMemo(() => analyzeWeights(normalizedWeights, profile), [normalizedWeights, profile])
  const projection = useMemo(() => createWeightProjection(normalizedWeights, profile), [normalizedWeights, profile])
  const measurementAnalysis = useMemo(() => analyzeBodyMeasurements(normalizedMeasurements), [normalizedMeasurements])
  const insights = useMemo(
    () => createProgressInsights({ bodyMeasurements: normalizedMeasurements, profile, weights: normalizedWeights }),
    [normalizedMeasurements, normalizedWeights, profile],
  )
  const dailyWeights = useMemo(() => getDailyWeights(normalizedWeights), [normalizedWeights])
  const chartRaw = useMemo(
    () => getChartEntries(dailyWeights, chartRange, customFrom, customTo),
    [chartRange, customFrom, customTo, dailyWeights],
  )
  const chartData = useMemo(
    () => ({
      movingAverage: createMovingAverage(chartRaw),
      raw: chartRaw,
      weeklyAverage: getChartEntries(getWeeklyAverages(normalizedWeights), chartRange, customFrom, customTo),
    }),
    [chartRange, chartRaw, customFrom, customTo, normalizedWeights],
  )
  const visibleWeights = useMemo(() => filterWeights(normalizedWeights, weightFilters), [normalizedWeights, weightFilters])
  const visibleTimeline = useMemo(
    () =>
      filterTimeline(
        buildProgressTimeline({
          bodyAnalysisHistory,
          bodyMeasurements: normalizedMeasurements,
          progressPhotos,
          weights: normalizedWeights,
        }),
        timelineFilters,
      ),
    [bodyAnalysisHistory, normalizedMeasurements, normalizedWeights, progressPhotos, timelineFilters],
  )
  const estimatedExport = useMemo(() => {
    const payload = exportProgressData({
      bodyMeasurements: normalizedMeasurements,
      goalSettings,
      includeImages,
      progressPhotos,
      progressReports,
      weights: normalizedWeights,
    })

    return `${Math.ceil(JSON.stringify(payload).length / 1024).toLocaleString('sv-SE')} kB`
  }, [goalSettings, includeImages, normalizedMeasurements, normalizedWeights, progressPhotos, progressReports])

  function resetWeightDraft() {
    setWeightDraft(getEmptyWeightDraft(normalizedWeights.at(-1)))
    setEditingWeightId('')
    setWeightErrors({})
  }

  function submitWeight(event) {
    event.preventDefault()
    const errors = validateWeightDraft(weightDraft)

    setWeightErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    const existing = normalizedWeights.find((entry) => entry.id === editingWeightId)
    const nextEntry = weightDraftToEntry(weightDraft, existing)

    onWeightsChange(upsertWeight(normalizedWeights, nextEntry))
    setWeightDraft(getEmptyWeightDraft(nextEntry))
    setEditingWeightId('')
    setWeightErrors({})
  }

  function editWeight(entry) {
    setEditingWeightId(entry.id)
    setWeightDraft({ ...entry, value: String(entry.value).replace('.', ',') })
    setWeightErrors({})
  }

  function deleteWeight(id) {
    if (window.confirm('Vill du ta bort den här viktposten?')) {
      onWeightsChange(normalizedWeights.filter((entry) => entry.id !== id))
      setSelectedWeightIds((current) => current.filter((entryId) => entryId !== id))
    }
  }

  function copyWeight(entry) {
    const date = window.prompt('Vilket datum ska kopian få? (ÅÅÅÅ-MM-DD)', entry.date)

    if (!date) {
      return
    }

    const time = window.prompt('Vilken tid ska kopian få? (TT:MM)', entry.time) || entry.time

    onWeightsChange(upsertWeight(normalizedWeights, copyWeightToDate(entry, date, time)))
  }

  function deleteSelectedWeights() {
    if (selectedWeightIds.length === 0) {
      return
    }

    if (window.confirm(`Vill du ta bort ${selectedWeightIds.length} markerade viktposter?`)) {
      onWeightsChange(normalizedWeights.filter((entry) => !selectedWeightIds.includes(entry.id)))
      setSelectedWeightIds([])
    }
  }

  function exportSelectedWeights() {
    const selectedWeights = normalizedWeights.filter((entry) => selectedWeightIds.includes(entry.id))

    downloadJson(`viktkollen-markerade-vikter-${new Date().toISOString().slice(0, 10)}.json`, {
      app: 'Viktkollen',
      exportedAt: new Date().toISOString(),
      format: 'viktkollen-selected-weights',
      weights: selectedWeights,
    })
  }

  function resetMeasurementDraft() {
    setMeasurementDraft(getEmptyMeasurementDraft())
    setEditingMeasurementId('')
    setMeasurementErrors({})
  }

  function submitMeasurement(event) {
    event.preventDefault()
    const errors = validateMeasurementDraft(measurementDraft)

    setMeasurementErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    const existing = normalizedMeasurements.find((entry) => entry.id === editingMeasurementId)

    onBodyMeasurementsChange(upsertMeasurement(normalizedMeasurements, measurementDraftToEntry(measurementDraft, existing)))
    resetMeasurementDraft()
  }

  function editMeasurement(entry) {
    setEditingMeasurementId(entry.id)
    setMeasurementDraft({ ...entry, value: String(entry.value).replace('.', ',') })
    setMeasurementErrors({})
  }

  function deleteMeasurement(id) {
    if (window.confirm('Vill du ta bort det här kroppsmåttet?')) {
      onBodyMeasurementsChange(normalizedMeasurements.filter((entry) => entry.id !== id))
    }
  }

  function saveGoalSettings() {
    onGoalSettingsChange(normalizeGoalSettings(goalDraft))
  }

  function createReport(period) {
    const duplicate = progressReports.find((report) => report.period === period && report.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10))

    if (duplicate && !window.confirm('Det finns redan en rapport för denna period idag. Skapa ändå?')) {
      return
    }

    onProgressReportsChange([
      createProgressReport({
        bodyMeasurements: normalizedMeasurements,
        period,
        profile,
        progressPhotos,
        weights: normalizedWeights,
      }),
      ...progressReports,
    ])
  }

  function deleteReport(id) {
    if (window.confirm('Vill du ta bort rapporten?')) {
      onProgressReportsChange(progressReports.filter((report) => report.id !== id))
    }
  }

  function clearReports() {
    if (window.confirm('Vill du rensa all lokal rapporthistorik?')) {
      onProgressReportsChange([])
    }
  }

  function exportProgress() {
    downloadJson(
      `viktkollen-framsteg-${new Date().toISOString().slice(0, 10)}.json`,
      exportProgressData({
        bodyMeasurements: normalizedMeasurements,
        goalSettings,
        includeImages,
        progressPhotos,
        progressReports,
        weights: normalizedWeights,
      }),
    )
  }

  function importProgress(event) {
    const file = event.target.files?.[0]

    if (!file) {
      setImportStatus('Ingen fil valdes.')
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      try {
        const parsed = parseProgressImport(JSON.parse(String(reader.result)))

        if (!parsed.ok) {
          setImportStatus(parsed.reason)
          return
        }

        const mode = window.prompt(
          `Importen innehåller ${parsed.summary.weightCount} viktposter, ${parsed.summary.bodyMeasurementCount} kroppsmått och ${parsed.summary.progressReportCount} rapporter.\nSkriv "slå ihop" eller "ersätt".`,
          'slå ihop',
        )

        if (!mode) {
          setImportStatus('Import avbröts.')
          return
        }

        if (mode.toLocaleLowerCase('sv-SE').includes('ers')) {
          if (!window.confirm('Detta ersätter endast lokal vikt- och framstegsdata. Vill du fortsätta?')) {
            setImportStatus('Import avbröts.')
            return
          }

          onWeightsChange(parsed.weights)
          onBodyMeasurementsChange(parsed.bodyMeasurements)
          onProgressReportsChange(parsed.progressReports)
        } else {
          onWeightsChange(normalizeWeights([...parsed.weights, ...normalizedWeights]))
          onBodyMeasurementsChange(normalizeBodyMeasurements([...parsed.bodyMeasurements, ...normalizedMeasurements]))
          onProgressReportsChange([...parsed.progressReports, ...progressReports])
        }

        onGoalSettingsChange(parsed.goalSettings)
        setGoalDraft(parsed.goalSettings)
        setImportStatus('Framstegsdata importerad.')
      } catch {
        setImportStatus('Importen misslyckades. Kontrollera JSON-filen.')
      } finally {
        event.target.value = ''
      }
    })
    reader.readAsText(file)
  }

  return (
    <article className="panel progress-center-panel" id="vikt">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Vikt, kroppsmått och framsteg</p>
          <h2>Framstegscenter</h2>
        </div>
      </div>

      <WeightEditor
        draft={weightDraft}
        errors={weightErrors}
        isEditing={Boolean(editingWeightId)}
        onCancel={resetWeightDraft}
        onChange={(key, value) => setWeightDraft((current) => ({ ...current, [key]: value }))}
        onReset={resetWeightDraft}
        onSubmit={submitWeight}
      />

      <ProgressStatGrid analysis={analysis} />

      <WeightGoalCenter
        analysis={analysis}
        goalDraft={goalDraft}
        onChange={(key, value) => setGoalDraft((current) => ({ ...current, [key]: value }))}
        onSave={saveGoalSettings}
        projection={projection}
      />

      <WeightChartV3
        chartData={chartData}
        customFrom={customFrom}
        customTo={customTo}
        goalWeight={analysis.target.goalWeight}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onRangeChange={setChartRange}
        onToggle={(key) => setChartToggles((current) => ({ ...current, [key]: !current[key] }))}
        range={chartRange}
        showGoal={chartToggles.showGoal}
        showMovingAverage={chartToggles.showMovingAverage}
        showRaw={chartToggles.showRaw}
        showWeeklyAverage={chartToggles.showWeeklyAverage}
        startWeight={analysis.target.startWeight}
      />

      <section className="progress-card">
        <div className="progress-card-heading">
          <div>
            <p className="eyebrow">Prognos</p>
            <h3>Lokal uppskattning</h3>
          </div>
          <span className="progress-pill">Osäkerhet: {projection.uncertainty}</span>
        </div>
        <div className="progress-stat-grid">
          <div><span>Målvikt</span><strong>{projection.estimatedGoalDate}</strong></div>
          <div><span>Om 4 veckor</span><strong>{formatKg(projection.weightIn4Weeks)}</strong></div>
          <div><span>Om 8 veckor</span><strong>{formatKg(projection.weightIn8Weeks)}</strong></div>
          <div><span>Om 12 veckor</span><strong>{formatKg(projection.weightIn12Weeks)}</strong></div>
        </div>
        <p className="settings-note">
          Baseras på {projection.basedOn}. Trenden per vecka är {formatSignedKg(projection.trendPerWeek)}. Prognosen visas bara när datan räcker och extrapolering begränsas.
        </p>
      </section>

      <WeightHistory
        filters={weightFilters}
        onClearFilters={() => setWeightFilters(defaultWeightFilters)}
        onCopy={copyWeight}
        onDelete={deleteWeight}
        onDeleteSelected={deleteSelectedWeights}
        onEdit={editWeight}
        onExportSelected={exportSelectedWeights}
        onFilterChange={(key, value) => setWeightFilters((current) => ({ ...current, [key]: value }))}
        onSelect={(id) =>
          setSelectedWeightIds((current) =>
            current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id])}
        onSelectAll={() => setSelectedWeightIds(visibleWeights.map((entry) => entry.id))}
        onUnselectAll={() => setSelectedWeightIds([])}
        selectedIds={selectedWeightIds}
        weights={visibleWeights}
      />

      <BodyMeasurementsPanel
        analysis={measurementAnalysis}
        draft={measurementDraft}
        errors={measurementErrors}
        measurements={normalizedMeasurements}
        onChange={(key, value) => setMeasurementDraft((current) => ({ ...current, [key]: value }))}
        onDelete={deleteMeasurement}
        onEdit={editMeasurement}
        onReset={resetMeasurementDraft}
        onSubmit={submitMeasurement}
      />

      <section className="progress-card">
        <div className="progress-card-heading">
          <div>
            <p className="eyebrow">Insikter</p>
            <h3>Lokala framstegsmönster</h3>
          </div>
        </div>
        {insights.length === 0 ? (
          <div className="progress-empty">
            <strong>För lite ny data för tydliga insikter.</strong>
            <span>Insikterna blir bättre när vikt, mått eller bilder loggas över tid.</span>
          </div>
        ) : (
          <div className="progress-list">
            {insights.map((insight) => (
              <article className="progress-list-card" key={insight.type}>
                <strong>{insight.text}</strong>
                <span>Bygger på: {insight.basis}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <ProgressReportsPanel
        reports={progressReports}
        onClear={clearReports}
        onCreate={createReport}
        onDelete={deleteReport}
      />

      <ProgressTimeline
        filters={timelineFilters}
        onFilterChange={(key, value) => setTimelineFilters((current) => ({ ...current, [key]: value }))}
        timeline={visibleTimeline}
      />

      <ProgressImportExport
        estimatedSizeLabel={estimatedExport}
        fileInputRef={importInputRef}
        importStatus={importStatus}
        includeImages={includeImages}
        onExport={exportProgress}
        onFileChange={importProgress}
        onOpenImport={() => importInputRef.current?.click()}
        onToggleImages={() => setIncludeImages((current) => !current)}
      />
    </article>
  )
}

export default ProgressCenter
