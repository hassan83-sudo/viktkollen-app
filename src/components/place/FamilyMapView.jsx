import { useEffect, useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import { loadFamilyLatestLocations } from '../../features/place/placeFamilyMapService.js'
import { loadOwnPlaceHistory } from '../../features/place/placeHistoryService.js'
import { supabase } from '../../services/supabaseClient.js'
import './SchoolCardEnhancer.js'
import './FamilyMapView.css'

const positionFrequencyOptions = [['live', 'Live'], ['10m', '10 min'], ['30m', '30 min'], ['1h', '1 timme'], ['battery', 'Batterispar']]
const historyPeriods = [['today', 'Idag'], ['yesterday', 'Igår'], ['7d', '7 dagar'], ['30d', '30 dagar']]

function locationKey(location) { return `${location.family_id}:${location.user_id}` }

function mapUrlForLocation(location) {
  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  const latitudePadding = 0.006
  const longitudePadding = Math.max(0.008, latitudePadding / Math.max(Math.cos(latitude * Math.PI / 180), 0.35))
  const params = new URLSearchParams({ bbox: [longitude - longitudePadding, latitude - latitudePadding, longitude + longitudePadding, latitude + latitudePadding].join(','), layer: 'mapnik', marker: `${latitude},${longitude}` })
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

function historyPointDate(point) { return new Date(point.recordedAt || point.created_at) }
function pointInPeriod(point, period) {
  const date = historyPointDate(point)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  if (period === 'today') return date >= todayStart
  if (period === 'yesterday') return date >= yesterdayStart && date < todayStart
  return date >= new Date(now.getTime() - (period === '30d' ? 30 : 7) * 86400000)
}

function FamilyMapView({ locations, familyMembers }) {
  const [liveLocations, setLiveLocations] = useState(locations || [])
  const [selectedKey, setSelectedKey] = useState(() => locations?.[0] ? locationKey(locations[0]) : '')
  const [positionFrequency, setPositionFrequency] = useState('30m')
  const [cardNotice, setCardNotice] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPeriod, setHistoryPeriod] = useState('today')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [followLive, setFollowLive] = useState(false)
  const [liveError, setLiveError] = useState('')

  useEffect(() => { if (!followLive) setLiveLocations(locations || []) }, [locations, followLive])

  const validLocations = useMemo(() => {
    const seen = new Set()
    return (liveLocations || []).filter((location) => {
      if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return false
      const key = locationKey(location)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [liveLocations])

  const entries = useMemo(() => {
    const baseNames = validLocations.map((location) => location.display_name || displayNameForUser(familyMembers, location.user_id))
    const totals = baseNames.reduce((counts, name) => ({ ...counts, [name]: (counts[name] || 0) + 1 }), {})
    const seen = {}
    return validLocations.map((location, index) => {
      const baseName = baseNames[index]
      seen[baseName] = (seen[baseName] || 0) + 1
      return { location, key: locationKey(location), label: totals[baseName] > 1 ? `${baseName} ${seen[baseName]}` : baseName }
    })
  }, [familyMembers, validLocations])

  useEffect(() => {
    if (!entries.length) { setSelectedKey(''); return }
    if (!entries.some((entry) => entry.key === selectedKey)) setSelectedKey(entries[0].key)
  }, [entries, selectedKey])

  useEffect(() => {
    if (!followLive) return undefined
    let cancelled = false
    let busy = false
    async function refresh() {
      if (busy) return
      busy = true
      try {
        const result = await loadFamilyLatestLocations()
        if (cancelled) return
        if (result.error) setLiveError(result.error.message || 'Livepositionen kunde inte uppdateras.')
        else {
          setLiveLocations(Array.isArray(result.data) ? result.data : [])
          setLiveError('')
        }
      } catch (error) {
        if (!cancelled) setLiveError(error?.message || 'Livepositionen kunde inte uppdateras.')
      } finally { busy = false }
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [followLive])

  if (!entries.length) return null
  const selectedEntry = entries.find((entry) => entry.key === selectedKey) || entries[0]
  const selectedLocation = selectedEntry.location
  const updatedLabel = relativeUpdatedAt(selectedLocation.location_recorded_at)
  const isLive = selectedLocation.location_recorded_at ? Date.now() - new Date(selectedLocation.location_recorded_at).getTime() < 120000 : false
  const visibleHistory = history.filter((point) => !point.locked && pointInPeriod(point, historyPeriod))

  async function openHistory() {
    setCardNotice(''); setHistoryOpen(true); setHistoryLoading(true); setHistoryError('')
    try {
      const sessionResult = await supabase?.auth.getSession()
      const ownUserId = sessionResult?.data?.session?.user?.id || null
      if (!ownUserId || selectedLocation.user_id !== ownUserId) {
        setHistory([]); setHistoryError('Familjemedlemmens historik delas inte ännu. Endast din egen krypterade historik kan visas säkert.'); return
      }
      const result = await loadOwnPlaceHistory()
      setHistory(Array.isArray(result.data) ? result.data : [])
      setHistoryError(result.error?.message || '')
    } catch (error) { setHistory([]); setHistoryError(error?.message || 'Historiken kunde inte hämtas.') }
    finally { setHistoryLoading(false) }
  }

  function toggleFollowLive() {
    setHistoryOpen(false); setCardNotice(''); setLiveError('')
    setFollowLive((current) => !current)
  }

  return <div className={`family-map-view${followLive ? ' is-following-live' : ''}`}>
    {entries.length > 1 ? <div className="family-map-person-switcher" aria-label="Välj familjemedlem på kartan">{entries.map((entry) => <button key={entry.key} type="button" aria-pressed={entry.key === selectedEntry.key} onClick={() => { setSelectedKey(entry.key); setHistoryOpen(false); setCardNotice('') }}>📍 {entry.label}</button>)}</div> : null}
    {followLive ? <div className="family-map-live-bar"><strong>🟢 Följer live · {selectedEntry.label}</strong><span>Uppdaterar var 5:e sekund medan kartan är öppen</span></div> : null}
    <div className="family-map-frame"><iframe key={`${selectedEntry.key}:${selectedLocation.location_recorded_at || ''}`} title={`Karta – ${selectedEntry.label}`} src={mapUrlForLocation(selectedLocation)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
    {liveError ? <p className="family-map-card-notice" role="alert">{liveError}</p> : null}
    <article className="family-map-person-card" aria-live="polite">
      <div className="family-map-person-card-heading"><strong>{selectedEntry.label}</strong><span className={isLive ? 'is-live' : ''}>{isLive ? '🟢 LIVE' : 'Senaste position'}</span></div>
      <p>📍 Delad position</p><small>Senast uppdaterad: {updatedLabel}</small>
      {selectedLocation.accuracy_meters != null ? <small>Noggrannhet ±{Math.round(selectedLocation.accuracy_meters)} m</small> : null}
      <div className="family-map-person-actions"><button type="button" aria-pressed={followLive} onClick={toggleFollowLive}>{followLive ? 'Sluta följa' : 'Följ live'}</button><button type="button" onClick={() => setCardNotice('Prata kopplas in när röstfunktionen är klar.')}>Prata</button><button type="button" onClick={openHistory}>Historik</button></div>
      <label className="family-map-frequency"><span>Positionsfrekvens</span><select value={positionFrequency} onChange={(event) => setPositionFrequency(event.target.value)}>{positionFrequencyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {cardNotice ? <p className="family-map-card-notice" role="status">{cardNotice}</p> : null}
    </article>
    {historyOpen ? <section className="family-map-history" aria-label={`Historik – ${selectedEntry.label}`}><div className="family-map-history-heading"><strong>Historik · {selectedEntry.label}</strong><button type="button" onClick={() => setHistoryOpen(false)}>Stäng</button></div><div className="family-map-history-periods">{historyPeriods.map(([value, label]) => <button key={value} type="button" aria-pressed={historyPeriod === value} onClick={() => setHistoryPeriod(value)}>{label}</button>)}</div>{historyLoading ? <p>Hämtar historik…</p> : null}{historyError ? <p className="family-map-card-notice" role="status">{historyError}</p> : null}{!historyLoading && !historyError && visibleHistory.length === 0 ? <p>Ingen sparad position under perioden.</p> : null}{visibleHistory.length ? <div className="family-map-history-list">{visibleHistory.map((point) => <article key={point.id}><strong>{historyPointDate(point).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><span>📍 {Number(point.latitude).toFixed(5)}, {Number(point.longitude).toFixed(5)}</span>{point.accuracyMeters != null ? <small>±{Math.round(point.accuracyMeters)} m</small> : null}</article>)}</div> : null}</section> : null}
    <div className="family-map-selected"><strong>Position</strong><span>{Number(selectedLocation.latitude).toFixed(5)}, {Number(selectedLocation.longitude).toFixed(5)}</span></div>
    <p className="family-map-provider-note"><small>Kartan visas av OpenStreetMap. Endast området runt den valda delade positionen begärs när kartan öppnas.</small></p>
  </div>
}

export default FamilyMapView