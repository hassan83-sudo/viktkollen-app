import { getConfidenceLabel, getLatestMeasuredWeight } from './bodyAnalysisEstimates.js'
import { getAnalysisHistory } from './bodyAnalysisHistory.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const STABLE_KG = 0.15
const STABLE_CM = 0.8

const measurementMeta = [
  { key: 'waistCm', label: 'Midja' },
  { key: 'hipCm', label: 'Höfter' },
  { key: 'chestCm', label: 'Bröst' },
  { key: 'shoulderWidthCm', label: 'Axlar' },
]

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundOne(value) {
  return Math.round(Number(value) * 10) / 10
}

function parseEntryDate(entry) {
  const raw = entry?.date || entry?.localDate || entry?.createdAt
  if (!raw) return null
  const parsed = new Date(`${String(raw).slice(0, 10)}T${entry?.time || '12:00'}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getWeightKg(entry) {
  return toNumber(entry?.value ?? entry?.weight ?? entry?.valueKg ?? entry?.kg)
}

export function formatKgLabel(value) {
  const number = toNumber(value)
  if (number === null) return ''
  return `${number.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(number) ? 0 : 1,
  })} kg`
}

export function formatCmLabel(value) {
  const number = toNumber(value)
  if (number === null) return ''
  return `${number.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} cm`
}

export function formatSignedChange(value, unit) {
  const number = toNumber(value)
  if (number === null) return ''
  if (Math.abs(number) < 0.05) return `0 ${unit}`
  const abs = Math.abs(number).toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })
  return `${number > 0 ? '+' : '−'}${abs} ${unit}`
}

export function classifyWindMs(windSpeedMs) {
  const wind = toNumber(windSpeedMs)
  if (wind === null) return { label: '', level: 'missing' }
  if (wind <= 3) return { label: 'Svag vind', level: 'light' }
  if (wind <= 7) return { label: 'Måttlig vind', level: 'moderate' }
  if (wind <= 13) return { label: 'Kraftig vind', level: 'strong' }
  return { label: 'Mycket blåsigt', level: 'severe' }
}

export function formatTimeUntil(targetIso, now = new Date()) {
  if (!targetIso) return null
  const target = new Date(targetIso)
  if (Number.isNaN(target.getTime())) return null
  const remainingMs = target.getTime() - now.getTime()
  if (remainingMs <= 0) return null
  const totalMinutes = Math.round(remainingMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min kvar`
  return `${hours} h ${String(minutes).padStart(2, '0')} min kvar`
}

function findWeightDaysAgo(weights, daysAgo, latestDate, windowDays) {
  const targetMs = latestDate.getTime() - daysAgo * MS_PER_DAY
  const minMs = latestDate.getTime() - (daysAgo + windowDays) * MS_PER_DAY
  const maxMs = latestDate.getTime() - Math.max(daysAgo - windowDays, 4) * MS_PER_DAY
  const older = weights.filter((item) => item.date.getTime() >= minMs && item.date.getTime() <= maxMs)
  if (!older.length) return null
  older.sort((first, second) => Math.abs(targetMs - first.date.getTime()) - Math.abs(targetMs - second.date.getTime()))
  return older[0]
}

export function buildWeightTrend(weights = [], fallbackKg = null, now = new Date()) {
  const latestMeasured = getLatestMeasuredWeight(weights)
  const currentKg = latestMeasured?.valueKg ?? toNumber(fallbackKg)
  if (currentKg === null) {
    return {
      change7dKg: null,
      change30dKg: null,
      currentKg: null,
      trend: null,
      trendLabel: '',
    }
  }

  const dated = weights
    .map((entry) => ({ date: parseEntryDate(entry), kg: getWeightKg(entry) }))
    .filter((item) => item.date && item.kg !== null)
    .sort((first, second) => second.date - first.date)

  const latestDate = dated[0]?.date || now
  const week = findWeightDaysAgo(dated, 7, latestDate, 3)
  const month = findWeightDaysAgo(dated, 30, latestDate, 8)
  const change7dKg = week ? roundOne(currentKg - week.kg) : null
  const change30dKg = month ? roundOne(currentKg - month.kg) : null
  const trendSource = change30dKg ?? change7dKg
  let trend = null
  if (trendSource !== null) {
    if (trendSource < -STABLE_KG) trend = 'down'
    else if (trendSource > STABLE_KG) trend = 'up'
    else trend = 'stable'
  }

  return {
    change7dKg,
    change30dKg,
    currentKg,
    trend,
    trendLabel: trend === 'down' ? 'Trend ↓' : trend === 'up' ? 'Trend ↑' : trend === 'stable' ? 'Trend →' : '',
  }
}

function midpoint(estimate) {
  const min = toNumber(estimate?.min ?? estimate?.minCm)
  const max = toNumber(estimate?.max ?? estimate?.maxCm)
  if (min === null || max === null) return null
  return roundOne((min + max) / 2)
}

function compareEstimates(current, previous) {
  const currentMid = midpoint(current)
  const previousMid = midpoint(previous)
  if (currentMid === null || previousMid === null) {
    return {
      change: null,
      current: currentMid,
      label: 'Saknas',
      previous: previousMid,
      reliable: false,
    }
  }

  const currentMin = toNumber(current.min ?? current.minCm)
  const currentMax = toNumber(current.max ?? current.maxCm)
  const previousMin = toNumber(previous.min ?? previous.minCm)
  const previousMax = toNumber(previous.max ?? previous.maxCm)
  const overlap = currentMin <= previousMax && previousMin <= currentMax
  const change = roundOne(currentMid - previousMid)
  if (overlap && Math.abs(change) < STABLE_CM) {
    return {
      change: 0,
      current: currentMid,
      label: 'Ingen säker förändring',
      previous: previousMid,
      reliable: false,
    }
  }

  return {
    change,
    current: currentMid,
    label: formatSignedChange(change, 'cm'),
    previous: previousMid,
    reliable: true,
  }
}

export function buildScanComparison(history = getAnalysisHistory()) {
  const [latest, previous] = history
  if (!latest) {
    return {
      confidenceLabel: '',
      latest: null,
      measurements: [],
      previous: null,
      weight: null,
    }
  }

  const latestResult = latest.result || {}
  const previousResult = previous?.result || {}
  const latestWeight = toNumber(latestResult.measuredWeight?.valueKg)
  const previousWeight = toNumber(previousResult.measuredWeight?.valueKg)

  return {
    confidenceLabel: getConfidenceLabel(latestResult.dataQuality || latestResult.confidence),
    latest,
    measurements: measurementMeta.map((item) => {
      const compared = compareEstimates(
        latestResult.estimatedMeasurements?.[item.key],
        previousResult.estimatedMeasurements?.[item.key],
      )
      return {
        change: compared.change,
        changeLabel: compared.label,
        current: compared.current,
        key: item.key,
        name: item.label,
        previous: compared.previous,
        reliable: compared.reliable,
      }
    }),
    previous: previous || null,
    weight: previous && latestWeight !== null && previousWeight !== null
      ? {
          change: roundOne(latestWeight - previousWeight),
          current: latestWeight,
          previous: previousWeight,
        }
      : latestWeight !== null
        ? { change: null, current: latestWeight, previous: null }
        : null,
  }
}

export function buildClothingAdvice(weather, now = new Date()) {
  if (!weather?.hasLiveWeather) {
    return {
      available: false,
      emptyLabel: 'Klädråd visas när väderdata finns.',
      lines: [],
      mentionsUv: false,
    }
  }

  const temperatureC = toNumber(weather.temperatureC)
  const windSpeedMs = toNumber(weather.windSpeedMs)
  const rainRisk = toNumber(weather.precipitationRiskPercent)
  const condition = String(weather.condition || '')
  const lines = []

  if (temperatureC !== null) {
    if (temperatureC >= 22) lines.push('Lätta kläder passar bra.')
    else if (temperatureC >= 16) lines.push('En tunn jacka eller hoodie passar bra.')
    else if (temperatureC >= 10) lines.push('En vanlig jacka passar bättre än kortärmat.')
    else lines.push('Klä dig varmt. Det är svalt ute.')
  }

  if (windSpeedMs !== null && windSpeedMs >= 8) {
    lines.push('Välj gärna en jacka som går att stänga. Lösa plagg kan kännas opraktiska i vinden.')
  } else if (windSpeedMs !== null && windSpeedMs >= 4 && temperatureC !== null && temperatureC < 20) {
    lines.push(`Det blåser ${Math.round(windSpeedMs)} m/s, så kortärmat kan kännas kyligt.`)
  }

  if ((rainRisk !== null && rainRisk >= 40) || /regn|skur|dugg/i.test(condition)) {
    lines.push('Ta gärna en lätt regnjacka eller paraply.')
  }

  const untilSunset = formatTimeUntil(weather.sunset, now)
  if (untilSunset && /klart|sol/i.test(condition)) {
    lines.push(`Solen går ner om ${untilSunset.replace(' kvar', '')}.`)
  }

  return {
    available: lines.length > 0,
    emptyLabel: lines.length ? '' : 'För lite väderdata för klädråd.',
    lines,
    mentionsUv: false,
  }
}

export function buildHomeBodyToday({
  currentWeight = null,
  history = getAnalysisHistory(),
  now = new Date(),
  weather = null,
  weights = [],
} = {}) {
  return {
    clothing: buildClothingAdvice(weather, now),
    scan: buildScanComparison(history),
    untilSunset: formatTimeUntil(weather?.sunset, now),
    weightTrend: buildWeightTrend(weights, currentWeight, now),
    wind: classifyWindMs(weather?.windSpeedMs),
  }
}
