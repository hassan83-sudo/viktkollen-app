import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TEST_FEEDBACK_ADMIN_NOTE_MAX,
  TEST_FEEDBACK_CATEGORIES,
  TEST_FEEDBACK_FEATURES,
  TEST_FEEDBACK_RATINGS,
  TEST_FEEDBACK_STATUSES,
  labelFor,
} from './testFeedbackOptions.js'
import { listTestFeedback, updateTestFeedback } from './testFeedbackClient.js'
import { buildTestFeedbackCsv } from './testFeedbackCsv.js'
import './TestFeedback.css'

const UPDATE_ERRORS = {
  CONFLICT: 'Rapporten ändrades nyss av någon annan. Listan är uppdaterad – försök igen.',
  FORBIDDEN: 'Du saknar behörighet att ändra testfeedback.',
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return value
  }
}

function Report({ report, busy, onSave }) {
  const [status, setStatus] = useState(report.status)
  const [note, setNote] = useState(report.admin_note || '')
  return (
    <article className="test-feedback-admin-report" aria-label={`Testfeedback ${formatDate(report.created_at)}`}>
      <h4>
        {labelFor(TEST_FEEDBACK_CATEGORIES, report.category)} · {labelFor(TEST_FEEDBACK_STATUSES, report.status)}
        {report.rating ? ` · ${labelFor(TEST_FEEDBACK_RATINGS, report.rating)}` : ''}
      </h4>
      <small>{formatDate(report.created_at)} · {report.user_email || report.user_id}{report.app_version ? ` · v${report.app_version}` : ''}</small>
      <p><strong>Funktioner:</strong> {(report.features || []).map((id) => labelFor(TEST_FEEDBACK_FEATURES, id)).join(', ')}</p>
      <p>{report.comment || <em>Ingen kommentar</em>}</p>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ adminNote: note, reportId: report.id, status, version: report.version }) }}>
        <label>Status
          <select disabled={busy} value={status} onChange={(event) => setStatus(event.target.value)}>
            {TEST_FEEDBACK_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Anteckning (syns bara för admin)
          <textarea disabled={busy} maxLength={TEST_FEEDBACK_ADMIN_NOTE_MAX} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button className="secondary-button" disabled={busy || (status === report.status && note === (report.admin_note || ''))} type="submit">
          Spara
        </button>
      </form>
    </article>
  )
}

export default function TestFeedbackAdminPanel() {
  const [data, setData] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [featureFilter, setFeatureFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const load = useCallback(async () => {
    const result = await listTestFeedback()
    if (!active.current) return
    if (!result.ok) {
      setLoadFailed(true)
      return
    }
    setData(result)
    setLoadFailed(false)
  }, [])

  useEffect(() => {
    const initial = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(initial)
  }, [load])

  async function save(update) {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      const result = await updateTestFeedback(update)
      if (!active.current) return
      setNotice(result.ok ? 'Sparat.' : (UPDATE_ERRORS[result.code] || 'Kunde inte spara. Försök igen.'))
      await load()
    } finally {
      if (active.current) setBusy(false)
    }
  }

  const reports = useMemo(() => (data?.reports || []).filter((report) => {
    if (statusFilter === 'active' && !['open', 'in_progress'].includes(report.status)) return false
    if (statusFilter && statusFilter !== 'active' && report.status !== statusFilter) return false
    if (featureFilter && !(report.features || []).includes(featureFilter)) return false
    if (categoryFilter && report.category !== categoryFilter) return false
    return true
  }), [data, statusFilter, featureFilter, categoryFilter])

  function exportCsv() {
    const blob = new Blob([String.fromCharCode(0xfeff) + buildTestFeedbackCsv(reports)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `testfeedback-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const summary = data?.summary
  return (
    <section className="app-information test-feedback" aria-labelledby="test-feedback-admin-title">
      <h3 id="test-feedback-admin-title">Testfeedback</h3>
      <button className="secondary-button" disabled={busy} type="button" onClick={() => { void load() }}>Uppdatera</button>
      {loadFailed && <p className="form-error" role="status">Testfeedback kunde inte hämtas.</p>}
      {notice && <p role="status">{notice}</p>}
      {summary && (
        <>
          <div className="test-feedback-admin-stats">
            <div className="test-feedback-admin-stat"><span>Totalt</span><strong>{summary.total}</strong></div>
            <div className="test-feedback-admin-stat"><span>Öppna</span><strong>{summary.open}</strong></div>
            <div className="test-feedback-admin-stat"><span>Åtgärdade</span><strong>{summary.resolved}</strong></div>
            <div className="test-feedback-admin-stat"><span>Stängda</span><strong>{summary.closed}</strong></div>
          </div>
          {summary.topFeatures?.length > 0 && (
            <div>
              <h4>Funktioner med flest rapporter</h4>
              <ol>
                {summary.topFeatures.map((item) => (
                  <li key={item.feature}>
                    {labelFor(TEST_FEEDBACK_FEATURES, item.feature)}: {item.count} ({item.open} öppna)
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      {data && (
        <>
          <div className="test-feedback-admin-filters">
            <label>Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="active">Öppna och pågående</option>
                <option value="">Alla</option>
                {TEST_FEEDBACK_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>Funktion
              <select value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}>
                <option value="">Alla</option>
                {TEST_FEEDBACK_FEATURES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>Kategori
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">Alla</option>
                {TEST_FEEDBACK_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <button className="secondary-button" disabled={!reports.length} type="button" onClick={exportCsv}>
            Exportera {reports.length} till CSV
          </button>
          {reports.length === 0 && <p>Inga rapporter matchar filtret.</p>}
          {reports.map((report) => (
            <Report key={`${report.id}:${report.version}`} busy={busy} report={report} onSave={save} />
          ))}
        </>
      )}
    </section>
  )
}
