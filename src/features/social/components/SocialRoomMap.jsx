import { useEffect, useMemo, useState } from 'react'
import {
  disableEncryptedSocialLocation,
  enableEncryptedSocialLocation,
  loadEncryptedFriendLocations,
  prepareSocialLocationEncryption,
} from '../services/socialLocationE2eeService.js'
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

function SocialRoomMap({ friends = [] }) {
  const [enabled, setEnabled] = useState(false)
  const [friendLocations, setFriendLocations] = useState([])
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [status, setStatus] = useState('Kartan är avstängd.')

  const selected = useMemo(
    () => friendLocations.find((entry) => entry.user_id === selectedFriendId) || friendLocations[0] || null,
    [friendLocations, selectedFriendId],
  )
  const src = useMemo(
    () => selected ? mapUrl(selected.latitude, selected.longitude) : '',
    [selected],
  )

  useEffect(() => {
    void prepareSocialLocationEncryption().catch(() => undefined)
  }, [])

  async function loadFriendLocations() {
    if (!friends.some((friend) => friend?.userId)) {
      setFriendLocations([])
      setSelectedFriendId('')
      return
    }

    const rows = await loadEncryptedFriendLocations(friends)
    setFriendLocations(rows)
    setSelectedFriendId((current) => rows.some((row) => row.user_id === current) ? current : rows[0]?.user_id || '')
  }

  useEffect(() => {
    if (!enabled) return undefined
    void loadFriendLocations().catch(() => setStatus('Kunde inte hämta vänners plats just nu.'))
    const timer = window.setInterval(() => {
      void loadFriendLocations().catch(() => {})
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [enabled, friends])

  async function turnOff() {
    setEnabled(false)
    setFriendLocations([])
    setSelectedFriendId('')
    setStatus('Kartan är avstängd. Din plats delas inte med vänner.')

    try {
      await disableEncryptedSocialLocation()
    } catch {
      // Keep the local map off even if the server cannot be reached.
    }
  }

  async function turnOn() {
    if (!navigator.geolocation) {
      setStatus('Platsfunktionen stöds inte på den här enheten.')
      return
    }

    setStatus('Hämtar din plats…')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await enableEncryptedSocialLocation(friends, position)

          setEnabled(true)
          setStatus('Kartan är på. Din plats delas bara med godkända vänner som också använder kartan.')
          await loadFriendLocations()
        } catch {
          setStatus('Kunde inte slå på platsdelningen just nu.')
        }
      },
      () => {
        setEnabled(false)
        setStatus('Kunde inte hämta platsen. Kontrollera platsbehörigheten.')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  }

  const friendName = (userId) => friends.find((friend) => friend?.userId === userId)?.displayName || 'Vän'

  return (
    <article className="social-room-card is-wide social-room-map-card">
      <div className="social-room-map-head">
        <div>
          <p className="social-room-eyebrow">Vänplats</p>
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

      {enabled && friendLocations.length ? (
        <>
          {friendLocations.length > 1 ? (
            <div className="social-room-player-options" role="group" aria-label="Välj vän på kartan">
              {friendLocations.map((entry) => (
                <button
                  aria-pressed={selected?.user_id === entry.user_id}
                  key={entry.user_id}
                  type="button"
                  onClick={() => setSelectedFriendId(entry.user_id)}
                >
                  {friendName(entry.user_id)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="social-room-map-frame">
            <iframe
              title={`${friendName(selected?.user_id)} på karta`}
              src={src}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <small>
            {friendName(selected?.user_id)} · noggrannhet cirka {Math.round(Number(selected?.accuracy_meters) || 0)} m.
          </small>
        </>
      ) : enabled ? (
        <div className="social-room-map-off">
          <strong>Ingen vän delar plats just nu.</strong>
          <small>En vän syns här först när den själv har slagit på sin karta.</small>
        </div>
      ) : (
        <div className="social-room-map-off" aria-hidden="true">🗺️</div>
      )}

      <small>Platsdelning är alltid frivillig och kan stängas av här när som helst.</small>
    </article>
  )
}

export default SocialRoomMap
