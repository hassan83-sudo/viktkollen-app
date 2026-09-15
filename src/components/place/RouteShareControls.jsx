import { useEffect, useMemo, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import { loadMySharedRouteRecipients, revokeMySharedRoutes, shareRoutePoints } from '../../features/place/placeSharedRouteService.js'

function RouteShareControls({ familyId, familyMembers, ownerUserId, points }) {
  const [viewerUserId, setViewerUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeShares, setActiveShares] = useState([])
  const choices = useMemo(() => (familyMembers || [])
    .filter(member => member.family_id === familyId && member.user_id !== ownerUserId)
    .map(member => ({ userId: member.user_id, name: displayNameForUser(familyMembers, member.user_id) })), [familyId, familyMembers, ownerUserId])

  async function refreshShares(){const result=await loadMySharedRouteRecipients();if(!result.error)setActiveShares((result.data||[]).filter(row=>row.family_id===familyId))}
  useEffect(()=>{void refreshShares()},[familyId])

  async function share() {
    if (!viewerUserId || !points?.length) return
    setBusy(true); setNotice('')
    try {
      const result = await shareRoutePoints({ familyId, viewerUserId, points })
      if (result.error) setNotice(result.error.message || 'Rutten kunde inte delas.')
      else {
        const name = choices.find(choice => choice.userId === viewerUserId)?.name || 'familjemedlemmen'
        setNotice(`Rutten delas med ${name} i 7 dagar.`)
        await refreshShares()
      }
    } catch (error) { setNotice(error?.message || 'Rutten kunde inte delas.') }
    finally { setBusy(false) }
  }

  async function revoke(recipientUserId){setBusy(true);setNotice('');const result=await revokeMySharedRoutes(recipientUserId);if(result.error)setNotice(result.error.message||'Delningen kunde inte återkallas.');else{setNotice(`Ruttdelningen med ${displayNameForUser(familyMembers,recipientUserId)} är återkallad.`);await refreshShares()}setBusy(false)}

  if (!choices.length && !activeShares.length) return null
  return <div className="family-map-route-share">
    {choices.length?<><label className="family-map-frequency"><span>Dela denna rutt med</span><select value={viewerUserId} onChange={event=>setViewerUserId(event.target.value)} disabled={busy}><option value="">Välj familjemedlem</option>{choices.map(choice=><option key={choice.userId} value={choice.userId}>{choice.name}</option>)}</select></label>
    <button type="button" onClick={share} disabled={busy || !viewerUserId || !points?.length}>{busy?'Arbetar…':'Dela rutt'}</button>
    <small>Endast rutten för vald period delas. Delningen upphör automatiskt efter 7 dagar.</small></>:null}
    {activeShares.length?<div className="family-map-history"><strong>Aktiva ruttdelningar</strong>{activeShares.map(row=><p key={`${row.family_id}:${row.viewer_user_id}`} className="family-map-card-notice">{displayNameForUser(familyMembers,row.viewer_user_id)} · till {new Date(row.expires_at).toLocaleDateString()} <button type="button" onClick={()=>revoke(row.viewer_user_id)} disabled={busy}>Återkalla nu</button></p>)}</div>:null}
    {notice?<p className="family-map-card-notice" role="status">{notice}</p>:null}
  </div>
}

export default RouteShareControls
