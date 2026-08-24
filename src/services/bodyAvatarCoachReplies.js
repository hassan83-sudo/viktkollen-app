import { buildClothingAdvice } from './homeBodyToday.js'
import { includesAny, normalizeAiCoachText } from './aiCoach/coachText.js'

const weatherTerms = [
  'vader',
  'vadret',
  'temperatur',
  'regn',
  'vind',
  'kallt',
  'varmt',
  'soluppgang',
  'solnedgang',
  'ute',
]

const clothingTerms = [
  'jacka',
  'klad',
  'klaeder',
  'ha pa mig',
  'ha pa sig',
  'outfit',
  'ute sa har',
]

function compactWeather(context) {
  return context?.liveWeather || context?.weather || null
}

function formatDegrees(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°C` : 'saknas'
}

export function isLiveWeatherOrClothingQuestion(message) {
  const plain = normalizeAiCoachText(message).plain
  return includesAny(plain, weatherTerms) || includesAny(plain, clothingTerms)
}

export function makeLiveContextReply(message, context = {}) {
  if (!isLiveWeatherOrClothingQuestion(message)) return ''

  const weather = compactWeather(context)
  const clothing = context.clothingAdvice || buildClothingAdvice(weather)
  const asksClothes = includesAny(normalizeAiCoachText(message).plain, clothingTerms)

  if (!weather?.hasLiveWeather) {
    return asksClothes
      ? 'Jag har ingen väderdata just nu, så jag kan inte säga om jacka behövs.'
      : 'Jag har ingen väderdata just nu, så jag gissar inte på temperatur eller kläder.'
  }

  const city = weather.city ? ` i ${weather.city}` : ''
  const temperature = formatDegrees(weather.temperatureC)
  const condition = weather.condition || 'okänt väder'
  const feels = Number.isFinite(Number(weather.feelsLikeC))
    ? ` Känns som ${formatDegrees(weather.feelsLikeC)}.`
    : ' Känns som saknas.'
  const weatherLine = `Just nu är det ${temperature}${city}, ${condition}.${feels}`

  if (!asksClothes) return weatherLine

  if (clothing?.available && clothing.lines?.length) {
    return `${weatherLine} ${clothing.lines[0]}`
  }

  return `${weatherLine} Jag har för lite väderdata för ett klädråd.`
}
