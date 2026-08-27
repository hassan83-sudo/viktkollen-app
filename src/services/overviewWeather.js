export const defaultWeatherLocation = {
  city: 'Helsingborg',
  latitude: 56.0467,
  longitude: 12.6945,
}

const weatherByCode = {
  0: { condition: 'Klart', icon: '☀️' },
  1: { condition: 'Mestadels klart', icon: '🌤' },
  2: { condition: 'Halvklart', icon: '⛅' },
  3: { condition: 'Mulet', icon: '☁' },
  45: { condition: 'Dimma', icon: '🌫' },
  48: { condition: 'Dimma', icon: '🌫' },
  51: { condition: 'Duggregn', icon: '🌦' },
  61: { condition: 'Regn', icon: '🌧' },
  63: { condition: 'Regn', icon: '🌧' },
  71: { condition: 'Snö', icon: '❄' },
  80: { condition: 'Skurar', icon: '🌦' },
  95: { condition: 'Åska', icon: '⛈' },
}

function formatClock(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--:--'
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(parsed)
}

function mapWeatherCode(code) {
  return weatherByCode[Number(code)] || weatherByCode[3]
}

function mapHourlyForecast(hourly = {}) {
  const times = Array.isArray(hourly.time) ? hourly.time : []
  if (!times.length) return []

  return times.map((time, index) => {
    const temperatureC = Number(hourly.temperature_2m?.[index])
    const windSpeedMs = Number(hourly.wind_speed_10m?.[index])
    const precipitationRiskPercent = Number(hourly.precipitation_probability?.[index])
    const uvIndex = Number(hourly.uv_index?.[index])
    const mapped = mapWeatherCode(hourly.weather_code?.[index])

    return {
      time,
      timeLabel: formatClock(time),
      temperatureC: Number.isFinite(temperatureC) ? temperatureC : null,
      windSpeedMs: Number.isFinite(windSpeedMs) ? windSpeedMs : null,
      precipitationRiskPercent: Number.isFinite(precipitationRiskPercent) ? precipitationRiskPercent : null,
      uvIndex: Number.isFinite(uvIndex) ? uvIndex : null,
      condition: mapped.condition,
      icon: mapped.icon,
      weatherCode: Number(hourly.weather_code?.[index]),
    }
  }).filter((entry) => entry.temperatureC !== null)
}

export function mapOpenMeteoWeather(payload = {}, city = 'Din plats') {
  const current = payload.current || {}
  const daily = payload.daily || {}
  const mapped = mapWeatherCode(current.weather_code)
  const temperatureC = Number(current.temperature_2m)
  const feelsLikeC = Number(current.apparent_temperature)
  const windSpeedMs = Number(current.wind_speed_10m)
  const precipitationRiskPercent = Number(current.precipitation_probability ?? daily.precipitation_probability_max?.[0])
  const hourly = mapHourlyForecast(payload.hourly)
  const fetchedAt = current.time || payload.hourly?.time?.[0] || null

  if (!Number.isFinite(temperatureC)) {
    return {
      city,
      condition: 'Väder ej kopplat',
      feelsLikeC: null,
      hasLiveWeather: false,
      hourly: [],
      icon: '☁',
      precipitationRiskPercent: null,
      sourceLabel: 'Open-Meteo',
      sunrise: null,
      sunriseLabel: '--:--',
      sunset: null,
      sunsetLabel: '--:--',
      temperatureC: null,
      updatedAt: null,
      windSpeedMs: null,
    }
  }

  return {
    city,
    condition: mapped.condition,
    feelsLikeC: Number.isFinite(feelsLikeC) ? feelsLikeC : null,
    hasLiveWeather: true,
    hourly,
    icon: mapped.icon,
    precipitationRiskPercent: Number.isFinite(precipitationRiskPercent) ? precipitationRiskPercent : null,
    sourceLabel: 'Open-Meteo',
    sunrise: daily.sunrise?.[0] || null,
    sunriseLabel: formatClock(daily.sunrise?.[0]),
    sunset: daily.sunset?.[0] || null,
    sunsetLabel: formatClock(daily.sunset?.[0]),
    temperatureC,
    updatedAt: fetchedAt,
    windSpeedMs: Number.isFinite(windSpeedMs) ? windSpeedMs : null,
  }
}

function buildForecastUrl(coords, { includeHourly = false } = {}) {
  const latitude = Number(coords?.latitude)
  const longitude = Number(coords?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('missing_coordinates')
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation_probability')
  url.searchParams.set('daily', 'sunrise,sunset,precipitation_probability_max')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('wind_speed_unit', 'ms')

  if (includeHourly) {
    url.searchParams.set(
      'hourly',
      'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,uv_index',
    )
  }

  return url
}

export async function fetchOpenMeteoWeather(coords, fetchImpl = fetch, options = {}) {
  const url = buildForecastUrl(coords, options)
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error('weather_unavailable')
  return mapOpenMeteoWeather(await response.json(), coords.city || 'Din plats')
}

export async function loadOverviewWeather({
  preferDevice = false,
  fetchImpl = fetch,
  geolocation,
  includeHourly = false,
} = {}) {
  if (preferDevice) {
    try {
      const coords = await requestDeviceLocation(geolocation)
      return fetchOpenMeteoWeather({ ...coords, city: 'Din plats' }, fetchImpl, { includeHourly })
    } catch {
      // Fall back to a real city forecast instead of leaving weather disconnected.
    }
  }

  return fetchOpenMeteoWeather(defaultWeatherLocation, fetchImpl, { includeHourly })
}

export function requestDeviceLocation(geolocation = typeof navigator === 'undefined' ? null : navigator.geolocation) {
  if (!geolocation?.getCurrentPosition) {
    return Promise.reject(new Error('geolocation_unavailable'))
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => reject(new Error('geolocation_denied')),
      { enableHighAccuracy: false, maximumAge: 15 * 60 * 1000, timeout: 8000 },
    )
  })
}
