import { readStorageResult, writeStorageResult } from '../appStorageService.js'

export const batteryNoticeStorageKey = 'viktkollen.batteryNotice.v1'
export const batteryNoticeVersion = 1
export const batteryHistoryMaxCount = 240
export const batteryMinimumSampleMinutes = 20
export const batteryMinimumSamplesForAverage = 3
export const batteryMinimumWriteIntervalMs = 10 * 60 * 1000

const defaultState = {
  version: batteryNoticeVersion,
  activatedAt: '',
  enabled: false,
  history: [],
  manualPercent: '',
  schoolMode: true,
  safetyMarginHours: 1,
  targetReadyAt: '07:30',
  updatedAt: '',
}

function safeDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function toDateKey(value) {
  const date = safeDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function normalizeBatteryMeasurement(input = {}, options = {}) {
  const now = options.now || new Date().toISOString()
  const measuredAt = safeDate(input.measuredAt || input.timestamp || input.at || now)?.toISOString() || now

  return {
    charging: Boolean(input.charging),
    id: typeof input.id === 'string' && input.id ? input.id : `battery-${measuredAt}`,
    measuredAt,
    percent: Math.round(clampNumber(input.percent, 0, 100, 0)),
    source: input.source === 'api' ? 'api' : 'manual',
  }
}

export function normalizeBatteryNoticeState(input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const history = Array.isArray(source.history)
    ? source.history
      .map((item) => normalizeBatteryMeasurement(item, options))
      .filter((item) => safeDate(item.measuredAt))
      .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime())
      .slice(-batteryHistoryMaxCount)
    : []

  return {
    ...defaultState,
    ...source,
    enabled: Boolean(source.enabled),
    history,
    manualPercent: typeof source.manualPercent === 'number' || typeof source.manualPercent === 'string' ? String(source.manualPercent) : '',
    schoolMode: source.schoolMode !== false,
    safetyMarginHours: clampNumber(source.safetyMarginHours, 0, 6, defaultState.safetyMarginHours),
    targetReadyAt: typeof source.targetReadyAt === 'string' && /^\d{2}:\d{2}$/.test(source.targetReadyAt) ? source.targetReadyAt : defaultState.targetReadyAt,
    version: batteryNoticeVersion,
  }
}

export function getBatteryCapabilities(win = typeof window === 'undefined' ? undefined : window) {
  const navigatorObject = win?.navigator
  const hasBatteryApi = Boolean(navigatorObject && typeof navigatorObject.getBattery === 'function')
  const standalone = Boolean(
    win?.matchMedia?.('(display-mode: standalone)')?.matches
      || navigatorObject?.standalone,
  )
  const userAgent = `${navigatorObject?.userAgent || ''} ${navigatorObject?.platform || ''}`
  const isiPhone = /iPhone|iPod/i.test(userAgent)
  const isiPad = /iPad/i.test(userAgent) || (navigatorObject?.platform === 'MacIntel' && navigatorObject?.maxTouchPoints > 1)

  return {
    automaticRead: hasBatteryApi,
    backgroundMonitoring: false,
    batteryApi: hasBatteryApi,
    eventUpdates: hasBatteryApi,
    manualEntry: true,
    platform: isiPhone ? 'iphone' : isiPad ? 'ipad' : standalone ? 'pwa' : 'browser',
    requiresOpenApp: true,
  }
}

export function shouldStoreBatteryMeasurement(state, measurement, options = {}) {
  const current = normalizeBatteryNoticeState(state)
  const previous = current.history.at(-1)
  if (!previous) return true
  const next = normalizeBatteryMeasurement(measurement, options)
  const elapsed = new Date(next.measuredAt).getTime() - new Date(previous.measuredAt).getTime()
  const hasChanged = next.percent !== previous.percent || next.charging !== previous.charging || next.source !== previous.source

  return hasChanged || elapsed >= (options.minimumIntervalMs || batteryMinimumWriteIntervalMs)
}

export function addBatteryMeasurement(state, measurement, options = {}) {
  const current = normalizeBatteryNoticeState(state, options)
  const nextMeasurement = normalizeBatteryMeasurement(measurement, options)
  if (!shouldStoreBatteryMeasurement(current, nextMeasurement, options)) return current

  const nextHistory = [...current.history, nextMeasurement]
    .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime())
    .slice(-batteryHistoryMaxCount)

  return normalizeBatteryNoticeState({
    ...current,
    history: nextHistory,
    manualPercent: nextMeasurement.source === 'manual' ? String(nextMeasurement.percent) : current.manualPercent,
    updatedAt: nextMeasurement.measuredAt,
  }, options)
}

export function calculateBatteryInsights(state, options = {}) {
  const current = normalizeBatteryNoticeState(state, options)
  const now = safeDate(options.now || new Date().toISOString()) || new Date()
  const todayKey = toDateKey(now)
  const unplugged = current.history.filter((item) => !item.charging)
  const today = current.history.filter((item) => toDateKey(item.measuredAt) === todayKey)
  const drops = []

  for (let index = 1; index < unplugged.length; index += 1) {
    const previous = unplugged[index - 1]
    const next = unplugged[index]
    if (toDateKey(previous.measuredAt) !== toDateKey(next.measuredAt)) continue
    const minutes = (new Date(next.measuredAt).getTime() - new Date(previous.measuredAt).getTime()) / 60000
    const percentDrop = previous.percent - next.percent
    if (minutes >= batteryMinimumSampleMinutes && percentDrop > 0) {
      drops.push({ minutes, percentDrop, ratePerHour: percentDrop / (minutes / 60) })
    }
  }

  const averageDrainPerHour = drops.length >= batteryMinimumSamplesForAverage
    ? drops.reduce((sum, item) => sum + item.ratePerHour, 0) / drops.length
    : null
  const latest = current.history.at(-1) || null
  const todayConsumption = today.length >= 2 ? Math.max(0, today[0].percent - today.at(-1).percent) : null

  return {
    averageDrainPerHour,
    enoughData: averageDrainPerHour !== null,
    latest,
    sampleCount: drops.length,
    todayConsumption,
  }
}

export function createBatteryRecommendation(state, options = {}) {
  const current = normalizeBatteryNoticeState(state, options)
  const insights = calculateBatteryInsights(current, options)
  if (!current.enabled) return { ...insights, level: 'inactive', messageKey: 'inactive', reminderPercent: null }
  if (!insights.latest) return { ...insights, level: 'empty', messageKey: 'empty', reminderPercent: null }
  if (insights.latest.charging) return { ...insights, level: 'charging', messageKey: 'charging', reminderPercent: null }
  if (!insights.enoughData) return { ...insights, level: 'learning', messageKey: 'learning', reminderPercent: 35 }

  const schoolHours = current.schoolMode ? 8 : 5
  const neededPercent = insights.averageDrainPerHour * (schoolHours + current.safetyMarginHours)
  const reminderPercent = Math.round(clampNumber(neededPercent, 20, 85, 35))
  const currentPercent = insights.latest.percent
  const level = currentPercent <= reminderPercent ? 'chargeSoon' : 'ok'

  return {
    ...insights,
    currentPercent,
    level,
    messageKey: level,
    reminderPercent,
  }
}

export function readBatteryNoticeState() {
  return normalizeBatteryNoticeState(readStorageResult(batteryNoticeStorageKey, defaultState).value)
}

export function saveBatteryNoticeState(state) {
  const next = normalizeBatteryNoticeState(state)
  writeStorageResult(batteryNoticeStorageKey, next)
  return next
}
