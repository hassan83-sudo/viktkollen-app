import { useSyncExternalStore } from 'react'
import {
  getSyncStatusSnapshot,
  subscribeSyncStatus,
} from '../services/sync/syncStatusStore.js'

function shouldShowStatus(status) {
  return ['running', 'dirty', 'offline', 'retry_waiting', 'conflict', 'error'].includes(status.statusCode)
}

function GlobalSyncStatus() {
  const status = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatusSnapshot,
    getSyncStatusSnapshot,
  )

  if (!shouldShowStatus(status)) {
    return null
  }

  return (
    <aside className={`global-sync-status is-${status.statusCode}`} role="status" aria-live="polite">
      <a href="#cloud-sync">{status.statusLabel}</a>
    </aside>
  )
}

export default GlobalSyncStatus
