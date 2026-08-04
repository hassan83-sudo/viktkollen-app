function maskDeviceId(deviceId = '') {
  const text = String(deviceId || '')
  if (!text) return 'Saknas'
  return text.length <= 10 ? `${text.slice(0, 3)}...` : `${text.slice(0, 6)}...${text.slice(-4)}`
}

export function buildMultiDeviceAcceptanceStatus({
  deviceId = '',
  label = 'Den här enheten',
  online = true,
  syncStatus = {},
} = {}) {
  const pendingUploads = Number(syncStatus.pendingUploads || syncStatus.queueStatus?.pendingUploads || 0)
  const pendingDownloads = Number(syncStatus.pendingDownloads || syncStatus.queueStatus?.pendingDownloads || 0)
  const conflicts = Array.isArray(syncStatus.conflicts) ? syncStatus.conflicts.length : Number(syncStatus.conflictCount || 0)

  return {
    conflictStatus: conflicts > 0 ? 'Konflikt behöver granskas' : 'Inga öppna konflikter',
    currentDeviceLabel: label,
    deviceIdMasked: maskDeviceId(deviceId || syncStatus.deviceId),
    lastSync: syncStatus.lastSuccessfulSyncAt || syncStatus.lastSyncAt || 'Saknas',
    leaderState: syncStatus.leaderState || syncStatus.schedulerRole || 'Okänd',
    online: Boolean(online),
    pendingQueue: pendingUploads + pendingDownloads,
    statusLabel: online ? 'Online' : 'Offline',
    syncHealth: syncStatus.syncHealth || syncStatus.statusCode || 'unknown',
    unresolvedConflicts: conflicts,
  }
}

export function createMarkedSyncTestPost({ fixtureDate = '2026-08-04', kind = 'weight' } = {}) {
  return {
    createdAt: `${fixtureDate}T09:00:00.000Z`,
    id: `testdata-sync-${kind}-${fixtureDate}`,
    kind,
    source: 'TESTDATA_RELEASE_ACCEPTANCE_V1',
    testMarker: 'TESTDATA_RELEASE_ACCEPTANCE_V1',
    value: kind === 'weight' ? 89.6 : 'TESTDATA sync post',
  }
}
