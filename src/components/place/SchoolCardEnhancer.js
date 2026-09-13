import { createSafePlaceFromOwnLatestLocation, loadSafePlaces } from '../../features/place/placeSafePlacesService.js'

function mapUrlForPlace(place) {
  const latitude = Number(place.latitude)
  const longitude = Number(place.longitude)
  const latitudePadding = 0.006
  const longitudePadding = Math.max(0.008, latitudePadding / Math.max(Math.cos(latitude * Math.PI / 180), 0.35))
  const params = new URLSearchParams({
    bbox: [longitude - longitudePadding, latitude - latitudePadding, longitude + longitudePadding, latitude + latitudePadding].join(','),
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function schoolPlace(places) {
  return (places || []).find((place) => /(^|\s)(skola|school)(\s|$)/i.test(String(place?.name || '')))
}

function renameSchoolCard() {
  document.querySelectorAll('#app-section-place .place-feature-card').forEach((card) => {
    const heading = card.querySelector('h3')
    if (heading?.textContent?.trim() !== 'Status') return
    heading.textContent = 'Skola'
    const body = card.querySelector('p')
    if (body) body.textContent = 'Se skolans sparade plats på karta och använd skolområdet för platsstatus.'
  })
}

function insertSchoolMap(modal, school, closeButton) {
  const view = document.createElement('div')
  view.className = 'family-map-view school-map-view'

  const frame = document.createElement('div')
  frame.className = 'family-map-frame'
  const iframe = document.createElement('iframe')
  iframe.title = `Karta – ${school.name || 'Skola'}`
  iframe.src = mapUrlForPlace(school)
  iframe.loading = 'lazy'
  iframe.referrerPolicy = 'no-referrer-when-downgrade'
  frame.appendChild(iframe)

  const details = document.createElement('div')
  details.className = 'family-map-selected'
  const name = document.createElement('strong')
  name.textContent = `🏫 ${school.name || 'Skola'}`
  const coordinates = document.createElement('span')
  coordinates.textContent = `${Number(school.latitude).toFixed(5)}, ${Number(school.longitude).toFixed(5)}`
  const radius = document.createElement('span')
  radius.textContent = `Skolområde ±${Math.round(Number(school.radius_meters) || 150)} m`
  details.append(name, coordinates, radius)

  const note = document.createElement('p')
  note.className = 'family-map-provider-note'
  note.innerHTML = '<small>Kartan visas av OpenStreetMap. Skolans plats är den plats familjen själv har sparat.</small>'

  view.append(frame, details, note)
  modal.insertBefore(view, closeButton || null)
}

function insertEmptySchoolState(modal, closeButton) {
  const panel = document.createElement('div')
  panel.className = 'family-map-selected school-map-empty'

  const title = document.createElement('strong')
  title.textContent = 'Ingen skola är sparad ännu.'

  const text = document.createElement('span')
  text.textContent = 'När du står vid skolan kan du spara din senaste delade GPS-position direkt som Skola.'

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '📍 Spara min position som Skola'

  const status = document.createElement('small')
  status.setAttribute('aria-live', 'polite')

  button.addEventListener('click', async () => {
    button.disabled = true
    status.textContent = 'Sparar skolans position…'

    const { data, error } = await createSafePlaceFromOwnLatestLocation('Skola', 150)
    if (!modal.isConnected) return

    if (error || !data) {
      button.disabled = false
      status.textContent = error?.message || 'Skolans position kunde inte sparas.'
      return
    }

    panel.remove()
    insertSchoolMap(modal, data, closeButton)
  })

  panel.append(title, text, button, status)
  modal.insertBefore(panel, closeButton || null)
}

async function enhanceSchoolModal(modal) {
  if (!modal || modal.dataset.schoolEnhanced === 'true') return
  const heading = modal.querySelector('h3')
  if (heading?.textContent?.trim() !== 'Status') return

  modal.dataset.schoolEnhanced = 'true'
  modal.setAttribute('aria-label', 'Skola')
  heading.textContent = '🏫 Skola'

  const closeButton = Array.from(modal.children).find((node) => node.tagName === 'BUTTON')
  Array.from(modal.children).forEach((node) => {
    if (node !== heading && node !== closeButton) node.remove()
  })

  const loading = document.createElement('p')
  loading.textContent = 'Hämtar skolans plats…'
  modal.insertBefore(loading, closeButton || null)

  const { data, error } = await loadSafePlaces()
  if (!modal.isConnected) return
  loading.remove()

  if (error) {
    const message = document.createElement('p')
    message.setAttribute('role', 'alert')
    message.textContent = error.message || 'Skolans plats kunde inte hämtas.'
    modal.insertBefore(message, closeButton || null)
    return
  }

  const school = schoolPlace(data)
  if (!school) {
    insertEmptySchoolState(modal, closeButton)
    return
  }

  insertSchoolMap(modal, school, closeButton)
}

function parseCoordinates(text) {
  const match = String(text || '').match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

function enhanceSafetyAlertMaps() {
  document.querySelectorAll('#app-section-place .ready-modal').forEach((modal) => {
    const heading = modal.querySelector('h3')
    if (!heading?.textContent?.includes('Trygghetslarm')) return

    modal.querySelectorAll('.place-safety-alert-history li').forEach((item, index) => {
      if (item.dataset.safetyMapEnhanced === 'true') return
      const locationText = Array.from(item.querySelectorAll('span')).find((span) => span.textContent?.trim().startsWith('📍'))
      const coordinates = parseCoordinates(locationText?.textContent)
      if (!coordinates) return

      item.dataset.safetyMapEnhanced = 'true'
      const frame = document.createElement('div')
      frame.className = 'family-map-frame safety-alert-map'

      const iframe = document.createElement('iframe')
      iframe.title = `Karta – trygghetslarm ${index + 1}`
      iframe.src = mapUrlForPlace(coordinates)
      iframe.loading = 'lazy'
      iframe.referrerPolicy = 'no-referrer-when-downgrade'
      frame.appendChild(iframe)
      item.appendChild(frame)
    })
  })
}

function applySchoolUi() {
  renameSchoolCard()
  document.querySelectorAll('#app-section-place .ready-modal').forEach((modal) => {
    void enhanceSchoolModal(modal)
  })
  enhanceSafetyAlertMaps()
}

if (typeof document !== 'undefined' && !window.__viktkollenSchoolCardEnhancer) {
  window.__viktkollenSchoolCardEnhancer = true
  const observer = new MutationObserver(applySchoolUi)
  const start = () => {
    applySchoolUi()
    observer.observe(document.body, { childList: true, subtree: true })
  }
  if (document.body) start()
  else window.addEventListener('DOMContentLoaded', start, { once: true })
}
