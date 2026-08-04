import { maskSyncIdentifier } from './syncDiagnostics.js'

export const maxKnownSyncDevices = 12
const staleAfterMs = 30 * 24 * 60 * 60 * 1000

function safeText(value, fallback = '', max = 120) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseTime(value) {
  const time = new Date(value || '').getTime()
  return Number.isFinite(time) ? time : 0
}

function detectPlatform(userAgent = '') {
  const text = String(userAgent || '').toLowerCase()
  if (/iphone/.test(text)) return 'iPhone'
  if (/ipad/.test(text)) return 'iPad'
  if (/android/.test(text)) return 'Android'
  if (/mac os|macintosh/.test(text)) return 'macOS'
  if (/windows/.test(text)) return 'Windows'
  return 'Okänd enhet'
}

function detectBrowser(userAgent = '') {
  const text = String(userAgent || '').toLowerCase()
  if (/edg\//.test(text)) return 'Edge'
  if (/chrome|crios/.test(text)) return 'Chrome'
  if (/firefox|fxios/.test(text)) return 'Firefox'
  if (/safari/.test(text)) return 'Safari'
  return 'Webbläsare'
}

function detectAppMode(windowRef) {
  try {
    return windowRef?.matchMedia?.('(display-mode: standalone)')?.matches ? 'Installerad PWA' : 'Webbläsare'
  } catch {
    return 'Webbläsare'
  }
}

export function buildCurrentDeviceDescriptor({ deviceId = '', lastSyncAt = '', lastWriteAt = '', now = new Date(), windowRef = typeof window !== 'undefined' ? window : null } = {}) {
  const userAgent = windowRef?.navigator?.userAgent || ''
  const platform = detectPlatform(userAgent)
  const appMode = detectAppMode(windowRef)
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString()

  return normalizeKnownSyncDevice({
    appMode,
    browser: detectBrowser(userAgent),
    deviceId,
    deviceLabel: appMode === 'Installerad PWA' ? `${platform} PWA` : platform,
    firstSeenAt: timestamp,
    isCurrentDevice: true,
    lastSeenAt: timestamp,
    lastSyncAt,
    lastWriteAt,
    platform,
    status: 'active',
  }, { now: timestamp })
}

export function normalizeKnownSyncDevice(device = {}, options = {}) {
  const now = options.now instanceof Date ? options.now.toISOString() : options.now || new Date().toISOString()
  const lastSeenAt = safeText(device.lastSeenAt || device.lastSyncAt || device.lastWriteAt || now, now, 80)
  const nowMs = parseTime(now) || Date.now()
  const isStale = parseTime(lastSeenAt) ? nowMs - parseTime(lastSeenAt) > staleAfterMs : false

  return {
    appMode: safeText(device.appMode, 'Webbläsare', 40),
    browser: safeText(device.browser, 'Webbläsare', 40),
    deviceId: safeText(device.deviceId, '', 140),
    deviceIdMasked: maskSyncIdentifier(device.deviceId),
    deviceLabel: safeText(device.deviceLabel, 'Okänd enhet', 80),
    firstSeenAt: safeText(device.firstSeenAt || lastSeenAt, lastSeenAt, 80),
    isCurrentDevice: device.isCurrentDevice === true,
    isStale,
    lastSeenAt,
    lastSyncAt: safeText(device.lastSyncAt, '', 80),
    lastWriteAt: safeText(device.lastWriteAt, '', 80),
    platform: safeText(device.platform, 'Okänd enhet', 40),
    status: device.status === 'hidden' ? 'hidden' : isStale ? 'stale' : safeText(device.status, 'active', 40),
  }
}

export function buildMultiDeviceRegistry({ currentDeviceId = '', metadata = {}, now = new Date(), remoteRows = [], windowRef } = {}) {
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString()
  const devices = new Map()
  const add = (device) => {
    const normalized = normalizeKnownSyncDevice(device, { now: timestamp })
    if (!normalized.deviceId) return
    const existing = devices.get(normalized.deviceId)
    devices.set(normalized.deviceId, existing && parseTime(existing.lastSeenAt) > parseTime(normalized.lastSeenAt) ? existing : normalized)
  }

  add(buildCurrentDeviceDescriptor({
    deviceId: currentDeviceId || metadata.deviceId,
    lastSyncAt: metadata.lastSuccessfulSyncAt,
    now: timestamp,
    windowRef,
  }))

  ;(Array.isArray(remoteRows) ? remoteRows : []).forEach((row) => add({
    appMode: 'Webbläsare',
    browser: 'Webbläsare',
    deviceId: row.deviceId || row.device_id,
    deviceLabel: row.deviceId === currentDeviceId ? 'Denna enhet' : 'Synkad enhet',
    firstSeenAt: row.clientUpdatedAt || row.client_updated_at || row.serverUpdatedAt,
    lastSeenAt: row.serverUpdatedAt || row.server_updated_at || row.clientUpdatedAt || row.client_updated_at,
    lastSyncAt: row.serverUpdatedAt || row.server_updated_at,
    lastWriteAt: row.clientUpdatedAt || row.client_updated_at,
    status: 'active',
  }))

  return [...devices.values()]
    .sort((first, second) => parseTime(second.lastSeenAt) - parseTime(first.lastSeenAt))
    .slice(0, maxKnownSyncDevices)
    .map((device) => ({ ...device, isCurrentDevice: device.deviceId === (currentDeviceId || metadata.deviceId) }))
}

export function summarizeMultiDeviceRegistry(devices = []) {
  const visible = devices.filter((device) => device.status !== 'hidden')
  return {
    activeDeviceCount: visible.filter((device) => !device.isStale).length,
    currentDevice: visible.find((device) => device.isCurrentDevice) || null,
    devices: visible,
    staleDeviceCount: visible.filter((device) => device.isStale).length,
  }
}

export const multiDeviceRegistryInternals = {
  detectAppMode,
  detectBrowser,
  detectPlatform,
  parseTime,
}
