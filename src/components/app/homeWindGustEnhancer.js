const WEATHER_ROW_SELECTOR = '.overview-weather-row'
const GUST_ATTR = 'data-wind-gust-enhanced'
const DEFAULT_COORDS = { latitude: 56.0467, longitude: 12.6945 }

async function getCoords() {
  try {
    if (!navigator.permissions?.query || !navigator.geolocation?.getCurrentPosition) return DEFAULT_COORDS
    const permission = await navigator.permissions.query({ name: 'geolocation' })
    if (permission.state !== 'granted') return DEFAULT_COORDS

    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
        () => resolve(DEFAULT_COORDS),
        { enableHighAccuracy: false, maximumAge: 15 * 60 * 1000, timeout: 4000 },
      )
    })
  } catch {
    return DEFAULT_COORDS
  }
}

async function fetchWindGust() {
  const coords = await getCoords()
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(coords.latitude))
  url.searchParams.set('longitude', String(coords.longitude))
  url.searchParams.set('current', 'wind_gusts_10m')
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url)
  if (!response.ok) throw new Error('gust_unavailable')
  const payload = await response.json()
  const gust = Number(payload?.current?.wind_gusts_10m)
  return Number.isFinite(gust) ? Math.round(gust) : null
}

let cachedGust = null
let cachedAt = 0
let requestInFlight = null

async function getWindGust() {
  const now = Date.now()
  if (cachedGust !== null && now - cachedAt < 10 * 60 * 1000) return cachedGust
  if (requestInFlight) return requestInFlight

  requestInFlight = fetchWindGust()
    .then((gust) => {
      cachedGust = gust
      cachedAt = Date.now()
      return gust
    })
    .finally(() => {
      requestInFlight = null
    })

  return requestInFlight
}

async function enhanceWeatherRow(row) {
  if (!row || row.getAttribute(GUST_ATTR) === '1') return
  row.setAttribute(GUST_ATTR, '1')

  try {
    const gust = await getWindGust()
    if (gust === null || !row.isConnected) return

    const span = document.createElement('span')
    span.className = 'overview-wind-gust'
    span.textContent = `💨 ${gust} m/s byvind`

    const detailsButton = row.querySelector('button, a')
    if (detailsButton) row.insertBefore(span, detailsButton)
    else row.appendChild(span)
  } catch {
    row.removeAttribute(GUST_ATTR)
  }
}

function scan() {
  document.querySelectorAll(WEATHER_ROW_SELECTOR).forEach((row) => {
    void enhanceWeatherRow(row)
  })
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true })
  } else {
    scan()
  }

  const observer = new MutationObserver(scan)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true })
}
