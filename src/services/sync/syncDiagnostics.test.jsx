import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import SyncDiagnosticsPanel from '../../components/SyncDiagnosticsPanel.jsx'
import {
  addSyncDiagnosticEvent,
  buildSyncDiagnosticsSnapshot,
  clearSyncDiagnosticEvents,
  exportSyncDiagnosticsReport,
  getSyncDiagnosticsSnapshot,
  maskSyncIdentifier,
  recordCloudRuntimeLoaded,
  recordCrossTabRejectedMessage,
  recordSyncResult,
  syncDiagnosticsEventLimit,
} from './syncDiagnostics.js'
import { refreshSyncStatus, resetSyncStatus, updateSyncCoordinationStatus } from './syncStatusStore.js'

afterEach(() => {
  clearSyncDiagnosticEvents()
  resetSyncStatus()
})

describe('sync diagnostics', () => {
  it('keeps a bounded technical event history', () => {
    for (let index = 0; index < syncDiagnosticsEventLimit + 5; index += 1) {
      addSyncDiagnosticEvent('transport', `event-${index}`)
    }

    const snapshot = getSyncDiagnosticsSnapshot()

    expect(snapshot.events).toHaveLength(syncDiagnosticsEventLimit)
    expect(snapshot.events[0].message).toBe('event-5')
  })

  it('masks identifiers in reports', () => {
    expect(maskSyncIdentifier('tab-abcdefghijklmnopqrstuvwxyz')).toBe('tab-ab...yz')
  })

  it('removes forbidden payload details from events', () => {
    addSyncDiagnosticEvent('transport', 'unsafe input', {
      accessToken: 'secret',
      email: 'person@example.com',
      tabId: 'tab-abcdefghijklmnopqrstuvwxyz',
    })

    const event = getSyncDiagnosticsSnapshot().events[0]

    expect(event.detail).toEqual({ tabId: 'tab-ab...yz' })
  })

  it('tracks rejected messages and cloud runtime state', () => {
    recordCrossTabRejectedMessage('scope')
    recordCloudRuntimeLoaded('engine')
    recordSyncResult({ ok: false, status: 'retry_waiting' })

    const snapshot = getSyncDiagnosticsSnapshot()

    expect(snapshot.lastRejectedMessageReason).toBe('scope')
    expect(snapshot.runtimeState.cloudSyncEngineLoaded).toBe(true)
    expect(snapshot.latestSyncResult).toBe('retry_waiting')
  })

  it('builds a stable diagnostics snapshot from sync status', () => {
    refreshSyncStatus({ currentTrigger: 'manual', running: true, userId: 'user-1234567890' })
    updateSyncCoordinationStatus({
      activeTabCount: 2,
      hasLeader: true,
      role: 'leader',
      schedulerActive: true,
      tabId: 'tab-abcdefghijklmnopqrstuvwxyz',
      transportType: 'broadcast-channel',
    })

    const snapshot = buildSyncDiagnosticsSnapshot(refreshSyncStatus())

    expect(snapshot.coordination.role).toBe('leader')
    expect(snapshot.coordination.tabId).toBe('tab-ab...yz')
    expect(snapshot.coordination.userScope).toBe('user-1...90')
    expect(snapshot.coordination.schedulerActive).toBe(true)
  })

  it('exports an anonymized report without sensitive fields', () => {
    addSyncDiagnosticEvent('sync', 'Manual sync requested.', {
      requestId: 'tab-abcdefghijklmnopqrstuvwxyz-123',
      session: 'secret-session',
    })

    const report = exportSyncDiagnosticsReport(refreshSyncStatus({ userId: 'user-1234567890' }))

    expect(report).not.toMatch(/secret-session|person@example|accessToken|Bearer|viktdata|måltid/i)
    expect(report).toContain('appVersion')
  })

  it('renders the development diagnostics panel without raw technical identifiers', () => {
    refreshSyncStatus({ currentTrigger: 'manual', running: false, userId: 'user-1234567890' })
    updateSyncCoordinationStatus({
      activeTabCount: 2,
      hasLeader: true,
      role: 'follower',
      schedulerActive: false,
      tabId: 'tab-abcdefghijklmnopqrstuvwxyz',
      transportType: 'storage',
    })
    addSyncDiagnosticEvent('leader', 'Tab is follower.', { tabId: 'tab-abcdefghijklmnopqrstuvwxyz' })

    const markup = renderToStaticMarkup(<SyncDiagnosticsPanel />)

    expect(markup).toContain('Sync diagnostics')
    expect(markup).toContain('follower')
    expect(markup).toContain('storage')
    expect(markup).not.toContain('tab-abcdefghijklmnopqrstuvwxyz')
    expect(markup).not.toMatch(/token|session|Bearer|undefined|null|\[object Object\]/i)
  })
})
