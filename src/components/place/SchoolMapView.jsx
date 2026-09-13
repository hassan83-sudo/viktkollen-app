import { useMemo } from 'react'
import './FamilyMapView.css'

function mapUrlForPlace(place) {
  const latitude = Number(place.latitude)
  const longitude = Number(place.longitude)
  const latitudePadding = 0.006
  const longitudePadding = Math.max(0.008, latitudePadding / Math.max(Math.cos(latitude * Math.PI / 180), 0.35))
  const params = new URLSearchParams({
    bbox: [
      longitude - longitudePadding,
      latitude - latitudePadding,
      longitude + longitudePadding,
      latitude + latitudePadding,
    ].join(','),
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadius = 6371000
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function SchoolMapView({ school, familyLocations = [] }) {
  const latestLocation = familyLocations[0]
  const status = useMemo(() => {
    if (!latestLocation) return null
    const distance = distanceMeters(
      Number(latestLocation.latitude),
      Number(latestLocation.longitude),
      Number(school.latitude),
      Number(school.longitude),
    )
    const radius = Number.isFinite(Number(school.radius_meters)) ? Number(school.radius_meters) : 150
    return { distance, inside: distance <= radius, radius }
  }, [latestLocation, school])

  return (
    <div className="family-map-view school-map-view">
      <div className="family-map-frame">
        <iframe
          title={`Karta – ${school.name || 'Skola'}`}
          src={mapUrlForPlace(school)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="family-map-selected" aria-live="polite">
        <strong>🏫 {school.name || 'Skola'}</strong>
        <span>{Number(school.latitude).toFixed(5)}, {Number(school.longitude).toFixed(5)}</span>
        <span>Skolområde ±{Math.round(Number(school.radius_meters) || 150)} m</span>
        {status ? <strong>{status.inside ? 'Vid skolan' : `Utanför skolområdet · ca ${Math.round(status.distance)} m bort`}</strong> : <span>Ingen delad familjeposition finns ännu.</span>}
      </div>
      <p className="family-map-provider-note"><small>Kartan visas av OpenStreetMap. Skolans plats är en plats som familjen själv har sparat.</small></p>
    </div>
  )
}

export default SchoolMapView
