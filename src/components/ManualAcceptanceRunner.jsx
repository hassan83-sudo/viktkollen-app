import { useMemo, useState } from 'react'
import {
  acceptanceStatuses,
  createAcceptanceResult,
  serializeAcceptanceResult,
} from '../services/testing/acceptanceResultModel.js'
import {
  cleanupReleaseAcceptanceFixtures,
  installReleaseAcceptanceFixtures,
} from '../services/testing/releaseAcceptanceFixtures.js'
import { buildMultiDeviceAcceptanceStatus } from '../services/testing/multiDeviceAcceptanceHarness.js'

const manualSteps = [
  { area: 'auth', expected: 'Test User A och B kan registrera, logga in och logga ut utan dataläckage.', id: 'MRA2-AUTH' },
  { area: 'rls', expected: 'User A kan aldrig se User B:s backup, sync items eller rapportdata.', id: 'MRA2-RLS' },
  { area: 'sync', expected: 'Två profiler synkar utan dubbelnotiser, tyst överskrivning eller stale leader.', id: 'MRA2-SYNC' },
  { area: 'backup', expected: 'Markerad testbackup kan skapas, återställas och rensas utan auth/session-restore.', id: 'MRA2-BACKUP' },
  { area: 'photo', expected: 'Photo route ger säkra fel och riktig provider fungerar endast när den är explicit aktiverad.', id: 'MRA2-PHOTO' },
  { area: 'notifications', expected: 'Permission, quiet hours, batching och logout-cancel fungerar utan spam.', id: 'MRA2-NOTIFICATIONS' },
  { area: 'pwa', expected: 'Install, offline shell och update flow fungerar i preview/production.', id: 'MRA2-PWA' },
]

function normalizeManualStatus(value) {
  if (value === 'PASS') return acceptanceStatuses.manuallyVerified
  if (value === 'FAIL') return acceptanceStatuses.failed
  if (value === 'BLOCKED') return acceptanceStatuses.blockedByEnvironment
  return acceptanceStatuses.notRun
}

export default function ManualAcceptanceRunner({ syncStatus = {} }) {
  const [results, setResults] = useState({})
  const [notice, setNotice] = useState('')
  const [exportText, setExportText] = useState('')
  const deviceStatus = useMemo(() => buildMultiDeviceAcceptanceStatus({
    deviceId: syncStatus.deviceId,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    syncStatus,
  }), [syncStatus])

  if (!import.meta.env.DEV) {
    return null
  }

  const checks = manualSteps.map((step) => ({
    area: step.area,
    blocker: results[step.id]?.status === 'BLOCKED' ? 'Extern miljö kräver åtgärd.' : '',
    environment: 'staging-preview',
    id: step.id,
    notes: results[step.id]?.notes || '',
    safeEvidence: results[step.id]?.evidence || '',
    status: normalizeManualStatus(results[step.id]?.status),
    verifiedAt: results[step.id]?.status === 'PASS' ? new Date().toISOString() : null,
  }))

  function updateStep(id, patch) {
    setResults((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        ...patch,
      },
    }))
  }

  function handleInstallFixtures() {
    if (!window.confirm('Skapa markerad TESTDATA för acceptance-test?')) return
    const result = installReleaseAcceptanceFixtures()
    setNotice(result.ok ? 'TESTDATA skapades. Uppdatera appdata vid behov.' : 'TESTDATA kunde inte skapas.')
  }

  function handleCleanupFixtures() {
    const preview = cleanupReleaseAcceptanceFixtures().preview
    if (!window.confirm(`Rensa endast markerad TESTDATA? Kontrollera först cleanup-guiden. Förhandsvisning: ${preview.total} objekt.`)) return
    const result = cleanupReleaseAcceptanceFixtures({ confirm: true })
    setNotice(result.ok ? `TESTDATA rensades: ${result.preview.total} objekt.` : result.reason)
  }

  function handleExport() {
    const text = serializeAcceptanceResult(createAcceptanceResult({
      checks,
      environment: 'staging-preview',
      releaseStatus: 'CONDITIONAL',
    }))
    setExportText(text)
    setNotice('Säker acceptance-JSON skapad lokalt. Den innehåller inga credentials.')
  }

  return (
    <section aria-labelledby="manual-acceptance-heading" className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Development only</p>
          <h2 id="manual-acceptance-heading">Manual Acceptance Runner</h2>
        </div>
      </div>

      <div aria-live="polite" className="status-pill">{notice || 'Redo för manuell staging-acceptance.'}</div>

      <dl className="metric-list">
        <div><dt>Enhet</dt><dd>{deviceStatus.currentDeviceLabel} · {deviceStatus.deviceIdMasked}</dd></div>
        <div><dt>Sync</dt><dd>{deviceStatus.syncHealth} · {deviceStatus.pendingQueue} köade</dd></div>
        <div><dt>Konflikter</dt><dd>{deviceStatus.conflictStatus}</dd></div>
        <div><dt>Status</dt><dd>{deviceStatus.statusLabel}</dd></div>
      </dl>

      <div className="button-row">
        <button className="secondary-button" onClick={handleInstallFixtures} type="button">Skapa TESTDATA</button>
        <button className="secondary-button" onClick={handleCleanupFixtures} type="button">Rensa TESTDATA</button>
        <button className="primary-button" onClick={handleExport} type="button">Exportera resultat</button>
      </div>

      <div className="stacked-list">
        {manualSteps.map((step) => (
          <article className="mini-card" key={step.id}>
            <h3>{step.id}</h3>
            <p>{step.expected}</p>
            <label>
              Resultat
              <select
                aria-label={`Resultat för ${step.id}`}
                onChange={(event) => updateStep(step.id, { status: event.target.value })}
                value={results[step.id]?.status || 'NOT RUN'}
              >
                <option>NOT RUN</option>
                <option>PASS</option>
                <option>FAIL</option>
                <option>BLOCKED</option>
              </select>
            </label>
            <label>
              Säker anteckning
              <input
                onChange={(event) => updateStep(step.id, { notes: event.target.value })}
                placeholder="Ingen credential eller privat data"
                value={results[step.id]?.notes || ''}
              />
            </label>
          </article>
        ))}
      </div>

      {exportText && (
        <textarea
          aria-label="Exporterad acceptance JSON"
          readOnly
          rows={8}
          value={exportText}
        />
      )}
    </section>
  )
}
