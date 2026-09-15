import { useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import { shareRoutePoints } from '../../features/place/placeSharedRouteService.js'

function RouteShareControls({ familyId, familyMembers, ownerUserId, points }) {
  const [viewerUserId, setViewerUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const choices = useMemo(() => (familyMembers || [])
    .filter(member => member.family_id === familyId && member.user_id !== ownerUserId)
    .map(member => ({ userId: member.user_id, name: displayNameForUser(familyMembers, member.user_id) })), [familyId, familyMembers, ownerUserId])

  async function share() {
    if (!viewerUserId || !points?.length) return
    setBusy(true); setNotice('')
    try {
      const result = await shareRoutePoints({ familyId, viewerUserId, points })
      if (result.error) setNotice(result.error.message || 'Rutten kunde inte delas.')
      else {
        const name = choices.find(choice => choice.userId === viewerUserId)?.name || 'familjemedlemmen'
        setNotice(`Rutten delas med ${name} i 7 dagar.`)
      }
    } catch (error) { setNotice(error?.message || 'Rutten kunde inte delas.') }
    finally { setBusy(false) }
  }

  if (!choices.length) return null
  return <div className="family-map-route-share">
    <label className="family-map-frequency"><span>Dela denna rutt med</span><select value={viewerUserId} onChange={event=>setViewerUserId(event.target.value)} disabled={busy}><option value="">Välj familjemedlem</option>{choices.map(choice=><option key={choice.userId} value={choice.userId}>{choice.name}</option>)}</select></label>
    <button type="button" onClick={share} disabled={busy || !viewerUserId || !points?.length}>{busy?'Delar…':'Dela rutt'}</button>
    <small>Endast rutten för vald period delas. Delningen upphör automatiskt efter 7 dagar.</small>
    {notice?<p className="family-map-card-notice" role="status">{notice}</p>:null}
  </div>
}

export default RouteShareControls
