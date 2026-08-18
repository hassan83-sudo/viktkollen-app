const fallbackCity = 'Vald stad'

function formatDateParts(date) {
  const weekday = new Intl.DateTimeFormat('sv-SE', { weekday: 'long' }).format(date)
  const dateLabel = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(date)

  return {
    dateLabel,
    weekday,
  }
}

function formatTime(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function createPlaceholderSunTimes() {
  return {
    sunrise: null,
    sunriseLabel: '--:--',
    sunset: null,
    sunsetLabel: '--:--',
  }
}

export function createFallbackWeatherContext() {
  return {
    city: fallbackCity,
    condition: 'Väder ej kopplat',
    hasLiveWeather: false,
    icon: '☁',
    precipitationRiskPercent: null,
    sourceLabel: 'Fallback',
    ...createPlaceholderSunTimes(),
    temperatureC: null,
    windSpeedMs: null,
  }
}

export function createOverviewLiveContext(now = new Date(), weather = createFallbackWeatherContext()) {
  return {
    ...formatDateParts(now),
    timeLabel: formatTime(now),
    updatedAt: now.toISOString(),
    weather,
  }
}

export function formatWeatherValue(value, suffix) {
  if (value === null || value === undefined || value === '') return `--${suffix}`

  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}${suffix}` : `--${suffix}`
}

export function getWeatherPermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return Promise.resolve('unsupported')
  }

  return navigator.permissions
    .query({ name: 'geolocation' })
    .then((result) => result.state)
    .catch(() => 'unsupported')
}
