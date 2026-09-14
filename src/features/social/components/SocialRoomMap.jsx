import { useMemo, useState } from 'react'
import '../SocialRoomMap.css'

function mapUrl(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  const latPad = 0.006
  const lonPad = Math.max(0.008, latPad / Math.max(Math.cos(lat * Math.PI / 180), 0.35))
  const params = new URLSearchParams({
    bbox: [lon - lonPad, lat - latPad, lon + lonPad, lat + latPad].join(','),
    layer: 'mapnik',
    marker: `${lat},${lon}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function SocialRoomMap() {
  const [enabled, setEnabled] = useState(false)
  const [location, setLocation] = useState(null)
  const [status, setStatus] = useState('Kartan är avstängd.')
  const src = useMemo(() => location ? mapUrl(location.latitude, location.longitude) : '', [location])

  function turnOff() {
    setEnabled(false)
    setLocation(null)
    setStatus('Kartan är avstängd. Din plats visas inte här.')
  }

  function turnOn() {
    if (!navigator.geolocation) {
      setStatus('Platsfunktionen stöds inte på den här enheten.')
      return
    }
    setStatus('Hämtar din plats…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setEnabled(true)
        setStatus('Kartan är på. Endast din egen plats visas i den här vyn.')
      },
      () => {
        setEnabled(false)
        setLocation(null)
        setStatus('Kunde inte hämta platsen. Kontrollera platsbehörigheten.')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  }

  return (
    <article className="social-room-card is-wide social-room-map-card">
      <div className="social-room-map-head">
        <div>
          <p className="social-room-eyebrow">Plats</p>
          <h2>Karta</h2>
        </div>
        <button
          className={enabled ? 'secondary-button' : 'primary-button'}
          type="button"
          aria-pressed={enabled}
          onClick={enabled ? turnOff : turnOn}
        >
          {enabled ? 'Stäng av karta' : 'Slå på karta'}
        </button>
      </div>

      <p className="social-room-status" role="status">{status}</p>

      {enabled && location ? (
        <>
          <div className="social-room-map-frame">
            <iframe
              title="Din plats på karta"
              src={src}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <small>
            Noggrannhet cirka {Math.round(location.accuracy)} m. Kartan visas av OpenStreetMap.
          </small>
        </>
      ) : (
        <div className="social-room-map-off" aria-hidden="true">🗺️</div>
      )}

      <small>Platsdelning med vänner är inte automatiskt aktiverad. Kartan måste slås på av användaren.</small>
    </article>
  )
}

export default SocialRoomMap
