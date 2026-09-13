const FAMILY_MAP_SELECTOR = '.ready-modal[aria-label="Familjekarta"]'
const ENHANCED_ATTR = 'data-family-map-enhanced'

function readLocations(modal) {
  return Array.from(modal.querySelectorAll(':scope > ul > li')).map((item, index) => {
    const name = item.querySelector('strong')?.textContent?.trim() || `Familjemedlem ${index + 1}`
    const coordinateText = item.querySelector('span')?.textContent || ''
    const match = coordinateText.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)

    if (!match) return null

    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

    return { name, latitude, longitude }
  }).filter(Boolean)
}

function buildMapUrl({ latitude, longitude }) {
  const deltaLat = 0.006
  const deltaLon = 0.01
  const left = longitude - deltaLon
  const bottom = latitude - deltaLat
  const right = longitude + deltaLon
  const top = latitude + deltaLat

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${left},${bottom},${right},${top}`)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`
}

function enhanceFamilyMap(modal) {
  if (!modal || modal.getAttribute(ENHANCED_ATTR) === 'true') return

  const locations = readLocations(modal)
  if (locations.length === 0) return

  modal.setAttribute(ENHANCED_ATTR, 'true')

  const mapWrap = document.createElement('section')
  mapWrap.className = 'family-map-live-map'
  mapWrap.setAttribute('aria-label', 'Karta med familjens senaste plats')

  const controls = document.createElement('div')
  controls.className = 'family-map-person-buttons'
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', 'Välj familjemedlem på kartan')

  const iframe = document.createElement('iframe')
  iframe.className = 'family-map-osm-frame'
  iframe.title = `Karta: ${locations[0].name}`
  iframe.loading = 'eager'
  iframe.referrerPolicy = 'no-referrer-when-downgrade'
  iframe.setAttribute('allowfullscreen', '')

  function showLocation(location, activeButton) {
    iframe.src = buildMapUrl(location)
    iframe.title = `Karta: ${location.name}`
    controls.querySelectorAll('button').forEach((button) => {
      const active = button === activeButton
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
    })
  }

  locations.forEach((location, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'family-map-person-button'
    button.textContent = `📍 ${location.name}`
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false')
    if (index === 0) button.classList.add('is-active')
    button.addEventListener('click', () => showLocation(location, button))
    controls.appendChild(button)
  })

  mapWrap.appendChild(controls)
  mapWrap.appendChild(iframe)

  const list = modal.querySelector(':scope > ul')
  if (list) modal.insertBefore(mapWrap, list)
  else modal.appendChild(mapWrap)

  showLocation(locations[0], controls.querySelector('button'))
}

function scanForFamilyMap() {
  document.querySelectorAll(FAMILY_MAP_SELECTOR).forEach(enhanceFamilyMap)
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => {
    scanForFamilyMap()
    const observer = new MutationObserver(scanForFamilyMap)
    observer.observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
}
