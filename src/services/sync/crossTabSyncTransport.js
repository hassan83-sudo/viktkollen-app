import { addSyncDiagnosticEvent, recordCrossTabRejectedMessage } from './syncDiagnostics.js'

export const crossTabProtocolVersion = 1
export const crossTabChannelName = 'viktkollen.sync.crossTab.v1'
export const crossTabStorageSignalKey = 'viktkollen.sync.crossTab.signal.v1'
export const maxCrossTabMessageBytes = 4096

export const crossTabMessageTypes = Object.freeze({
  authChanged: 'AUTH_CHANGED',
  conflictDetected: 'CONFLICT_DETECTED',
  heartbeat: 'HEARTBEAT',
  leaderClaim: 'LEADER_CLAIM',
  leaderRelease: 'LEADER_RELEASE',
  localDataDirty: 'LOCAL_DATA_DIRTY',
  statusSnapshot: 'STATUS_SNAPSHOT',
  syncCompleted: 'SYNC_COMPLETED',
  syncFailed: 'SYNC_FAILED',
  syncRequest: 'SYNC_REQUEST',
  syncStarted: 'SYNC_STARTED',
  tabGoodbye: 'TAB_GOODBYE',
  tabHello: 'TAB_HELLO',
})

const allowedMessageTypes = new Set(Object.values(crossTabMessageTypes))
const allowedPayloadKeys = new Set([
  'conflict',
  'dirty',
  'expiresAt',
  'leaderTabId',
  'pendingCount',
  'reason',
  'requestId',
  'role',
  'running',
  'statusCode',
  'statusLabel',
  'storageKey',
])

function getNow() {
  return new Date().toISOString()
}

function getStorage(storage, windowRef) {
  if (storage) return storage
  if (windowRef?.localStorage) return windowRef.localStorage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return null
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function createTabId(random = Math.random) {
  const time = Date.now().toString(36)
  const entropy = Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36)

  return `tab-${time}-${entropy}`.slice(0, 80)
}

export function isValidTabId(value) {
  return /^tab-[a-z0-9-]{8,80}$/i.test(String(value || ''))
}

function sanitizePayload(payload) {
  if (!isObject(payload)) return {}

  return Object.fromEntries(Object.entries(payload)
    .filter(([key, value]) => allowedPayloadKeys.has(key) && ['boolean', 'number', 'string'].includes(typeof value))
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 200) : value]))
}

function estimateMessageBytes(message) {
  const text = JSON.stringify(message)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length
  return text.length
}

export function createCrossTabMessage({ payload = {}, tabId, type, userScope }) {
  const message = {
    payload: sanitizePayload(payload),
    protocolVersion: crossTabProtocolVersion,
    sentAt: getNow(),
    tabId,
    type,
    userScope: String(userScope || '').slice(0, 120),
  }

  return message
}

export function validateCrossTabMessage(message, options = {}) {
  if (!isObject(message)) return { ok: false, reason: 'not_object' }
  if (message.protocolVersion !== crossTabProtocolVersion) return { ok: false, reason: 'protocol' }
  if (!allowedMessageTypes.has(message.type)) return { ok: false, reason: 'type' }
  if (!isValidTabId(message.tabId)) return { ok: false, reason: 'tab_id' }
  if (message.tabId === options.ownTabId) return { ok: false, reason: 'echo' }
  if (String(message.userScope || '') !== String(options.userScope || '')) return { ok: false, reason: 'scope' }
  if (estimateMessageBytes(message) > maxCrossTabMessageBytes) return { ok: false, reason: 'size' }

  const sentAt = new Date(message.sentAt)
  if (Number.isNaN(sentAt.getTime())) return { ok: false, reason: 'timestamp' }

  const now = options.now instanceof Date ? options.now : new Date()
  if (sentAt.getTime() > now.getTime() + 60_000) return { ok: false, reason: 'future' }
  if (now.getTime() - sentAt.getTime() > 10 * 60_000) return { ok: false, reason: 'stale' }

  return {
    message: {
      payload: sanitizePayload(message.payload),
      protocolVersion: message.protocolVersion,
      sentAt: sentAt.toISOString(),
      tabId: message.tabId,
      type: message.type,
      userScope: String(message.userScope || ''),
    },
    ok: true,
  }
}

export function createCrossTabTransport(options = {}) {
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null)
  const storage = getStorage(options.storage, windowRef)
  const BroadcastChannelRef = Object.prototype.hasOwnProperty.call(options, 'BroadcastChannelRef')
    ? options.BroadcastChannelRef
    : windowRef?.BroadcastChannel || (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null)
  const tabId = options.tabId || createTabId(options.random)
  let userScope = String(options.userScope || '')
  let channel = null
  let closed = false
  const listeners = new Set()
  const diagnostics = {
    lastRejectedReason: '',
    received: 0,
    rejected: 0,
    sent: 0,
    transportType: BroadcastChannelRef ? 'broadcast-channel' : 'storage',
  }

  function notify(message) {
    const validation = validateCrossTabMessage(message, { ownTabId: tabId, userScope })
    if (!validation.ok) {
      diagnostics.rejected += 1
      diagnostics.lastRejectedReason = validation.reason
      recordCrossTabRejectedMessage(validation.reason)
      return
    }

    diagnostics.received += 1
    listeners.forEach((listener) => listener(validation.message))
  }

  function handleStorageEvent(event) {
    if (event?.key !== crossTabStorageSignalKey || !event.newValue) return

    try {
      notify(JSON.parse(event.newValue))
    } catch {
      diagnostics.rejected += 1
      diagnostics.lastRejectedReason = 'invalid_json'
      recordCrossTabRejectedMessage('invalid_json')
    }
  }

  function open(nextUserScope = userScope) {
    userScope = String(nextUserScope || '')
    closed = false

    if (BroadcastChannelRef) {
      channel = new BroadcastChannelRef(crossTabChannelName)
      channel.onmessage = (event) => notify(event.data)
    } else {
      addSyncDiagnosticEvent('transport', 'Storage fallback transport activated.')
      windowRef?.addEventListener?.('storage', handleStorageEvent)
    }
  }

  function close() {
    closed = true
    if (channel) {
      channel.close()
      channel = null
    }
    windowRef?.removeEventListener?.('storage', handleStorageEvent)
  }

  function post(type, payload = {}) {
    if (closed || !userScope || !isValidTabId(tabId)) return false

    const message = createCrossTabMessage({ payload, tabId, type, userScope })
    if (estimateMessageBytes(message) > maxCrossTabMessageBytes) return false

    diagnostics.sent += 1
    addSyncDiagnosticEvent('transport', 'Cross-tab message sent.', { type })
    if (channel) {
      channel.postMessage(message)
      return true
    }

    try {
      storage?.setItem?.(crossTabStorageSignalKey, JSON.stringify(message))
      storage?.removeItem?.(crossTabStorageSignalKey)
      return true
    } catch {
      return false
    }
  }

  return {
    close,
    getDiagnostics: () => ({ ...diagnostics, tabId }),
    getTabId: () => tabId,
    getTransportType: () => diagnostics.transportType,
    open,
    post,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
