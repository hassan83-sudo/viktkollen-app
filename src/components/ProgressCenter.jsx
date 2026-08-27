import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { formatDate, formatNumber as formatLocaleNumber } from '../i18n/format.js'

const chartRanges = [
  { value: '7' },
  { value: '30' },
  { value: '90' },
  { value: '180' },
  { value: '365' },
  { value: 'all' },
  { value: 'custom' },
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

const TREND_KEYS = {
  Nedåt: 'down',
  Uppåt: 'up',
  Stabil: 'stable',
  'För lite data': 'insufficient',
}

const STABILITY_KEYS = {
  Stabil: 'stable',
  'Normal variation': 'normal',
  'Stor variation': 'high',
  'För lite data': 'insufficient',
}

const UNCERTAINTY_KEYS = {
  hög: 'high',
  medel: 'medium',
  låg: 'low',
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

function formatNumber(value, unit = '', missingLabel = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return missingLabel
  }

  return `${formatLocaleNumber(value, {
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
  const { t } = useTranslation(['progress', 'common'])
  const errorId = (field) => `weight-editor-${field}-error`

  return (
    <form className="progress-card weight-editor" onSubmit={onSubmit}>
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.weightEditor.eyebrow')}</p>
          <h3>{isEditing ? t('center.weightEditor.editTitle') : t('center.weightEditor.addTitle')}</h3>
        </div>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>{t('center.weightEditor.date')}</span>
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
          <span>{t('center.weightEditor.time')}</span>
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
          <span>{t('center.weightEditor.weightKg')}</span>
          <input
            aria-describedby={errors.value ? errorId('value') : undefined}
            aria-invalid={errors.value ? 'true' : undefined}
            type="text"
            inputMode="decimal"
            value={draft.value}
            onChange={(event) => onChange('value', event.target.value)}
            placeholder={t('center.weightEditor.weightPlaceholder')}
          />
          {errors.value && <small className="field-error" id={errorId('value')}>{errors.value}</small>}
        </label>
        <label className="field">
          <span>{t('center.weightEditor.source')}</span>
          <select value={draft.source} onChange={(event) => onChange('source', event.target.value)}>
            {weightSources.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>{t('center.weightEditor.note')}</span>
        <input
          type="text"
          value={draft.note}
          onChange={(event) => onChange('note', event.target.value)}
          placeholder={t('center.weightEditor.notePlaceholder')}
        />
      </label>
      <div className="progress-actions">
        <button type="submit">
          {isEditing ? t('center.weightEditor.saveChanges') : t('center.weightEditor.saveWeight')}
        </button>
        <button className="secondary-button" type="button" onClick={onReset}>{t('common:reset')}</button>
        {isEditing && (
          <button className="secondary-button" type="button" onClick={onCancel}>{t('common:actions.cancel')}</button>
        )}
      </div>
    </form>
  )
}

function ProgressStatGrid({ analysis }) {
  const { t } = useTranslation(['progress', 'common'])
  const missing = t('center.missing')
  const rangeLabel = analysis.start && analysis.latest
    ? t('center.statGrid.dateRange', { from: analysis.start.date, to: analysis.latest.date })
    : t('center.insufficientData')
  const trendKey = TREND_KEYS[analysis.trend] || 'insufficient'
  const stabilityKey = STABILITY_KEYS[analysis.stability] || 'insufficient'
  const stats = [
    [t('center.statGrid.latestWeight'), formatKg(analysis.latest?.value, missing)],
    [t('center.statGrid.startWeight'), formatKg(analysis.start?.value, missing)],
    [t('center.statGrid.totalChange'), formatSignedKg(analysis.changeTotal, missing)],
    [t('center.statGrid.last7Days'), formatSignedKg(analysis.change7, missing)],
    [t('center.statGrid.last30Days'), formatSignedKg(analysis.change30, missing)],
    [t('center.statGrid.weeklyRate'), formatSignedKg(analysis.weeklyRate, missing)],
    [t('center.statGrid.monthlyRate'), formatSignedKg(analysis.monthlyRate, missing)],
    [t('center.statGrid.average'), formatKg(analysis.averageWeight, missing)],
    [t('center.statGrid.highestWeight'), formatKg(analysis.highestWeight, missing)],
    [t('center.statGrid.lowestWeight'), formatKg(analysis.lowestWeight, missing)],
    [t('center.statGrid.registrationDays'), `${analysis.registrationDays}`],
    [t('center.statGrid.currentStreak'), t('common:units.days', { count: analysis.currentStreak })],
  ]

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.statGrid.eyebrow')}</p>
          <h3>{t('center.statGrid.basedOn', { range: rangeLabel })}</h3>
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
        {t('center.statGrid.trendNote', {
          trend: t(`center.statGrid.trend.${trendKey}`),
          stability: t(`center.statGrid.stability.${stabilityKey}`),
        })}
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
  const { t } = useTranslation(['progress', 'common'])
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
          <p className="eyebrow">{t('center.chart.eyebrow')}</p>
          <h3>{t('center.chart.title')}</h3>
        </div>
      </div>

      <div className="segmented-control progress-range-control" aria-label={t('center.chart.rangeAria')}>
        {chartRanges.map((option) => (
          <button
            className={range === option.value ? 'active' : ''}
            type="button"
            key={option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {t(`center.chartRanges.${option.value}`)}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="progress-form-grid">
          <label className="field">
            <span>{t('center.chart.fromDate')}</span>
            <input type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} />
          </label>
          <label className="field">
            <span>{t('center.chart.toDate')}</span>
            <input type="date" value={customTo} onChange={(event) => onCustomToChange(event.target.value)} />
          </label>
        </div>
      )}

      <div className="progress-chart-toggles">
        {[
          ['showRaw', t('center.chart.showRaw'), showRaw],
          ['showMovingAverage', t('center.chart.showMovingAverage'), showMovingAverage],
          ['showWeeklyAverage', t('center.chart.showWeeklyAverage'), showWeeklyAverage],
          ['showGoal', t('center.chart.showGoal'), showGoal],
        ].map(([key, label, checked]) => (
          <label className="toggle-row" key={key}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="progress-weight-chart" aria-label={t('center.chart.chartAria')}>
        {chartData.raw.length === 0 ? (
          <div className="progress-empty">
            <strong>{t('center.chart.emptyTitle')}</strong>
            <span>{t('center.chart.emptyHint')}</span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} role="img">
            <title>{t('center.chart.svgTitle')}</title>
            <desc>{t('center.chart.svgDesc')}</desc>
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
        {t('center.chart.ruleNote')}
      </p>
    </section>
  )
}

function WeightGoalCenter({ analysis, goalDraft, onChange, onSave, projection }) {
  const { t } = useTranslation(['progress', 'common'])
  const missing = t('center.missing')
  const target = analysis.target
  const percent = target.completePercent

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.goal.eyebrow')}</p>
          <h3>{t('center.goal.title')}</h3>
        </div>
        <button type="button" onClick={onSave}>{t('center.goal.saveGoal')}</button>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>{t('center.goal.startDate')}</span>
          <input type="date" value={goalDraft.startDate} onChange={(event) => onChange('startDate', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('center.goal.weeklyRate')}</span>
          <input type="text" inputMode="decimal" value={goalDraft.targetRatePerWeek ?? ''} onChange={(event) => onChange('targetRatePerWeek', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('center.goal.desiredGoalDate')}</span>
          <input type="date" value={goalDraft.desiredGoalDate} onChange={(event) => onChange('desiredGoalDate', event.target.value)} />
        </label>
      </div>
      <div className="progress-stat-grid">
        <div><span>{t('center.goal.currentWeight')}</span><strong>{formatKg(analysis.latest?.value, missing)}</strong></div>
        <div><span>{t('center.goal.kilosChanged')}</span><strong>{formatSignedKg(target.kilosChanged, missing)}</strong></div>
        <div><span>{t('center.goal.kilosRemaining')}</span><strong>{formatNumber(target.kilosRemaining, 'kg', missing)}</strong></div>
        <div><span>{t('center.goal.progressComplete')}</span><strong>{percent === null ? missing : `${percent}%`}</strong></div>
        <div><span>{t('center.goal.estimatedGoalDate')}</span><strong>{projection.estimatedGoalDate}</strong></div>
        <div>
          <span>{t('center.goal.registrationQuality')}</span>
          <strong>{analysis.registrationDays >= 4 ? t('center.goal.qualityGood') : t('center.goal.qualityLow')}</strong>
        </div>
      </div>
      <div className="progress-bar-shell">
        <span style={{ width: `${Math.min(percent || 0, 100)}%` }}></span>
      </div>
      <p className="settings-note">
        {t('center.goal.milestonesNote')}
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
  const { t } = useTranslation(['progress', 'common'])
  const missing = t('center.missing')

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.history.eyebrow')}</p>
          <h3>{t('center.history.hits', { count: weights.length })}</h3>
        </div>
        <button className="secondary-button" type="button" onClick={onClearFilters}>{t('center.history.clearFilters')}</button>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>{t('center.history.search')}</span>
          <input type="search" value={filters.search} onChange={(event) => onFilterChange('search', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('center.history.source')}</span>
          <select value={filters.source} onChange={(event) => onFilterChange('source', event.target.value)}>
            <option value="Alla">{t('center.filters.all')}</option>
            {weightSources.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('center.history.fromDate')}</span>
          <input type="date" value={filters.from} onChange={(event) => onFilterChange('from', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('center.history.toDate')}</span>
          <input type="date" value={filters.to} onChange={(event) => onFilterChange('to', event.target.value)} />
        </label>
      </div>
      <div className="progress-actions">
        <button className="secondary-button" type="button" onClick={onSelectAll}>{t('center.history.selectAllVisible')}</button>
        <button className="secondary-button" type="button" onClick={onUnselectAll}>{t('center.history.unselectAll')}</button>
        <button className="secondary-button" type="button" onClick={onExportSelected} disabled={selectedIds.length === 0}>{t('center.history.exportSelected')}</button>
        <button className="secondary-button danger-button" type="button" onClick={onDeleteSelected} disabled={selectedIds.length === 0}>{t('center.history.deleteSelected')}</button>
      </div>
      {weights.length === 0 ? (
        <div className="progress-empty">
          <strong>{t('center.history.emptyTitle')}</strong>
          <span>{t('center.history.emptyHint')}</span>
        </div>
      ) : (
        <div className="progress-list">
          {weights.map((entry) => (
            <article className="progress-list-card" key={entry.id}>
              <label className="toggle-row">
                <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => onSelect(entry.id)} />
                <span>{t('center.history.atTime', { date: entry.date, time: entry.time })}</span>
              </label>
              <div>
                <strong>{formatKg(entry.value, missing)}</strong>
                <span>{entry.source}{entry.note ? ` - ${entry.note}` : ''}</span>
              </div>
              <div className="progress-actions">
                <button className="secondary-button" type="button" onClick={() => onEdit(entry)}>{t('center.history.edit')}</button>
                <button className="secondary-button" type="button" onClick={() => onCopy(entry)}>{t('center.history.copy')}</button>
                <button className="secondary-button danger-button" type="button" onClick={() => onDelete(entry.id)}>{t('common:remove')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function BodyMeasurementsPanel({ analysis, draft, errors, measurements, onChange, onDelete, onEdit, onReset, onSubmit }) {
  const { t } = useTranslation(['progress', 'common'])
  const missing = t('center.missing')

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.measurements.eyebrow')}</p>
          <h3>{t('center.measurements.count', { count: analysis.totalEntries })}</h3>
        </div>
      </div>
      <form onSubmit={onSubmit}>
        <div className="progress-form-grid">
          <label className="field">
            <span>{t('center.measurements.date')}</span>
            <input type="date" value={draft.date} onChange={(event) => onChange('date', event.target.value)} />
            {errors.date && <small className="field-error">{errors.date}</small>}
          </label>
          <label className="field">
            <span>{t('center.measurements.type')}</span>
            <select value={draft.type} onChange={(event) => onChange('type', event.target.value)}>
              {bodyMeasurementTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('center.measurements.valueCm')}</span>
            <input type="text" inputMode="decimal" value={draft.value} onChange={(event) => onChange('value', event.target.value)} />
            {errors.value && <small className="field-error">{errors.value}</small>}
          </label>
          <label className="field">
            <span>{t('center.measurements.note')}</span>
            <input type="text" value={draft.note} onChange={(event) => onChange('note', event.target.value)} />
          </label>
        </div>
        <div className="progress-actions">
          <button type="submit">{t('center.measurements.save')}</button>
          <button className="secondary-button" type="button" onClick={onReset}>{t('common:reset')}</button>
        </div>
      </form>
      {measurements.length === 0 ? (
        <div className="progress-empty">
          <strong>{t('center.measurements.emptyTitle')}</strong>
          <span>{t('center.measurements.emptyHint')}</span>
        </div>
      ) : (
        <div className="progress-list">
          {analysis.byType.map((item) => (
            <article className="progress-list-card" key={item.type}>
              <div>
                <strong>{item.type}</strong>
                <span>
                  {t('center.measurements.firstLatest', {
                    first: formatNumber(item.first?.value, 'cm', missing),
                    latest: formatNumber(item.latest?.value, 'cm', missing),
                  })}
                </span>
              </div>
              <div>
                <strong>
                  {item.change === null
                    ? missing
                    : `${item.change > 0 ? '+' : ''}${formatLocaleNumber(item.change)} cm`}
                </strong>
                <span>
                  {item.percentChange === null
                    ? t('center.insufficientData')
                    : t('center.measurements.percentChange', { percent: item.percentChange })}
                </span>
              </div>
            </article>
          ))}
          {measurements.slice().reverse().slice(0, 8).map((entry) => (
            <article className="progress-list-card" key={entry.id}>
              <div>
                <strong>{entry.type}: {formatNumber(entry.value, 'cm', missing)}</strong>
                <span>{entry.date}{entry.note ? ` - ${entry.note}` : ''}</span>
              </div>
              <div className="progress-actions">
                <button className="secondary-button" type="button" onClick={() => onEdit(entry)}>{t('center.measurements.edit')}</button>
                <button className="secondary-button danger-button" type="button" onClick={() => onDelete(entry.id)}>{t('common:remove')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ProgressReportsPanel({ onCreate, onDelete, onClear, reports }) {
  const { t } = useTranslation(['progress', 'common'])
  const missing = t('center.missing')

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.reports.eyebrow')}</p>
          <h3>{t('center.reports.title')}</h3>
        </div>
        <div className="progress-actions">
          <button className="secondary-button" type="button" onClick={() => onCreate('week')}>{t('center.reports.createWeek')}</button>
          <button className="secondary-button" type="button" onClick={() => onCreate('month')}>{t('center.reports.createMonth')}</button>
          <button className="secondary-button danger-button" type="button" onClick={onClear} disabled={reports.length === 0}>{t('center.reports.clear')}</button>
        </div>
      </div>
      {reports.length === 0 ? (
        <div className="progress-empty">
          <strong>{t('center.reports.emptyTitle')}</strong>
          <span>{t('center.reports.emptyHint')}</span>
        </div>
      ) : (
        <div className="progress-list">
          {reports.slice(0, 8).map((report) => (
            <article className="progress-list-card" key={report.id}>
              <div>
                <strong>
                  {report.period === 'month' ? t('center.reports.monthly') : t('center.reports.weekly')}
                  {' · '}
                  {t('center.reports.version', { version: report.version })}
                </strong>
                <span>{formatDate(report.createdAt, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}</span>
                <p>{report.insight}</p>
              </div>
              <div>
                <span>{t('center.reports.weightChange', { value: formatSignedKg(report.weightChange, missing) })}</span>
                <span>{t('center.reports.measurementCount', { count: report.measurementCount })}</span>
                <span>{t('center.reports.photoCount', { count: report.photoCount })}</span>
              </div>
              <button className="secondary-button danger-button" type="button" onClick={() => onDelete(report.id)}>{t('common:remove')}</button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ProgressTimeline({ filters, onFilterChange, timeline }) {
  const { t } = useTranslation(['progress', 'common'])

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.timeline.eyebrow')}</p>
          <h3>{t('center.timeline.events', { count: timeline.length })}</h3>
        </div>
      </div>
      <div className="progress-form-grid">
        <label className="field">
          <span>{t('center.timeline.dataType')}</span>
          <select value={filters.type} onChange={(event) => onFilterChange('type', event.target.value)}>
            <option value="Alla">{t('center.filters.all')}</option>
            <option value="Vikt">{t('center.timelineTypes.weight')}</option>
            <option value="Kroppsmått">{t('center.timelineTypes.bodyMeasure')}</option>
            <option value="Bild">{t('center.timelineTypes.photo')}</option>
            <option value="AI">{t('center.timelineTypes.ai')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('center.timeline.sorting')}</span>
          <select value={filters.sort} onChange={(event) => onFilterChange('sort', event.target.value)}>
            <option value="newest">{t('center.timeline.newestFirst')}</option>
            <option value="oldest">{t('center.timeline.oldestFirst')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('center.timeline.fromDate')}</span>
          <input type="date" value={filters.from} onChange={(event) => onFilterChange('from', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('center.timeline.toDate')}</span>
          <input type="date" value={filters.to} onChange={(event) => onFilterChange('to', event.target.value)} />
        </label>
      </div>
      {timeline.length === 0 ? (
        <div className="progress-empty">
          <strong>{t('center.timeline.emptyTitle')}</strong>
          <span>{t('center.timeline.emptyHint')}</span>
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
  const { t } = useTranslation(['progress', 'common'])

  return (
    <section className="progress-card">
      <div className="progress-card-heading">
        <div>
          <p className="eyebrow">{t('center.importExport.eyebrow')}</p>
          <h3>{t('center.importExport.title')}</h3>
        </div>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={includeImages} onChange={onToggleImages} />
        <span>{t('center.importExport.includeImages')}</span>
      </label>
      <p className="settings-note">
        {t('center.importExport.sizeNote', { size: estimatedSizeLabel })}
      </p>
      <div className="progress-actions">
        <button type="button" onClick={onExport}>{t('center.importExport.export')}</button>
        <button className="secondary-button" type="button" onClick={onOpenImport}>{t('center.importExport.importJson')}</button>
        <input
          ref={fileInputRef}
          aria-label={t('center.importExport.importAria')}
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
  view = 'all',
  weights,
}) {
  const { t } = useTranslation(['progress', 'common'])
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
      bodyAnalysisHistory,
      bodyMeasurements: normalizedMeasurements,
      goalSettings,
      includeImages,
      progressPhotos,
      progressReports,
      weights: normalizedWeights,
    })

    return `${formatLocaleNumber(Math.ceil(JSON.stringify(payload).length / 1024))} kB`
  }, [bodyAnalysisHistory, goalSettings, includeImages, normalizedMeasurements, normalizedWeights, progressPhotos, progressReports])

  const uncertaintyKey = UNCERTAINTY_KEYS[projection.uncertainty] || 'high'
  const missing = t('center.missing')

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
    if (window.confirm(t('center.confirms.deleteWeight'))) {
      onWeightsChange(normalizedWeights.filter((entry) => entry.id !== id))
      setSelectedWeightIds((current) => current.filter((entryId) => entryId !== id))
    }
  }

  function copyWeight(entry) {
    const date = window.prompt(t('center.prompts.copyDate'), entry.date)

    if (!date) {
      return
    }

    const time = window.prompt(t('center.prompts.copyTime'), entry.time) || entry.time

    onWeightsChange(upsertWeight(normalizedWeights, copyWeightToDate(entry, date, time)))
  }

  function deleteSelectedWeights() {
    if (selectedWeightIds.length === 0) {
      return
    }

    if (window.confirm(t('center.confirms.deleteWeights', { count: selectedWeightIds.length }))) {
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
    if (window.confirm(t('center.confirms.deleteMeasurement'))) {
      onBodyMeasurementsChange(normalizedMeasurements.filter((entry) => entry.id !== id))
    }
  }

  function saveGoalSettings() {
    onGoalSettingsChange(normalizeGoalSettings(goalDraft))
  }

  function createReport(period) {
    const duplicate = progressReports.find((report) => report.period === period && report.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10))

    if (duplicate && !window.confirm(t('center.confirms.duplicateReport'))) {
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
    if (window.confirm(t('center.confirms.deleteReport'))) {
      onProgressReportsChange(progressReports.filter((report) => report.id !== id))
    }
  }

  function clearReports() {
    if (window.confirm(t('center.confirms.clearReports'))) {
      onProgressReportsChange([])
    }
  }

  function exportProgress() {
    downloadJson(
      `viktkollen-framsteg-${new Date().toISOString().slice(0, 10)}.json`,
      exportProgressData({
        bodyAnalysisHistory,
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
      setImportStatus(t('center.importStatus.noFile'))
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
          t('center.prompts.importMode', {
            weights: parsed.summary.weightCount,
            measurements: parsed.summary.bodyMeasurementCount,
            reports: parsed.summary.progressReportCount,
          }),
          t('center.prompts.importModeDefault'),
        )

        if (!mode) {
          setImportStatus(t('center.importStatus.cancelled'))
          return
        }

        if (mode.toLocaleLowerCase('sv-SE').includes('ers')) {
          if (!window.confirm(t('center.confirms.replaceImport'))) {
            setImportStatus(t('center.importStatus.cancelled'))
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
        setImportStatus(t('center.importStatus.success'))
      } catch {
        setImportStatus(t('center.importStatus.failed'))
      } finally {
        event.target.value = ''
      }
    })
    reader.readAsText(file)
  }

  const show = (name) => view === 'all' || view === name
  const panelId = view === 'tools'
    ? 'progress-tools'
    : view === 'insights'
      ? 'progress-local-insights'
      : view === 'measurements'
        ? 'progress-measurements'
        : 'vikt'

  return (
    <article className="panel progress-center-panel" id={panelId}>
      {view === 'all' && (
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('center.eyebrow')}</p>
            <h2>{t('center.title')}</h2>
          </div>
        </div>
      )}

      {show('weight') && (
        <>
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
            <p className="eyebrow">{t('center.projection.eyebrow')}</p>
            <h3>{t('center.projection.title')}</h3>
          </div>
          <span className="progress-pill">
            {t('center.projection.uncertainty', {
              level: t(`center.projection.uncertaintyLevels.${uncertaintyKey}`),
            })}
          </span>
        </div>
        <div className="progress-stat-grid">
          <div><span>{t('center.goal.estimatedGoalDate')}</span><strong>{projection.estimatedGoalDate}</strong></div>
          <div><span>{t('center.projection.in4Weeks')}</span><strong>{formatKg(projection.weightIn4Weeks, missing)}</strong></div>
          <div><span>{t('center.projection.in8Weeks')}</span><strong>{formatKg(projection.weightIn8Weeks, missing)}</strong></div>
          <div><span>{t('center.projection.in12Weeks')}</span><strong>{formatKg(projection.weightIn12Weeks, missing)}</strong></div>
        </div>
        <p className="settings-note">
          {t('center.projection.note', {
            basedOn: projection.basedOn,
            trend: formatSignedKg(projection.trendPerWeek, missing),
          })}
        </p>
      </section>
      </>
      )}

      {show('tools') && (
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
      )}

      {show('measurements') && (
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
      )}

      {show('insights') && (
      <>
      <section className="progress-card">
        <div className="progress-card-heading">
          <div>
            <p className="eyebrow">{t('center.insights.eyebrow')}</p>
            <h3>{t('center.insights.title')}</h3>
          </div>
        </div>
        {insights.length === 0 ? (
          <div className="progress-empty">
            <strong>{t('center.insights.emptyTitle')}</strong>
            <span>{t('center.insights.emptyHint')}</span>
          </div>
        ) : (
          <div className="progress-list">
            {insights.map((insight) => (
              <article className="progress-list-card" key={insight.type}>
                <strong>{insight.text}</strong>
                <span>{t('center.insights.basedOn', { basis: insight.basis })}</span>
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
      </>
      )}

      {show('tools') && (
      <>
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
      </>
      )}
    </article>
  )
}

export default ProgressCenter
