import { useEffect, useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import './SchoolCardEnhancer.js'
import './FamilyMapView.css'

function locationKey(location) {
  return `${location.family_id}:${location.user_id}`
}

function mapUrlForLocation(location) {
  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
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

function FamilyMapView({ locations, familyMembers }) {
  const validLocations = useMemo(() => {
    const seen = new Set()

    return (locations || []).filter((location) => {
      if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return false

      const key = locationKey(location)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [locations])

  const entries = useMemo(() => {
    const baseNames = validLocations.map((location) => (
      location.display_name || displayNameForUser(familyMembers, location.user_id)
    ))
    const totals = baseNames.reduce((counts, name) => {
      counts[name] = (counts[name] || 0) + 1
      return counts
    }, {})
    const seen = {}

    return validLocations.map((location, index) => {
      const baseName = baseNames[index]
      seen[baseName] = (seen[baseName] || 0) + 1
      return {
        location,
        key: locationKey(location),
        label: totals[baseName] > 1 ? `${baseName} ${seen[baseName]}` : baseName,
      }
    })
  }, [familyMembers, validLocations])

  const [selectedKey, setSelectedKey] = useState(() => entries[0]?.key || '')

  useEffect(() => {
    if (!entries.length) {
      setSelectedKey('')
      return
    }
    if (!entries.some((entry) => entry.key === selectedKey)) setSelectedKey(entries[0].key)
  }, [entries, selectedKey])

  if (!entries.length) return null

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) || entries[0]
  const selectedLocation = selectedEntry.location

  return (
    <div className="family-map-view">
      {entries.length > 1 ? (
        <div className="family-map-person-switcher" aria-label="Välj familjemedlem på kartan">
          {entries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={entry.key === selectedEntry.key}
              onClick={() => setSelectedKey(entry.key)}
            >
              📍 {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="family-map-frame">
        <iframe
          key={selectedEntry.key}
          title={`Karta – ${selectedEntry.label}`}
          src={mapUrlForLocation(selectedLocation)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="family-map-selected" aria-live="polite">
        <strong>📍 {selectedEntry.label}</strong>
        <span>{Number(selectedLocation.latitude).toFixed(5)}, {Number(selectedLocation.longitude).toFixed(5)}</span>
        {selectedLocation.accuracy_meters != null ? <span>Noggrannhet ±{Math.round(selectedLocation.accuracy_meters)} m</span> : null}
        {selectedLocation.location_recorded_at ? <small>Uppdaterad {new Date(selectedLocation.location_recorded_at).toLocaleString()}</small> : null}
      </div>

      <p className="family-map-provider-note"><small>Kartan visas av OpenStreetMap. Endast området runt den valda delade positionen begärs när kartan öppnas.</small></p>
    </div>
  )
}

export default FamilyMapView
