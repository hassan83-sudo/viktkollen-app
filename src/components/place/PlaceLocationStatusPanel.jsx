import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import {
  formatRelativeLocationUpdate,
  getOwnLocationStatus,
} from '../../features/place/placeLocationStatus.js'

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
            {familyLocations.map((location) => (
              <li key={`${location.family_id}:${location.user_id}`}>
                <strong>{location.display_name || displayNameForUser(familyMembers, location.user_id)}</strong>{' '}
                <span>{formatRelativeLocationUpdate(location.location_recorded_at)}</span>
                {location.accuracy_meters != null ? <small> · ±{Math.round(location.accuracy_meters)} m</small> : null}
              </li>
            ))}
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
