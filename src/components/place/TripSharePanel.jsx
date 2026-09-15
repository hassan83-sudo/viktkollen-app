import { useEffect, useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import { endTripShare, loadActiveTripShares, startTripShare } from '../../features/place/placeTripShareService.js'

function TripSharePanel({ familyMembers }) {
  const [shares, setShares] = useState([])
  const [userId, setUserId] = useState(null)
  const [viewerKey, setViewerKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function refresh() {
    const result = await loadActiveTripShares()
    setUserId(result.userId || null)
    setShares(Array.isArray(result.data) ? result.data : [])
    if (result.error) setNotice(result.error.message || 'Dela resa kunde inte hämtas.')
  }

  useEffect(() => { refresh() }, [])

  const choices = useMemo(() => (familyMembers || [])
    .filter((member) => member.user_id !== userId)
    .map((member) => ({
      key: `${member.family_id}:${member.user_id}`,
      familyId: member.family_id,
      userId: member.user_id,
      name: displayNameForUser(familyMembers, member.user_id),
    })), [familyMembers, userId])

  const ownShares = shares.filter((share) => share.owner_user_id === userId)
  const incomingShares = shares.filter((share) => share.viewer_user_id === userId)

  async function start() {
    const choice = choices.find((item) => item.key === viewerKey)
    if (!choice) { setNotice('Välj vem som får följa resan.'); return }
    setBusy(true); setNotice('')
    const result = await startTripShare({ familyId: choice.familyId, viewerUserId: choice.userId })
    if (result.error) setNotice(result.error.message || 'Resan kunde inte delas.')
    else { setNotice(`Resan delas nu med ${choice.name}.`); setViewerKey(''); await refresh() }
    setBusy(false)
  }

  async function stop(id) {
    setBusy(true); setNotice('')
    const result = await endTripShare(id)
    if (result.error) setNotice(result.error.message || 'Resan kunde inte avslutas.')
    else { setNotice('Resdelningen är avslutad.'); await refresh() }
    setBusy(false)
  }

  return <section className="family-map-history" aria-label="Dela resa">
    <div className="family-map-history-heading"><strong>🚶 Dela resa</strong></div>
    <p><small>Välj en familjemedlem som får följa din redan godkända delade position tills du avslutar resan.</small></p>
    {choices.length ? <><label className="family-map-frequency"><span>Dela med</span><select value={viewerKey} onChange={(event) => setViewerKey(event.target.value)} disabled={busy}><option value="">Välj familjemedlem</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.name}</option>)}</select></label><button type="button" onClick={start} disabled={busy || !viewerKey}>Starta Dela resa</button></> : <p>Ingen annan familjemedlem finns att dela resan med.</p>}
    {ownShares.map((share) => <article key={share.id} className="family-map-card-notice"><strong>🟢 Resa delas med {displayNameForUser(familyMembers, share.viewer_user_id)}</strong><br/><small>Startad {new Date(share.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><br/><button type="button" onClick={() => stop(share.id)} disabled={busy}>Avsluta resa</button></article>)}
    {incomingShares.map((share) => <p key={share.id} className="family-map-card-notice">📍 {displayNameForUser(familyMembers, share.owner_user_id)} delar en pågående resa med dig.</p>)}
    {notice ? <p className="family-map-card-notice" role="status">{notice}</p> : null}
  </section>
}

export default TripSharePanel
