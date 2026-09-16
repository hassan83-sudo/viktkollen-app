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
  const currentGust = Number(payload?.current?.wind_gusts_10m)
  return Number.isFinite(currentGust) ? Math.round(currentGust) : null
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

function createDetails(button) {
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

  const head = document.createElement('div')
  head.style.display = 'flex'
  head.style.alignItems = 'flex-start'
  head.style.justifyContent = 'space-between'
  head.style.gap = '10px'

  const text = document.createElement('strong')
  text.textContent = 'Vindbyar är oregelbundna och kan komma efter några sekunder eller flera minuter.'
  head.appendChild(text)

  const close = document.createElement('button')
  close.type = 'button'
  close.setAttribute('aria-label', 'Stäng information om byvind')
  close.textContent = '×'
  close.style.border = '0'
  close.style.background = 'transparent'
  close.style.color = 'inherit'
  close.style.font = 'inherit'
  close.style.fontSize = '18px'
  close.style.lineHeight = '1'
  close.style.padding = '0 2px'
  close.style.cursor = 'pointer'
  close.addEventListener('click', () => {
    panel.hidden = true
    button.setAttribute('aria-expanded', 'false')
  })
  head.appendChild(close)

  panel.appendChild(head)
  return panel
}

async function enhanceWeatherRow(row) {
  if (!row || row.getAttribute(GUST_ATTR) === '1') return
  row.setAttribute(GUST_ATTR, '1')

  try {
    const gust = await getWindGust()
    if (gust === null || !row.isConnected) return

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'overview-wind-gust'
    button.textContent = `(byvind ${gust} m/s)`
    button.setAttribute('aria-expanded', 'false')
    button.style.border = '0'
    button.style.background = 'transparent'
    button.style.color = 'inherit'
    button.style.padding = '0'
    button.style.font = 'inherit'
    button.style.cursor = 'pointer'
    button.style.textDecoration = 'underline'
    button.style.textUnderlineOffset = '2px'

    const panel = createDetails(button)
    button.addEventListener('click', () => {
      const open = panel.hidden
      panel.hidden = !open
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
    })

    const weatherValues = Array.from(row.querySelectorAll(':scope > span'))
    const windText = weatherValues.find((span) => /m\/s/.test(span.textContent || ''))
    if (windText) {
      const windIndex = weatherValues.indexOf(windText)
      weatherValues.forEach((value, index) => {
        value.style.order = String(index < windIndex ? index + 1 : index + 2)
      })
      windText.style.order = String(windIndex + 1)
      button.style.order = String(windIndex + 2)
      row.querySelectorAll(':scope > button, :scope > a').forEach((action) => {
        action.style.order = '99'
      })
      row.appendChild(button)
    } else {
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
