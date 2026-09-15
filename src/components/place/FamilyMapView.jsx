import { useEffect, useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import './SchoolCardEnhancer.js'
import './FamilyMapView.css'

const positionFrequencyOptions = [
  ['live', 'Live'],
  ['10m', '10 min'],
  ['30m', '30 min'],
  ['1h', '1 timme'],
  ['battery', 'Batterispar'],
]

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

function relativeUpdatedAt(value) {
  if (!value) return 'okänd tid'
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (!Number.isFinite(ageSeconds)) return 'okänd tid'
  if (ageSeconds < 60) return 'nu'
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} min sedan`
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)} tim sedan`
  return new Date(value).toLocaleString()
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
  const [positionFrequency, setPositionFrequency] = useState('30m')
  const [cardNotice, setCardNotice] = useState('')

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
  const updatedLabel = relativeUpdatedAt(selectedLocation.location_recorded_at)
  const isLive = selectedLocation.location_recorded_at
    ? Date.now() - new Date(selectedLocation.location_recorded_at).getTime() < 2 * 60 * 1000
    : false

  function showPlannedFeature(label) {
    setCardNotice(`${label} kopplas in när den funktionen har riktig data.`)
  }

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

      <article className="family-map-person-card" aria-live="polite">
        <div className="family-map-person-card-heading">
          <strong>{selectedEntry.label}</strong>
          <span className={isLive ? 'is-live' : ''}>{isLive ? '🟢 LIVE' : 'Senaste position'}</span>
        </div>
        <p>📍 Delad position</p>
        <small>Senast uppdaterad: {updatedLabel}</small>
        {selectedLocation.accuracy_meters != null ? <small>Noggrannhet ±{Math.round(selectedLocation.accuracy_meters)} m</small> : null}

        <div className="family-map-person-actions">
          <button type="button" onClick={() => showPlannedFeature('Följ live')}>Följ live</button>
          <button type="button" onClick={() => showPlannedFeature('Prata')}>Prata</button>
          <button type="button" onClick={() => showPlannedFeature('Historik')}>Historik</button>
        </div>

        <label className="family-map-frequency">
          <span>Positionsfrekvens</span>
          <select value={positionFrequency} onChange={(event) => setPositionFrequency(event.target.value)}>
            {positionFrequencyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {cardNotice ? <p className="family-map-card-notice" role="status">{cardNotice}</p> : null}
      </article>

      <div className="family-map-selected">
        <strong>Position</strong>
        <span>{Number(selectedLocation.latitude).toFixed(5)}, {Number(selectedLocation.longitude).toFixed(5)}</span>
      </div>

      <p className="family-map-provider-note"><small>Kartan visas av OpenStreetMap. Endast området runt den valda delade positionen begärs när kartan öppnas.</small></p>
    </div>
  )
}

export default FamilyMapView