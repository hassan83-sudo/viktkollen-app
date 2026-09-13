import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import {
  formatRelativeLocationUpdate,
  getOwnLocationStatus,
} from '../../features/place/placeLocationStatus.js'

function mapEmbedUrl(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''

  const delta = 0.006
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`
}

function mapLinkUrl(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`
}

function PlaceLocationStatusPanel({
  activeSharingStatus,
  familyLocations,
  familyLocationsLoaded,
  familyMembers,
  sharingEnabled,
}) {
  return (
    <section className="place-card place-location-status-panel" aria-labelledby="place-location-status-title">
      <h2 id="place-location-status-title">📡 Platsstatus</h2>
      <p>
        <strong>Din plats:</strong>{' '}
        {getOwnLocationStatus({
          sharingEnabled,
          active: activeSharingStatus?.active,
          paused: activeSharingStatus?.paused,
          lastUpdatedAt: activeSharingStatus?.lastUpdatedAt,
        })}
      </p>
      {activeSharingStatus?.accuracyMeters != null ? (
        <p><small>Noggrannhet ±{Math.round(activeSharingStatus.accuracyMeters)} m</small></p>
      ) : null}

      {familyLocationsLoaded && familyLocations.length > 0 ? (
        <div className="place-location-status-family">
          <p><strong>Familjens senaste delade plats</strong></p>
          <ul>
            {familyLocations.map((location) => {
              const name = location.display_name || displayNameForUser(familyMembers, location.user_id)
              const embedUrl = mapEmbedUrl(location.latitude, location.longitude)
              const externalUrl = mapLinkUrl(location.latitude, location.longitude)

              return (
                <li key={`${location.family_id}:${location.user_id}`} className="place-location-map-card">
                  <div className="place-location-map-meta">
                    <strong>{name}</strong>{' '}
                    <span>{formatRelativeLocationUpdate(location.location_recorded_at)}</span>
                    {location.accuracy_meters != null ? <small> · ±{Math.round(location.accuracy_meters)} m</small> : null}
                  </div>
                  {embedUrl ? (
                    <div className="place-location-map-wrap">
                      <iframe
                        className="place-location-map"
                        src={embedUrl}
                        title={`Karta för ${name}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <a className="place-location-map-link" href={externalUrl} target="_blank" rel="noreferrer">
                        Öppna större karta
                      </a>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : familyLocationsLoaded ? (
        <p><small>Ingen familjemedlem delar en aktuell plats just nu.</small></p>
      ) : (
        <p><small>Hämtar platsstatus…</small></p>
      )}
    </section>
  )
}

export default PlaceLocationStatusPanel
