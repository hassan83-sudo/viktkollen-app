export const defaultWeatherLocation = {
  city: 'Stockholm',
  latitude: 59.3293,
  longitude: 18.0686,
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

export function mapOpenMeteoWeather(payload = {}, city = 'Din plats') {
  const current = payload.current || {}
  const daily = payload.daily || {}
  const mapped = weatherByCode[Number(current.weather_code)] || weatherByCode[3]
  const temperatureC = Number(current.temperature_2m)
  const feelsLikeC = Number(current.apparent_temperature)
  const windSpeedMs = Number(current.wind_speed_10m)
  const precipitationRiskPercent = Number(current.precipitation_probability ?? daily.precipitation_probability_max?.[0])

  if (!Number.isFinite(temperatureC)) {
    return {
      city,
      condition: 'Väder ej kopplat',
      feelsLikeC: null,
      hasLiveWeather: false,
      icon: '☁',
      precipitationRiskPercent: null,
      sourceLabel: 'Open-Meteo',
      sunrise: null,
      sunriseLabel: '--:--',
      sunset: null,
      sunsetLabel: '--:--',
      temperatureC: null,
      windSpeedMs: null,
    }
  }

  return {
    city,
    condition: mapped.condition,
    feelsLikeC: Number.isFinite(feelsLikeC) ? feelsLikeC : null,
    hasLiveWeather: true,
    icon: mapped.icon,
    precipitationRiskPercent: Number.isFinite(precipitationRiskPercent) ? precipitationRiskPercent : null,
    sourceLabel: 'Open-Meteo',
    sunrise: daily.sunrise?.[0] || null,
    sunriseLabel: formatClock(daily.sunrise?.[0]),
    sunset: daily.sunset?.[0] || null,
    sunsetLabel: formatClock(daily.sunset?.[0]),
    temperatureC,
    windSpeedMs: Number.isFinite(windSpeedMs) ? windSpeedMs : null,
  }
}

export async function fetchOpenMeteoWeather(coords, fetchImpl = fetch) {
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

  const response = await fetchImpl(url)
  if (!response.ok) throw new Error('weather_unavailable')
  return mapOpenMeteoWeather(await response.json(), coords.city || 'Din plats')
}

export async function loadOverviewWeather({ preferDevice = false, fetchImpl = fetch, geolocation } = {}) {
  if (preferDevice) {
    try {
      const coords = await requestDeviceLocation(geolocation)
      return fetchOpenMeteoWeather({ ...coords, city: 'Din plats' }, fetchImpl)
    } catch {
      // Fall back to a real city forecast instead of leaving weather disconnected.
    }
  }

  return fetchOpenMeteoWeather(defaultWeatherLocation, fetchImpl)
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
