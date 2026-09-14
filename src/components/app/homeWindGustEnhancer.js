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

function formatHour(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(date)
}

async function fetchWindGust() {
  const coords = await getCoords()
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(coords.latitude))
  url.searchParams.set('longitude', String(coords.longitude))
  url.searchParams.set('current', 'wind_gusts_10m')
  url.searchParams.set('hourly', 'wind_gusts_10m')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url)
  if (!response.ok) throw new Error('gust_unavailable')
  const payload = await response.json()
  const currentGust = Number(payload?.current?.wind_gusts_10m)
  const times = Array.isArray(payload?.hourly?.time) ? payload.hourly.time : []
  const gusts = Array.isArray(payload?.hourly?.wind_gusts_10m) ? payload.hourly.wind_gusts_10m : []
  const now = Date.now()
  const upcoming = times
    .map((time, index) => ({
      time,
      gust: Number(gusts[index]),
      timestamp: new Date(time).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.gust) && Number.isFinite(entry.timestamp) && entry.timestamp >= now - 30 * 60 * 1000)
    .slice(0, 6)

  return {
    current: Number.isFinite(currentGust) ? Math.round(currentGust) : null,
    upcoming,
  }
}

let cachedData = null
let cachedAt = 0
let requestInFlight = null

async function getWindGust() {
  const now = Date.now()
  if (cachedData && now - cachedAt < 10 * 60 * 1000) return cachedData
  if (requestInFlight) return requestInFlight

  requestInFlight = fetchWindGust()
    .then((data) => {
      cachedData = data
      cachedAt = Date.now()
      return data
    })
    .finally(() => {
      requestInFlight = null
    })

  return requestInFlight
}

function createDetails(data) {
  const panel = document.createElement('div')
  panel.className = 'overview-wind-gust-details'
  panel.hidden = true
  panel.style.width = '100%'
  panel.style.padding = '8px 10px'
  panel.style.marginTop = '6px'
  panel.style.borderRadius = '10px'
  panel.style.background = 'rgba(7, 17, 35, 0.82)'
  panel.style.border = '1px solid rgba(148, 163, 184, 0.22)'
  panel.style.fontSize = '12px'
  panel.style.lineHeight = '1.45'

  const timing = document.createElement('strong')
  timing.style.display = 'block'
  timing.style.marginBottom = '7px'
  timing.textContent = 'Vindbyar är oregelbundna och kan komma efter några sekunder eller flera minuter.'
  panel.appendChild(timing)

  const title = document.createElement('strong')
  title.textContent = 'Byvind – kommande timmar'
  panel.appendChild(title)

  if (data.upcoming.length) {
    const list = document.createElement('div')
    list.style.display = 'flex'
    list.style.flexWrap = 'wrap'
    list.style.gap = '5px 10px'
    list.style.marginTop = '5px'
    data.upcoming.forEach((entry) => {
      const item = document.createElement('span')
      item.textContent = `${formatHour(entry.time)}: ${Math.round(entry.gust)} m/s`
      list.appendChild(item)
    })
    panel.appendChild(list)
  }

  const note = document.createElement('small')
  note.style.display = 'block'
  note.style.marginTop = '6px'
  note.textContent = 'Prognosen visar högsta byvind per timme. Exakt hur många vindbyar som kommer under timmen går inte att se i väderprognosen.'
  panel.appendChild(note)

  return panel
}

async function enhanceWeatherRow(row) {
  if (!row || row.getAttribute(GUST_ATTR) === '1') return
  row.setAttribute(GUST_ATTR, '1')

  try {
    const data = await getWindGust()
    if (data.current === null || !row.isConnected) return

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'overview-wind-gust'
    button.textContent = `💨 ${data.current} m/s byvind`
    button.setAttribute('aria-expanded', 'false')
    button.style.border = '0'
    button.style.background = 'transparent'
    button.style.color = 'inherit'
    button.style.padding = '0'
    button.style.font = 'inherit'
    button.style.cursor = 'pointer'
    button.style.textDecoration = 'underline'
    button.style.textUnderlineOffset = '2px'

    const panel = createDetails(data)
    button.addEventListener('click', () => {
      const open = panel.hidden
      panel.hidden = !open
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
    })

    const windText = Array.from(row.querySelectorAll('span')).find((span) => /m\/s/.test(span.textContent || ''))
    if (windText) row.insertBefore(button, windText)
    else {
      const detailsButton = row.querySelector('button, a')
      if (detailsButton) row.insertBefore(button, detailsButton)
      else row.appendChild(button)
    }
    row.insertAdjacentElement('afterend', panel)
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
