import { buildClothingAdvice, classifyWindMs, formatTimeUntil } from '../../services/homeBodyToday.js'

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function buildOutfitWeatherFacts(weather) {
  if (!weather?.hasLiveWeather) {
    return {
      available: false,
      facts: [],
      lines: [],
      note: 'Klädråd från väder visas när live-väder är kopplat.',
    }
  }

  const temperatureC = toNumber(weather.temperatureC)
  const feelsLikeC = toNumber(weather.feelsLikeC)
  const windSpeedMs = toNumber(weather.windSpeedMs)
  const rainRisk = toNumber(weather.precipitationRiskPercent)
  const facts = []

  if (temperatureC !== null) facts.push(`${Math.round(temperatureC)}°C`)
  if (feelsLikeC !== null) facts.push(`Känns som ${Math.round(feelsLikeC)}°C`)
  if (windSpeedMs !== null) facts.push(`Vind ${Math.round(windSpeedMs)} m/s`)
  if (rainRisk !== null) facts.push(`Nederbördsrisk ${Math.round(rainRisk)} %`)
  if (weather.sunriseLabel && weather.sunriseLabel !== '--:--') facts.push(`Soluppgång ${weather.sunriseLabel}`)
  if (weather.sunsetLabel && weather.sunsetLabel !== '--:--') facts.push(`Solnedgång ${weather.sunsetLabel}`)

  const untilSunset = formatTimeUntil(weather.sunset)
  if (untilSunset) facts.push(`Tid till solnedgång ${untilSunset}`)

  const clothing = buildClothingAdvice(weather)
  const wind = classifyWindMs(weather.windSpeedMs)
  const lines = [...clothing.lines]
  if (wind.level === 'strong' || wind.level === 'severe') {
    lines.push('Det blåser ganska mycket. En tunn jacka kan bli kall.')
  }

  return {
    available: facts.length > 0 || lines.length > 0,
    condition: weather.condition || '',
    facts,
    lines,
    note: clothing.emptyLabel,
    windLabel: wind.label,
  }
}

export const outfitVisionReady = false

export const outfitFeedbackDisclaimer = 'Outfit-feedback är frivillig styling, inte ett mått på attraktivitet. Visuell plaggdetektion är inte aktiv ännu. Live-preview är lokal.'
