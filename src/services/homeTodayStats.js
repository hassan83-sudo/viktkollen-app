import { activityIngestionStatus } from '../features/shared/activity/activityModel.js'
import { getWeightEntryProvenance, isMeasuredWeightEntry } from './weightProvenance.js'

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function parseWeightValue(entry) {
  const value = Number(entry?.value ?? entry?.weight)
  return Number.isFinite(value) && value > 0 ? value : null
}

function entryTime(entry) {
  const raw = entry?.date || entry?.createdAt || entry?.loggedAt
  const time = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

/**
 * Home "aktuell vikt" uses the same measured-series policy as the main weight graph.
 *
 * Allowed provenance kinds (via isMeasuredWeightEntry):
 * - measured: manuell / våg / check-in
 * - user_entered: default user entry without AI markers
 * - derived: Importerad — real imported scale/user weight, NOT a calculated estimate
 *
 * Never allowed:
 * - ai_estimated (Body Scan / AI estimate markers / estimatedWeight fields)
 */
export function isHomeCurrentWeightEntry(entry = {}) {
  return isMeasuredWeightEntry(entry)
}

export function measuredWeightsForSparkline(weights = []) {
  return (Array.isArray(weights) ? weights : []).filter(isHomeCurrentWeightEntry)
}

export function resolveHomeWeightKg({ currentWeight, weights = [] } = {}) {
  const entries = Array.isArray(weights) ? weights : []
  const measured = entries
    .filter(isHomeCurrentWeightEntry)
    .map((entry) => ({
      kind: getWeightEntryProvenance(entry).kind,
      time: entryTime(entry),
      value: parseWeightValue(entry),
    }))
    .filter((entry) => entry.value !== null)
    .sort((first, second) => first.time - second.time || first.value - second.value)

  const latestMeasured = measured[measured.length - 1]
  if (latestMeasured) return latestMeasured.value

  const hasNonDisplaySeries = entries.length > 0 && measured.length === 0
  if (hasNonDisplaySeries) return null

  const fallback = Number(currentWeight)
  if (Number.isFinite(fallback) && fallback > 0) return fallback
  return null
}

export function formatHomeWeightLabel(kg) {
  if (!isFiniteNumber(kg) || Number(kg) <= 0) return 'Ingen vikt'
  const [whole, fraction = '0'] = Number(kg).toFixed(1).split('.')
  return `${whole},${fraction} kg`
}

export function resolveHomeSteps({ checkIn, ingestion = activityIngestionStatus } = {}) {
  const raw = checkIn?.steps ?? checkIn?.stepCount ?? checkIn?.dailySteps
  const deviceConnected = Boolean(ingestion?.healthKit || ingestion?.healthConnect || ingestion?.nativeGps)
  const hasLoggedSteps = isFiniteNumber(raw) && Number(raw) >= 0

  if (deviceConnected && hasLoggedSteps) {
    return {
      connected: true,
      source: 'device',
      value: Math.round(Number(raw)),
    }
  }

  if (hasLoggedSteps && Number(raw) > 0) {
    return {
      connected: true,
      source: 'check-in',
      value: Math.round(Number(raw)),
    }
  }

  return {
    connected: false,
    source: null,
    value: null,
  }
}

export function formatHomeStepsLabel(stepsState, formatNumber) {
  if (!stepsState?.connected || !isFiniteNumber(stepsState.value)) return 'Inte anslutet'
  return formatNumber(stepsState.value)
}
